//! Deployment policy constrains login renewal; device proofs cannot extend an SSO lease.
use super::*;
#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalPolicy {
    pub provider: String,
    pub organization_id: Uuid,
    pub organization_name: String,
    #[serde(default)] pub administrator_subjects: Vec<String>,
    pub login_lifetime_seconds: i64,
}
impl Database {
    pub fn with_external_policy(mut self, policy: Option<ExternalPolicy>) -> Self { self.external_policy = policy; self }
    pub async fn authenticate_for_identity_link(&self, token: &str) -> anyhow::Result<Option<Uuid>> {
        // Linking proves both credentials. Legacy sessions may enter only this SSO exchange,
        // never business APIs, so enabling SSO does not strand existing anonymous account data.
        sqlx::query_scalar("select user_id from sessions where access_token_hash=$1 and revoked_at is null and expires_at>now()")
            .bind(token_hash(token)).fetch_optional(&self.pool).await.map_err(Into::into)
    }
    pub(super) async fn external_login_allowed(&self, user: Uuid) -> anyhow::Result<bool> {
        let Some(policy) = &self.external_policy else { return Ok(true); };
        sqlx::query_scalar("select exists(select 1 from external_login_leases where user_id=$1 and provider=$2 and expires_at>now())")
            .bind(user).bind(&policy.provider).fetch_one(&self.pool).await.map_err(Into::into)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
    use ring::{rand::SystemRandom, signature::{Ed25519KeyPair, KeyPair}};
    async fn proof(db: &Database, key: &Ed25519KeyPair, purpose: &str, user: Option<Uuid>) -> (String, String) {
        let nonce = db.device_challenge(&URL_SAFE_NO_PAD.encode(key.public_key().as_ref()), purpose, user).await.unwrap().nonce;
        let signature = URL_SAFE_NO_PAD.encode(key.sign(nonce.as_bytes()).as_ref());
        (nonce, signature)
    }
    #[tokio::test]
    #[ignore = "requires isolated COLAB_DEVICE_TEST_DATABASE_URL"]
    async fn external_identity_preserves_account_and_bounds_device_renewal() {
        let db = Database::connect(&std::env::var("COLAB_DEVICE_TEST_DATABASE_URL").unwrap(), 5).await.unwrap();
        let key = Ed25519KeyPair::from_pkcs8(Ed25519KeyPair::generate_pkcs8(&SystemRandom::new()).unwrap().as_ref()).unwrap();
        let (nonce, sig) = proof(&db,&key,"discover",None).await;
        let user = db.discover_device_accounts(&nonce,&sig,"Enterprise test device").await.unwrap()[0].id;
        let (nonce,sig) = proof(&db,&key,"login",Some(user)).await;
        let old = db.login_with_device(user,&nonce,&sig).await.unwrap();
        db.set_account_name(user,"Custom name").await.unwrap();
        db.set_account_avatar(user,Some("data:image/jpeg;base64,/9j//9k=")).await.unwrap();
        let strict = db.clone().with_external_policy(Some(ExternalPolicy { provider: "enterprise-test".into(), organization_id: user, organization_name: "Enterprise".into(), administrator_subjects: vec![], login_lifetime_seconds: 300 }));
        assert!(strict.authenticate(&old.access_token).await.unwrap().is_none());
        assert_eq!(strict.authenticate_for_identity_link(&old.access_token).await.unwrap(),Some(user));
        let identity = format!("employee-{}",Uuid::new_v4());
        let session = strict.create_identity_session("enterprise-test",&identity,&format!("{identity}@example.test"),Some("Employee"),None,Some(user)).await.unwrap();
        assert_eq!(session.user.display_name.as_deref(),Some("Employee"));
        assert_eq!(session.user.avatar_url,None);
        assert!(strict.account_profile(user).await.unwrap().profile_managed);
        assert!(!strict.account_profile(user).await.unwrap().name_customized);
        assert!(strict.set_account_name(user,"Override").await.is_err());
        assert!(strict.set_account_avatar(user,None).await.is_err());
        let refreshed=strict.create_identity_session("enterprise-test",&identity,&format!("{identity}@example.test"),Some("Updated employee"),Some("https://example.test/corporate.jpg"),None).await.unwrap();
        assert_eq!(refreshed.user.display_name.as_deref(),Some("Updated employee"));
        assert_eq!(refreshed.user.avatar_url.as_deref(),Some("https://example.test/corporate.jpg"));
        assert_eq!(session.user.id,user,"explicit linking preserves stable account UUID");
        assert_eq!(strict.list_organizations(user).await.unwrap().len(),1);
        assert!(strict.create_organization(user,"Other").await.is_err());
        assert!(strict.create_google_session("google-sub","google@example.test",None,None,None).await.is_err());
        let (nonce,sig) = proof(&strict,&key,"login",Some(user)).await;
        let device_session = strict.login_with_device(user,&nonce,&sig).await.unwrap();
        assert_eq!(strict.authenticate(&device_session.access_token).await.unwrap(),Some(user));
        sqlx::query("update external_login_leases set expires_at=now()-interval '1 second' where user_id=$1").bind(user).execute(&db.pool).await.unwrap();
        assert!(strict.authenticate(&device_session.access_token).await.unwrap().is_none());
        assert!(strict.refresh_session(&device_session.refresh_token).await.is_err());
        let (nonce,sig) = proof(&strict,&key,"login",Some(user)).await;
        assert!(strict.login_with_device(user,&nonce,&sig).await.is_err());
        let new_key=Ed25519KeyPair::from_pkcs8(Ed25519KeyPair::generate_pkcs8(&SystemRandom::new()).unwrap().as_ref()).unwrap();
        let (nonce,sig)=proof(&strict,&new_key,"discover",None).await;
        assert!(strict.discover_device_accounts(&nonce,&sig,"Unregistered device").await.unwrap().is_empty());
        assert!(db.authenticate(&old.access_token).await.unwrap().is_some(),"unconfigured public deployment preserves device auth");
    }
}
