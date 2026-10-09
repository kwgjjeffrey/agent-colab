//! Identity mapping and session creation share one transactional implementation.
use super::*;
impl Database {
    pub async fn create_google_session(
        &self,
        subject: &str,
        email: &str,
        display_name: Option<&str>,
        avatar_url: Option<&str>,
        link_user_id: Option<Uuid>,
    ) -> anyhow::Result<CreatedSession> {
        self.create_identity_session("google", subject, email, display_name, avatar_url, link_user_id).await
    }

    pub async fn create_identity_session(
        &self,
        provider: &str,
        subject: &str,
        email: &str,
        display_name: Option<&str>,
        avatar_url: Option<&str>,
        link_user_id: Option<Uuid>,
    ) -> anyhow::Result<CreatedSession> {
        if let Some(policy) = &self.external_policy { anyhow::ensure!(provider == policy.provider, "external login required"); }
        anyhow::ensure!(!provider.is_empty() && !subject.is_empty(), "identity required");
        let mut tx = self.pool.begin().await.context("begin auth transaction")?;
        // Serialize callbacks for one provider identity before checking whether it exists.
        sqlx::query("select pg_advisory_xact_lock(hashtextextended($1,1))")
            .bind(format!("{provider}:{subject}")).execute(&mut *tx).await?;
        let existing = sqlx::query_as::<_, (Uuid, String, Option<String>, Option<String>)>(
            "select u.id, u.email, u.display_name, u.avatar_url from auth_identities i join users u on u.id = i.user_id where i.provider = $1 and i.subject = $2"
        )
        .bind(provider).bind(subject)
        .fetch_optional(&mut *tx)
        .await
        .context("find external identity")?;

        let user = if let Some((id, _, _, _)) = existing {
            sqlx::query("update users set email = $2, display_name = case when display_name_customized then display_name else $3 end, avatar_url = case when avatar_customized then avatar_url else $4 end, updated_at = now() where id = $1")
                .bind(id).bind(email).bind(display_name).bind(avatar_url)
                .execute(&mut *tx).await.context("update user profile")?;
            AuthenticatedUser {
                id,
                email: email.to_owned(),
                display_name: sqlx::query_scalar("select display_name from users where id=$1").bind(id).fetch_one(&mut *tx).await?,
                avatar_url: sqlx::query_scalar("select avatar_url from users where id=$1").bind(id).fetch_one(&mut *tx).await?,
            }
        } else {
            let linkable = if let Some(id) = link_user_id {
                let account = sqlx::query_scalar::<_, Uuid>("select id from users where id=$1 for update")
                    .bind(id).fetch_optional(&mut *tx).await?;
                let has_identity: bool = sqlx::query_scalar("select exists(select 1 from auth_identities where user_id=$1)")
                    .bind(id).fetch_one(&mut *tx).await?;
                account.filter(|_| !has_identity)
            } else { None };
            let id = linkable.unwrap_or_else(Uuid::new_v4);
            if linkable.is_some() {
                sqlx::query("update users set email=$2,display_name=case when display_name_customized then display_name else $3 end,avatar_url=case when avatar_customized then avatar_url else $4 end,updated_at=now() where id=$1")
                    .bind(id).bind(email).bind(display_name).bind(avatar_url).execute(&mut *tx).await?;
            } else { sqlx::query(
                "insert into users (id, email, display_name, avatar_url) values ($1, $2, $3, $4)",
            )
            .bind(id)
            .bind(email)
            .bind(display_name)
            .bind(avatar_url)
            .execute(&mut *tx)
            .await
            .context("create user (email may already belong to another identity)")?;
            }
            sqlx::query("insert into auth_identities (provider, subject, user_id) values ($1, $2, $3)")
                .bind(provider).bind(subject).bind(id).execute(&mut *tx).await.context("create external identity")?;
            AuthenticatedUser {
                id,
                email: email.to_owned(),
                display_name: sqlx::query_scalar("select display_name from users where id=$1").bind(id).fetch_one(&mut *tx).await?,
                avatar_url: sqlx::query_scalar("select avatar_url from users where id=$1").bind(id).fetch_one(&mut *tx).await?,
            }
        };

        // Enterprise identity attributes are authoritative, including removal of an avatar.
        if self.profile_managed() {
            sqlx::query("update users set display_name=$2,avatar_url=$3,display_name_customized=false,avatar_customized=false,updated_at=now() where id=$1")
                .bind(user.id).bind(display_name).bind(avatar_url).execute(&mut *tx).await?;
        }
        let user = if self.profile_managed() {
            AuthenticatedUser { display_name: display_name.map(str::to_owned), avatar_url: avatar_url.map(str::to_owned), ..user }
        } else { user };

        if let Some(policy) = &self.external_policy {
            sqlx::query("insert into organizations(id,name,slug,created_by) values($1,$2,$3,$4) on conflict(id) do update set name=excluded.name")
                .bind(policy.organization_id).bind(&policy.organization_name).bind(format!("enterprise-{}",policy.organization_id.simple())).bind(user.id).execute(&mut *tx).await?;
            let role = if policy.administrator_subjects.iter().any(|s| s == subject) { "owner" } else { "member" };
            sqlx::query("insert into organization_members(id,organization_id,user_id,role) values($1,$2,$3,$4) on conflict(organization_id,user_id) do nothing")
                .bind(Uuid::new_v4()).bind(policy.organization_id).bind(user.id).bind(role).execute(&mut *tx).await?;
            sqlx::query("insert into external_login_leases(user_id,provider,expires_at) values($1,$2,now()+($3::bigint*interval '1 second')) on conflict(user_id) do update set provider=excluded.provider,expires_at=excluded.expires_at")
                .bind(user.id).bind(provider).bind(policy.login_lifetime_seconds).execute(&mut *tx).await?;
        } else {
        sqlx::query("insert into organizations(id,name,slug,created_by) values($1,$2,$3,$1) on conflict(id) do nothing")
            .bind(user.id).bind(format!("{}'s team",display_name.unwrap_or(email))).bind(format!("personal-{}",user.id.simple())).execute(&mut *tx).await.context("ensure personal organization")?;
        sqlx::query("insert into organization_members(id,organization_id,user_id,role) values($1,$2,$2,'owner') on conflict(organization_id,user_id) do nothing")
            .bind(Uuid::new_v4()).bind(user.id).execute(&mut *tx).await.context("ensure organization owner")?;

        }

        let access_token = new_token("colab_at_");
        let refresh_token = new_token("colab_rt_");
        let access_hash = token_hash(&access_token);
        let refresh_hash = token_hash(&refresh_token);
        let session_id = Uuid::new_v4();
        sqlx::query("insert into sessions (id, user_id, access_token_hash, refresh_token_hash, expires_at) values ($1, $2, $3, $4, now() + interval '30 days')")
            .bind(session_id).bind(user.id).bind(access_hash).bind(&refresh_hash)
            .execute(&mut *tx).await.context("create session")?;
        sqlx::query(
            "insert into session_refresh_tokens(token_hash,session_id,generation) values($1,$2,0)",
        )
        .bind(refresh_hash)
        .bind(session_id)
        .execute(&mut *tx)
        .await
        .context("record initial refresh token")?;
        tx.commit().await.context("commit auth transaction")?;
        Ok(CreatedSession {
            access_token,
            refresh_token,
            expires_in: 2_592_000,
            expires_at: unix_time_after(2_592_000),
            user,
        })
    }

}
