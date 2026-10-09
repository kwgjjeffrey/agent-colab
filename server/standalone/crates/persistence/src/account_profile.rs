use super::*;

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AccountProfile {
    pub id: Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub name_customized: bool,
    pub google_linked: bool,
    pub profile_managed: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore = "requires isolated COLAB_DEVICE_TEST_DATABASE_URL"]
    async fn explicit_name_survives_google_link_and_login() {
        let db = Database::connect(&std::env::var("COLAB_DEVICE_TEST_DATABASE_URL").unwrap(), 2).await.unwrap();
        let user = Uuid::new_v4();
        sqlx::query("insert into users(id,email,display_name) values($1,$2,'My device')")
            .bind(user).bind(format!("{}@device.invalid", user.simple())).execute(&db.pool).await.unwrap();
        let profile = db.account_profile(user).await.unwrap();
        assert!(!profile.google_linked && !profile.name_customized);
        db.set_account_name(user, "My chosen name").await.unwrap();
        let avatar = "data:image/jpeg;base64,/9j//9k=";
        db.set_account_avatar(user, Some(avatar)).await.unwrap();
        let subject = format!("profile-test-{user}");
        let email = format!("{user}@example.test");
        let linked = db.create_google_session(&subject, &email, Some("Google name"), None, Some(user)).await.unwrap();
        assert_eq!(linked.user.id, user);
        assert_eq!(linked.user.display_name.as_deref(), Some("My chosen name"));
        assert_eq!(linked.user.avatar_url.as_deref(), Some(avatar));
        let signed_in = db.create_google_session(&subject, &email, Some("Another Google name"), None, None).await.unwrap();
        assert_eq!(signed_in.user.id, user);
        assert_eq!(signed_in.user.display_name.as_deref(), Some("My chosen name"));
        assert_eq!(signed_in.user.avatar_url.as_deref(), Some(avatar));
        db.set_account_avatar(user, None).await.unwrap();
        let signed_in = db.create_google_session(&subject, &email, None, Some("https://example.test/provider.jpg"), None).await.unwrap();
        assert_eq!(signed_in.user.avatar_url, None);
        let profile = db.account_profile(user).await.unwrap();
        assert!(profile.google_linked && profile.name_customized);
    }
}

impl Database {
    pub fn profile_managed(&self) -> bool { self.external_policy.is_some() }
    pub async fn set_account_avatar(&self, user: Uuid, avatar: Option<&str>) -> anyhow::Result<AccountProfile> {
        anyhow::ensure!(!self.profile_managed(), "profile managed by identity provider");
        // Explicit initials are a choice too: later provider login must not replace them.
        sqlx::query("update users set avatar_url=$2,avatar_customized=true,updated_at=now() where id=$1")
            .bind(user).bind(avatar).execute(&self.pool).await?;
        self.account_profile(user).await
    }
    pub async fn account_profile(&self, user: Uuid) -> anyhow::Result<AccountProfile> {
        Ok(sqlx::query_as("select id,email,display_name,avatar_url,display_name_customized name_customized,exists(select 1 from auth_identities i where i.user_id=u.id and i.provider='google') google_linked,$2::boolean profile_managed from users u where id=$1")
            .bind(user).bind(self.profile_managed()).fetch_one(&self.pool).await?)
    }

    pub async fn set_account_name(&self, user: Uuid, name: &str) -> anyhow::Result<AccountProfile> {
        anyhow::ensure!(!self.profile_managed(), "profile managed by identity provider");
        sqlx::query("update users set display_name=$2,display_name_customized=true,updated_at=now() where id=$1")
            .bind(user).bind(name).execute(&self.pool).await?;
        self.account_profile(user).await
    }
}
