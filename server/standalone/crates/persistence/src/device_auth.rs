//! Installation proof authenticates an account; it never becomes an authorization principal.
use super::*;
use anyhow::ensure;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ring::signature::{ED25519, UnparsedPublicKey};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceChallenge {
    pub nonce: String,
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DeviceAccount {
    pub id: Uuid,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use ring::{
        rand::SystemRandom,
        signature::{Ed25519KeyPair, KeyPair},
    };

    async fn sign(
        db: &Database,
        key: &Ed25519KeyPair,
        purpose: &str,
        user: Option<Uuid>,
    ) -> (String, String) {
        let nonce = db
            .device_challenge(
                &URL_SAFE_NO_PAD.encode(key.public_key().as_ref()),
                purpose,
                user,
            )
            .await
            .unwrap()
            .nonce;
        let signature = URL_SAFE_NO_PAD.encode(key.sign(nonce.as_bytes()).as_ref());
        (nonce, signature)
    }

    #[tokio::test]
    #[ignore = "requires isolated COLAB_DEVICE_TEST_DATABASE_URL"]
    async fn account_device_lifecycle() {
        let db = Database::connect(&std::env::var("COLAB_DEVICE_TEST_DATABASE_URL").unwrap(), 5)
            .await
            .unwrap();
        let key = Ed25519KeyPair::from_pkcs8(
            Ed25519KeyPair::generate_pkcs8(&SystemRandom::new())
                .unwrap()
                .as_ref(),
        )
        .unwrap();
        let other = Ed25519KeyPair::from_pkcs8(
            Ed25519KeyPair::generate_pkcs8(&SystemRandom::new())
                .unwrap()
                .as_ref(),
        )
        .unwrap();
        let (nonce, signature) = sign(&db, &key, "discover", None).await;
        let accounts = db
            .discover_device_accounts(&nonce, &signature, "Test device")
            .await
            .unwrap();
        assert_eq!(accounts.len(), 1);
        assert!(
            db.discover_device_accounts(&nonce, &signature, "Test device")
                .await
                .is_err(),
            "replayed proof"
        );
        let user = accounts[0].id;
        let concurrent = Ed25519KeyPair::from_pkcs8(
            Ed25519KeyPair::generate_pkcs8(&SystemRandom::new())
                .unwrap()
                .as_ref(),
        )
        .unwrap();
        let (nonce_a, signature_a) = sign(&db, &concurrent, "discover", None).await;
        let (nonce_b, signature_b) = sign(&db, &concurrent, "discover", None).await;
        let (a, b) = tokio::join!(
            db.discover_device_accounts(&nonce_a, &signature_a, "Concurrent device"),
            db.discover_device_accounts(&nonce_b, &signature_b, "Concurrent device")
        );
        assert_eq!(
            a.unwrap()[0].id,
            b.unwrap()[0].id,
            "concurrent bootstrap creates one account"
        );
        let (nonce, signature) = sign(&db, &key, "discover", None).await;
        assert_eq!(
            db.discover_device_accounts(&nonce, &signature, "Test device")
                .await
                .unwrap()[0]
                .id,
            user,
            "repeat bootstrap creates no account"
        );
        let (nonce, _) = sign(&db, &key, "login", Some(user)).await;
        let wrong = URL_SAFE_NO_PAD.encode(other.sign(nonce.as_bytes()).as_ref());
        assert!(
            db.login_with_device(user, &nonce, &wrong).await.is_err(),
            "wrong key"
        );
        let (nonce, signature) = sign(&db, &key, "discover", None).await;
        assert!(
            db.login_with_device(user, &nonce, &signature)
                .await
                .is_err(),
            "wrong purpose"
        );
        let (nonce, signature) = sign(&db, &key, "login", Some(user)).await;
        assert!(
            db.login_with_device(Uuid::new_v4(), &nonce, &signature)
                .await
                .is_err(),
            "wrong account"
        );
        let (nonce, signature) = sign(&db, &key, "login", Some(user)).await;
        sqlx::query("update device_login_challenges set expires_at=now()-interval '1 second' where nonce=$1").bind(&nonce).execute(&db.pool).await.unwrap();
        assert!(
            db.login_with_device(user, &nonce, &signature)
                .await
                .is_err(),
            "expired proof"
        );
        let (nonce, signature) = sign(&db, &key, "login", Some(user)).await;
        let session = db
            .login_with_device(user, &nonce, &signature)
            .await
            .unwrap();
        assert_eq!(
            db.authenticate(&session.access_token).await.unwrap(),
            Some(user)
        );
        let devices = db.list_login_devices(user, "").await.unwrap();
        assert!(
            db.unbind_login_device(user, devices[0].id).await.is_err(),
            "last credential protected"
        );
        let linked = db
            .create_google_session(
                &format!("test-{}", Uuid::new_v4()),
                &format!("{}@example.test", Uuid::new_v4()),
                Some("Google owner"),
                None,
                Some(user),
            )
            .await
            .unwrap();
        assert_eq!(
            linked.user.id, user,
            "Google links without replacing account"
        );
        let (nonce, signature) = sign(&db, &other, "bind", Some(user)).await;
        db.bind_login_device(user, &nonce, &signature, "Other device", None)
            .await
            .unwrap();
        assert!(db.unbind_login_device(user, devices[0].id).await.unwrap());
        assert_eq!(
            db.authenticate(&session.access_token).await.unwrap(),
            None,
            "revokes device access"
        );
        assert!(
            db.refresh_session(&session.refresh_token).await.is_err(),
            "revokes device refresh"
        );
        let (nonce, signature) = sign(&db, &key, "discover", None).await;
        assert!(
            db.discover_device_accounts(&nonce, &signature, "Test device")
                .await
                .unwrap()
                .is_empty(),
            "revoked device cannot create replacement account"
        );
        let another = db
            .create_google_session(
                &format!("test-{}", Uuid::new_v4()),
                &format!("{}@example.test", Uuid::new_v4()),
                Some("Another account"),
                None,
                None,
            )
            .await
            .unwrap()
            .user
            .id;
        let (nonce, signature) = sign(&db, &other, "bind", Some(another)).await;
        db.bind_login_device(another, &nonce, &signature, "Other device", None)
            .await
            .unwrap();
        let (nonce, signature) = sign(&db, &other, "discover", None).await;
        assert_eq!(
            db.discover_device_accounts(&nonce, &signature, "Other device")
                .await
                .unwrap()
                .len(),
            2,
            "multiple account discovery"
        );
        let channel:Uuid=sqlx::query_scalar("select c.id from channels c join channel_members cm on cm.channel_id=c.id join organization_members om on om.id=cm.organization_member_id where om.user_id=$1 limit 1").bind(user).fetch_one(&db.pool).await.unwrap();
        assert!(
            db.create_invite_link(another, channel)
                .await
                .unwrap()
                .is_none()
        );
        let invite = db.create_invite_link(user, channel).await.unwrap().unwrap();
        assert_eq!(
            db.accept_invite_link(another, &invite.token)
                .await
                .unwrap()
                .unwrap()
                .channel_id,
            channel
        );
        assert!(
            db.accept_invite_link(another, &invite.token)
                .await
                .unwrap()
                .is_some(),
            "idempotent join"
        );
        assert!(
            !db.revoke_invite_link(another, invite.id).await.unwrap(),
            "member cannot revoke"
        );
        sqlx::query(
            "update channel_invite_links set expires_at=now()-interval '1 second' where id=$1",
        )
        .bind(invite.id)
        .execute(&db.pool)
        .await
        .unwrap();
        assert!(
            db.accept_invite_link(another, &invite.token)
                .await
                .unwrap()
                .is_none(),
            "expired invite"
        );
        let subject = format!("existing-{}", Uuid::new_v4());
        let email = format!("{}@example.test", Uuid::new_v4());
        let existing = db
            .create_google_session(&subject, &email, Some("Existing"), None, None)
            .await
            .unwrap();
        let selected = db
            .create_google_session(&subject, &email, Some("Existing"), None, Some(user))
            .await
            .unwrap();
        assert_eq!(
            selected.user.id, existing.user.id,
            "existing Google identity does not merge accounts"
        );
        assert_ne!(selected.user.id, user);
    }
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct LoginDevice {
    pub id: Uuid,
    pub name: String,
    pub current: bool,
    pub bound_at: String,
    pub last_used_at: Option<String>,
}

impl Database {
    pub async fn device_challenge(
        &self,
        public_key: &str,
        purpose: &str,
        user_id: Option<Uuid>,
    ) -> anyhow::Result<DeviceChallenge> {
        ensure!(
            URL_SAFE_NO_PAD.decode(public_key)?.len() == 32,
            "invalid device key"
        );
        ensure!(
            matches!(purpose, "discover" | "login" | "bind"),
            "invalid purpose"
        );
        ensure!(
            purpose == "discover" || user_id.is_some(),
            "account required"
        );
        ensure!(
            purpose != "discover" || user_id.is_none(),
            "unexpected account"
        );
        let nonce = new_token("colab_device_");
        let mut tx = self.pool.begin().await?;
        sqlx::query("delete from device_login_challenges where expires_at < now()")
            .execute(&mut *tx)
            .await?;
        let outstanding: i64 =
            sqlx::query_scalar("select count(*) from device_login_challenges where public_key=$1")
                .bind(public_key)
                .fetch_one(&mut *tx)
                .await?;
        ensure!(outstanding < 10, "too many outstanding device challenges");
        sqlx::query("insert into device_login_challenges(nonce,public_key,purpose,user_id) values($1,$2,$3,$4)")
            .bind(&nonce).bind(public_key).bind(purpose).bind(user_id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(DeviceChallenge { nonce })
    }

    async fn consume_device_proof(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        nonce: &str,
        signature: &str,
        purpose: &str,
        user_id: Option<Uuid>,
    ) -> anyhow::Result<String> {
        let key: Option<String> = sqlx::query_scalar("select public_key from device_login_challenges where nonce=$1 and purpose=$2 and user_id is not distinct from $3 and expires_at>now() for update")
            .bind(nonce).bind(purpose).bind(user_id).fetch_optional(&mut **tx).await?;
        let key = key.ok_or_else(|| anyhow::anyhow!("invalid or expired device challenge"))?;
        let public = URL_SAFE_NO_PAD.decode(&key)?;
        let signature = URL_SAFE_NO_PAD.decode(signature)?;
        UnparsedPublicKey::new(&ED25519, public)
            .verify(nonce.as_bytes(), &signature)
            .map_err(|_| anyhow::anyhow!("invalid device proof"))?;
        sqlx::query("delete from device_login_challenges where nonce=$1")
            .bind(nonce)
            .execute(&mut **tx)
            .await?;
        // Discovery/bootstrap and binding of the same key must not race into duplicate accounts.
        sqlx::query("select pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(&key)
            .execute(&mut **tx)
            .await?;
        Ok(key)
    }

    pub async fn discover_device_accounts(
        &self,
        nonce: &str,
        signature: &str,
        name: &str,
    ) -> anyhow::Result<Vec<DeviceAccount>> {
        ensure!(
            !name.trim().is_empty() && name.chars().count() <= 80,
            "invalid device name"
        );
        let mut tx = self.pool.begin().await?;
        let key = self
            .consume_device_proof(&mut tx, nonce, signature, "discover", None)
            .await?;
        let device: Option<Uuid> =
            sqlx::query_scalar("select id from login_devices where public_key=$1")
                .bind(&key)
                .fetch_optional(&mut *tx)
                .await?;
        let device_id = if let Some(id) = device {
            id
        } else {
            let device_id = Uuid::new_v4();
            let user_id = Uuid::new_v4();
            let member_id = Uuid::new_v4();
            let channel_id = Uuid::new_v4();
            sqlx::query("insert into login_devices(id,public_key,name) values($1,$2,$3)")
                .bind(device_id)
                .bind(&key)
                .bind(name.trim())
                .execute(&mut *tx)
                .await?;
            // Existing schemas require a unique email string. This reserved, non-deliverable
            // address is not an external identity and must never be used as an auth credential.
            sqlx::query("insert into users(id,email,display_name) values($1,$2,$3)")
                .bind(user_id)
                .bind(format!("{}@device.invalid", user_id.simple()))
                .bind(name.trim())
                .execute(&mut *tx)
                .await?;
            sqlx::query(
                "insert into organizations(id,name,slug,created_by) values($1,'Personal',$2,$1)",
            )
            .bind(user_id)
            .bind(format!("personal-{}", user_id.simple()))
            .execute(&mut *tx)
            .await?;
            sqlx::query("insert into organization_members(id,organization_id,user_id,role) values($1,$2,$2,'owner')").bind(member_id).bind(user_id).execute(&mut *tx).await?;
            sqlx::query("insert into channels(id,organization_id,name,created_by_member_id) values($1,$2,'My workspace',$3)").bind(channel_id).bind(user_id).bind(member_id).execute(&mut *tx).await?;
            sqlx::query("insert into channel_members(channel_id,organization_id,organization_member_id,role) values($1,$2,$3,'owner')").bind(channel_id).bind(user_id).bind(member_id).execute(&mut *tx).await?;
            sqlx::query("insert into account_devices(user_id,device_id) values($1,$2)")
                .bind(user_id)
                .bind(device_id)
                .execute(&mut *tx)
                .await?;
            device_id
        };
        let accounts = sqlx::query_as::<_,DeviceAccount>("select u.id,u.display_name,u.avatar_url from account_devices ad join users u on u.id=ad.user_id where ad.device_id=$1 and ad.revoked_at is null order by ad.bound_at,u.id")
            .bind(device_id).fetch_all(&mut *tx).await?;
        tx.commit().await?;
        Ok(accounts)
    }

    pub async fn bind_login_device(
        &self,
        user_id: Uuid,
        nonce: &str,
        signature: &str,
        name: &str,
        access_token: Option<&str>,
    ) -> anyhow::Result<()> {
        ensure!(
            !name.trim().is_empty() && name.chars().count() <= 80,
            "invalid device name"
        );
        let mut tx = self.pool.begin().await?;
        let key = self
            .consume_device_proof(&mut tx, nonce, signature, "bind", Some(user_id))
            .await?;
        let device_id: Uuid = sqlx::query_scalar("insert into login_devices(id,public_key,name) values($1,$2,$3) on conflict(public_key) do update set name=excluded.name returning id")
            .bind(Uuid::new_v4()).bind(key).bind(name.trim()).fetch_one(&mut *tx).await?;
        // Explicit authenticated binding can re-authorize a revoked installation; discovery cannot.
        sqlx::query("insert into account_devices(user_id,device_id) values($1,$2) on conflict(user_id,device_id) do update set revoked_at=null,bound_at=now()")
            .bind(user_id).bind(device_id).execute(&mut *tx).await?;
        // Authenticated binding attributes the current Google/legacy session to this device,
        // so unbinding cannot leave its old saved session usable by background runtimes.
        if let Some(token) = access_token {
            sqlx::query("update sessions set login_device_id=$3 where user_id=$1 and access_token_hash=$2 and revoked_at is null")
                .bind(user_id).bind(token_hash(token)).bind(device_id).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn login_with_device(
        &self,
        user_id: Uuid,
        nonce: &str,
        signature: &str,
    ) -> anyhow::Result<CreatedSession> {
        let mut tx = self.pool.begin().await?;
        let key = self
            .consume_device_proof(&mut tx, nonce, signature, "login", Some(user_id))
            .await?;
        let device_id: Option<Uuid> = sqlx::query_scalar("select ad.device_id from account_devices ad join login_devices d on d.id=ad.device_id where ad.user_id=$1 and d.public_key=$2 and ad.revoked_at is null for update of ad")
            .bind(user_id).bind(key).fetch_optional(&mut *tx).await?;
        let device_id = device_id.ok_or_else(|| anyhow::anyhow!("device not bound to account"))?;
        let (email, display_name, avatar_url) =
            sqlx::query_as::<_, (String, Option<String>, Option<String>)>(
                "select email,display_name,avatar_url from users where id=$1",
            )
            .bind(user_id)
            .fetch_one(&mut *tx)
            .await?;
        let access_token = new_token("colab_at_");
        let refresh_token = new_token("colab_rt_");
        let session_id = Uuid::new_v4();
        sqlx::query("insert into sessions(id,user_id,access_token_hash,refresh_token_hash,expires_at,login_device_id) values($1,$2,$3,$4,now()+interval '30 days',$5)")
            .bind(session_id).bind(user_id).bind(token_hash(&access_token)).bind(token_hash(&refresh_token)).bind(device_id).execute(&mut *tx).await?;
        sqlx::query(
            "insert into session_refresh_tokens(token_hash,session_id,generation) values($1,$2,0)",
        )
        .bind(token_hash(&refresh_token))
        .bind(session_id)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "update account_devices set last_used_at=now() where user_id=$1 and device_id=$2",
        )
        .bind(user_id)
        .bind(device_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(CreatedSession {
            access_token,
            refresh_token,
            expires_in: 2_592_000,
            expires_at: unix_time_after(2_592_000),
            user: AuthenticatedUser {
                id: user_id,
                email,
                display_name,
                avatar_url,
            },
        })
    }

    pub async fn list_login_devices(
        &self,
        user_id: Uuid,
        current_key: &str,
    ) -> anyhow::Result<Vec<LoginDevice>> {
        Ok(sqlx::query_as("select d.id,d.name,(d.public_key=$2) as current,ad.bound_at::text,ad.last_used_at::text from account_devices ad join login_devices d on d.id=ad.device_id where ad.user_id=$1 and ad.revoked_at is null order by ad.bound_at")
            .bind(user_id).bind(current_key).fetch_all(&self.pool).await?)
    }

    pub async fn unbind_login_device(
        &self,
        user_id: Uuid,
        device_id: Uuid,
    ) -> anyhow::Result<bool> {
        let mut tx = self.pool.begin().await?;
        // Account row serializes simultaneous removals of different devices.
        sqlx::query("select id from users where id=$1 for update")
            .bind(user_id)
            .execute(&mut *tx)
            .await?;
        let credentials:i64 = sqlx::query_scalar("select (select count(*) from auth_identities where user_id=$1)+(select count(*) from account_devices where user_id=$1 and revoked_at is null)").bind(user_id).fetch_one(&mut *tx).await?;
        ensure!(
            credentials > 1,
            "cannot remove the last account credential; bind Google first"
        );
        let changed = sqlx::query("update account_devices set revoked_at=now() where user_id=$1 and device_id=$2 and revoked_at is null").bind(user_id).bind(device_id).execute(&mut *tx).await?.rows_affected()>0;
        sqlx::query("update sessions set revoked_at=coalesce(revoked_at,now()) where user_id=$1 and login_device_id=$2").bind(user_id).bind(device_id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(changed)
    }
}
