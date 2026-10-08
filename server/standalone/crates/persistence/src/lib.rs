use anyhow::Context;
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, postgres::PgPoolOptions};
use uuid::Uuid;

fn new_token(prefix: &str) -> String {
    format!(
        "{prefix}{}{}",
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple()
    )
}

fn unix_time_after(seconds: i64) -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("system clock predates Unix epoch")
        .as_secs() as i64
        + seconds
}

mod canvas;
mod catalog;
pub use catalog::CatalogItem;
mod account_profile;
pub use account_profile::AccountProfile;
mod activity;
pub use activity::{ChannelActivity, invalid_activity_cursor};
mod device_auth;
mod invite_links;
pub use invite_links::{InviteLink, InviteTarget};
pub use device_auth::{DeviceChallenge, DeviceAccount, LoginDevice};
mod messaging;
mod transfers;
pub use canvas::{Canvas, CanvasFolder, CanvasUpdate};
pub use messaging::{
    AgentBlueprint, AgentRequestBundle, AgentRequestStatus, AgentRequestWorkDetails, AgentRuntime, ChannelMessage,
    ChannelParticipant,
};
pub use transfers::{
    AddTransferItemError, CreateTransferError, ExpiredTransfer, ManagedTransfer, TransferAccess,
    TransferItem, TransferManifest,
};

/// Returns true when PostgreSQL rejected a write because a unique index was violated.
///
/// Persistence owns this provider-specific inspection so the HTTP API can expose a stable
/// conflict contract without depending on SQLx or PostgreSQL error codes itself.
pub fn is_unique_violation(error: &anyhow::Error) -> bool {
    error.chain().any(|cause| {
        cause
            .downcast_ref::<sqlx::Error>()
            .and_then(|sqlx_error| sqlx_error.as_database_error())
            .and_then(|database_error| database_error.code())
            .is_some_and(|code| code == "23505")
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthenticatedUser {
    pub id: Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedSession {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
    pub expires_at: i64,
    pub user: AuthenticatedUser,
}

#[derive(Debug, thiserror::Error)]
pub enum RefreshSessionError {
    #[error("refresh token is invalid")]
    Invalid,
    #[error("refresh token replayed; session revoked")]
    Replay,
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Channel {
    pub id: Uuid,
    pub name: String,
    pub icon: Option<String>,
    pub role: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Organization {
    pub id: Uuid,
    pub member_id: Uuid,
    pub name: String,
    pub role: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ChannelMember {
    pub member_id: Option<Uuid>,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub role: String,
    pub status: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationPerson {
    pub user_id: Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, sqlx::FromRow)]
pub struct EmailOutboxJob {
    pub id: Uuid,
    pub to: String,
    pub organization_name: String,
    pub inviter_name: String,
    pub token: String,
    pub attempts: i32,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FileShare {
    pub id: Uuid,
    pub channel_id: Uuid,
    pub name: String,
    pub contributor_member_id: Uuid,
    pub contributor_name: String,
    pub contributor_avatar_url: Option<String>,
    pub state: String,
    pub current_root_oid: Option<String>,
    pub can_withdraw: bool,
    pub updated_at: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SkillShare {
    pub id: Uuid,
    pub channel_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub contributor_name: String,
    pub contributor_avatar_url: Option<String>,
    pub state: String,
    pub current_root_oid: Option<String>,
    pub can_withdraw: bool,
    pub updated_at: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FileRevision {
    pub id: Uuid,
    pub share_id: Uuid,
    pub root_oid: String,
    pub parent_root_oid: Option<String>,
    pub byte_size: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SessionShare {
    pub id: Uuid,
    pub channel_id: Uuid,
    pub name: String,
    pub contributor_member_id: Uuid,
    pub source_adapter: String,
    pub contributor_name: String,
    pub contributor_avatar_url: Option<String>,
    pub state: String,
    pub current_snapshot_id: Option<Uuid>,
    pub can_withdraw: bool,
    pub updated_at: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SessionSegment {
    pub id: Uuid,
    pub snapshot_id: Uuid,
    pub position: i32,
    pub digest: String,
    pub byte_size: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    pub id: Uuid,
    pub share_id: Uuid,
    pub parent_snapshot_id: Option<Uuid>,
    pub source_cursor: String,
    pub created_at: String,
}

#[derive(Debug)]
pub enum AddChannelMember {
    Joined,
    Invitation {
        invitation_id: Uuid,
        token: String,
        email: String,
        organization_name: String,
        inviter_name: String,
    },
    Forbidden,
}

#[derive(Clone)]
pub struct Database {
    pool: PgPool,
}

impl Database {
    pub async fn connect(database_url: &str, max_connections: u32) -> anyhow::Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(max_connections)
            .connect(database_url)
            .await
            .context("connect to PostgreSQL")?;

        sqlx::migrate!("../../migrations")
            .run(&pool)
            .await
            .context("run PostgreSQL migrations")?;

        Ok(Self { pool })
    }

    pub async fn is_ready(&self) -> bool {
        sqlx::query_scalar::<_, i32>("select 1")
            .fetch_one(&self.pool)
            .await
            .is_ok()
    }

    pub async fn create_google_session(
        &self,
        subject: &str,
        email: &str,
        display_name: Option<&str>,
        avatar_url: Option<&str>,
        link_user_id: Option<Uuid>,
    ) -> anyhow::Result<CreatedSession> {
        let mut tx = self.pool.begin().await.context("begin auth transaction")?;
        // Serialize callbacks for one provider identity before checking whether it exists.
        sqlx::query("select pg_advisory_xact_lock(hashtextextended($1,1))")
            .bind(subject).execute(&mut *tx).await?;
        let existing = sqlx::query_as::<_, (Uuid, String, Option<String>, Option<String>)>(
            "select u.id, u.email, u.display_name, u.avatar_url from auth_identities i join users u on u.id = i.user_id where i.provider = 'google' and i.subject = $1"
        )
        .bind(subject)
        .fetch_optional(&mut *tx)
        .await
        .context("find Google identity")?;

        let user = if let Some((id, _, _, _)) = existing {
            sqlx::query("update users set email = $2, display_name = case when display_name_customized then display_name else $3 end, avatar_url = $4, updated_at = now() where id = $1")
                .bind(id).bind(email).bind(display_name).bind(avatar_url)
                .execute(&mut *tx).await.context("update user profile")?;
            AuthenticatedUser {
                id,
                email: email.to_owned(),
                display_name: sqlx::query_scalar("select display_name from users where id=$1").bind(id).fetch_one(&mut *tx).await?,
                avatar_url: avatar_url.map(str::to_owned),
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
                sqlx::query("update users set email=$2,display_name=case when display_name_customized then display_name else $3 end,avatar_url=$4,updated_at=now() where id=$1")
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
            sqlx::query("insert into auth_identities (provider, subject, user_id) values ('google', $1, $2)")
                .bind(subject).bind(id).execute(&mut *tx).await.context("create Google identity")?;
            AuthenticatedUser {
                id,
                email: email.to_owned(),
                display_name: sqlx::query_scalar("select display_name from users where id=$1").bind(id).fetch_one(&mut *tx).await?,
                avatar_url: avatar_url.map(str::to_owned),
            }
        };

        sqlx::query("insert into organizations(id,name,slug,created_by) values($1,$2,$3,$1) on conflict(id) do nothing")
            .bind(user.id).bind(format!("{}'s team",display_name.unwrap_or(email))).bind(format!("personal-{}",user.id.simple())).execute(&mut *tx).await.context("ensure personal organization")?;
        sqlx::query("insert into organization_members(id,organization_id,user_id,role) values($1,$2,$2,'owner') on conflict(organization_id,user_id) do nothing")
            .bind(Uuid::new_v4()).bind(user.id).execute(&mut *tx).await.context("ensure organization owner")?;

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

    /// Rotates both opaque credentials atomically. A consumed token is positive replay evidence,
    /// so the transaction revokes the complete session before returning an error.
    pub async fn refresh_session(
        &self,
        refresh_token: &str,
    ) -> Result<CreatedSession, RefreshSessionError> {
        let mut tx = self
            .pool
            .begin()
            .await
            .context("begin refresh transaction")?;
        let refresh_hash = token_hash(refresh_token);
        let row = sqlx::query_as::<_, (Uuid, i64, Option<String>, Option<String>, String, Option<String>, Option<String>)>(
            "select s.id,rt.generation,rt.consumed_at::text,s.revoked_at::text,u.email,u.display_name,u.avatar_url from session_refresh_tokens rt join sessions s on s.id=rt.session_id join users u on u.id=s.user_id where rt.token_hash=$1 for update of rt,s"
        ).bind(&refresh_hash).fetch_optional(&mut *tx).await.context("find refresh token")?;
        let Some((
            session_id,
            generation,
            consumed_at,
            revoked_at,
            email,
            display_name,
            avatar_url,
        )) = row
        else {
            return Err(RefreshSessionError::Invalid);
        };
        if revoked_at.is_some() {
            return Err(RefreshSessionError::Invalid);
        }
        if consumed_at.is_some() {
            sqlx::query("update sessions set revoked_at=coalesce(revoked_at,now()) where id=$1")
                .bind(session_id)
                .execute(&mut *tx)
                .await
                .context("revoke replayed session")?;
            tx.commit().await.context("commit replay revocation")?;
            return Err(RefreshSessionError::Replay);
        }
        let user_id: Uuid = sqlx::query_scalar("select user_id from sessions where id=$1")
            .bind(session_id)
            .fetch_one(&mut *tx)
            .await
            .context("load session user")?;
        let access_token = new_token("colab_at_");
        let next_refresh_token = new_token("colab_rt_");
        let access_hash = token_hash(&access_token);
        let next_refresh_hash = token_hash(&next_refresh_token);
        sqlx::query("update session_refresh_tokens set consumed_at=now() where token_hash=$1")
            .bind(refresh_hash)
            .execute(&mut *tx)
            .await
            .context("consume refresh token")?;
        sqlx::query(
            "insert into session_refresh_tokens(token_hash,session_id,generation) values($1,$2,$3)",
        )
        .bind(&next_refresh_hash)
        .bind(session_id)
        .bind(generation + 1)
        .execute(&mut *tx)
        .await
        .context("record rotated refresh token")?;
        sqlx::query("update sessions set access_token_hash=$2,refresh_token_hash=$3,expires_at=now()+interval '30 days' where id=$1")
            .bind(session_id).bind(access_hash).bind(next_refresh_hash).execute(&mut *tx).await.context("rotate session")?;
        tx.commit().await.context("commit refresh rotation")?;
        Ok(CreatedSession {
            access_token,
            refresh_token: next_refresh_token,
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

    pub async fn authenticate(&self, access_token: &str) -> anyhow::Result<Option<Uuid>> {
        sqlx::query_scalar("select user_id from sessions where access_token_hash = $1 and revoked_at is null and expires_at > now()")
            .bind(token_hash(access_token)).fetch_optional(&self.pool).await.context("authenticate session")
    }

    pub async fn revoke_session(&self, access_token: &str) -> anyhow::Result<bool> {
        let result = sqlx::query("update sessions set revoked_at=now() where access_token_hash=$1 and revoked_at is null")
            .bind(token_hash(access_token)).execute(&self.pool).await.context("revoke session")?;
        Ok(result.rows_affected() == 1)
    }

    pub async fn list_organizations(&self, user_id: Uuid) -> anyhow::Result<Vec<Organization>> {
        sqlx::query_as::<_, Organization>("select o.id,om.id member_id,o.name,om.role,o.created_at::text created_at from organizations o join organization_members om on om.organization_id=o.id where om.user_id=$1 order by o.created_at")
            .bind(user_id).fetch_all(&self.pool).await.context("list organizations")
    }

    pub async fn create_organization(
        &self,
        user_id: Uuid,
        name: &str,
    ) -> anyhow::Result<Organization> {
        let mut tx = self.pool.begin().await?;
        let id = Uuid::new_v4();
        let member_id = Uuid::new_v4();
        let slug = format!("org-{}", id.simple());
        sqlx::query("insert into organizations(id,name,slug,created_by) values($1,$2,$3,$4)")
            .bind(id)
            .bind(name)
            .bind(slug)
            .bind(user_id)
            .execute(&mut *tx)
            .await?;
        let organization=sqlx::query_as::<_,Organization>("insert into organization_members(id,organization_id,user_id,role) values($1,$2,$3,'owner') returning $2::uuid id,id member_id,$4::text name,role,joined_at::text created_at").bind(member_id).bind(id).bind(user_id).bind(name).fetch_one(&mut *tx).await?;
        tx.commit().await?;
        Ok(organization)
    }

    pub async fn list_channels(
        &self,
        user_id: Uuid,
        organization_id: Uuid,
    ) -> anyhow::Result<Option<Vec<Channel>>> {
        let member: Option<Uuid> = sqlx::query_scalar(
            "select id from organization_members where organization_id=$1 and user_id=$2",
        )
        .bind(organization_id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;
        let Some(member) = member else {
            return Ok(None);
        };
        let rows=sqlx::query_as::<_, Channel>("select c.id,c.name,c.icon,cm.role,c.created_at::text created_at from channels c join channel_members cm on cm.channel_id=c.id where c.organization_id=$1 and cm.organization_member_id=$2 order by c.updated_at desc")
            .bind(organization_id).bind(member).fetch_all(&self.pool).await.context("list channels")?;
        Ok(Some(rows))
    }

    pub async fn create_channel(
        &self,
        user_id: Uuid,
        organization_id: Uuid,
        name: &str,
        icon: Option<&str>,
    ) -> anyhow::Result<Channel> {
        let mut tx = self
            .pool
            .begin()
            .await
            .context("begin channel transaction")?;
        let id = Uuid::new_v4();
        let member_id: Uuid = sqlx::query_scalar(
            "select id from organization_members where user_id=$1 and organization_id=$2",
        )
        .bind(user_id)
        .bind(organization_id)
        .fetch_one(&mut *tx)
        .await
        .context("select organization member")?;
        let channel = sqlx::query_as::<_, Channel>("insert into channels (id,name,icon,created_by_member_id,organization_id) values ($1,$2,$3,$4,$5) returning id,name,icon,'owner'::text role,created_at::text created_at")
            .bind(id).bind(name).bind(icon).bind(member_id).bind(organization_id).fetch_one(&mut *tx).await.context("create channel")?;
        sqlx::query("insert into channel_members (channel_id,organization_member_id,organization_id,role) values ($1,$2,$3,'owner')")
        .bind(id)
        .bind(member_id)
        .bind(organization_id)
        .execute(&mut *tx)
        .await
        .context("create owner membership")?;
        canvas::seed_welcome_canvas(&mut tx, id, member_id).await?;
        tx.commit().await.context("commit channel transaction")?;
        Ok(channel)
    }

    pub async fn update_channel(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
        name: &str,
        icon: Option<&str>,
    ) -> anyhow::Result<Option<Channel>> {
        sqlx::query_as::<_, Channel>("update channels c set name=$3,icon=$4,updated_at=now() from channel_members m join organization_members om on om.id=m.organization_member_id where c.id=$1 and m.channel_id=c.id and om.user_id=$2 and m.role in ('owner','admin') returning c.id,c.name,c.icon,m.role,c.created_at::text created_at")
            .bind(channel_id).bind(user_id).bind(name).bind(icon).fetch_optional(&self.pool).await.context("update channel")
    }

    pub async fn list_members(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
    ) -> anyhow::Result<Option<Vec<ChannelMember>>> {
        let allowed: bool = sqlx::query_scalar(
            "select exists(select 1 from channel_members cm join organization_members om on om.id=cm.organization_member_id where cm.channel_id=$1 and om.user_id=$2)",
        )
        .bind(channel_id)
        .bind(user_id)
        .fetch_one(&self.pool)
        .await?;
        if !allowed {
            return Ok(None);
        }
        let rows = sqlx::query_as::<_, ChannelMember>("select om.id member_id,u.email,u.display_name,u.avatar_url,m.role,'joined'::text status from channel_members m join organization_members om on om.id=m.organization_member_id join users u on u.id=om.user_id where m.channel_id=$1 union all select null::uuid,email,null::text,null::text,coalesce(channel_role,'member') role,'pending'::text from organization_invitations where channel_id=$1 and accepted_at is null and revoked_at is null and expires_at>now() order by status,email")
            .bind(channel_id).fetch_all(&self.pool).await.context("list channel members")?;
        Ok(Some(rows))
    }

    pub async fn search_organization_people(
        &self,
        actor: Uuid,
        channel_id: Uuid,
        query: &str,
    ) -> anyhow::Result<Option<Vec<OrganizationPerson>>> {
        let organization:Option<Uuid>=sqlx::query_scalar("select c.organization_id from channels c join channel_members cm on cm.channel_id=c.id join organization_members om on om.id=cm.organization_member_id where c.id=$1 and om.user_id=$2").bind(channel_id).bind(actor).fetch_optional(&self.pool).await?;
        let Some(organization) = organization else {
            return Ok(None);
        };
        let pattern = format!("%{}%", query.trim());
        let people=sqlx::query_as::<_,OrganizationPerson>("select u.id user_id,u.email,u.display_name,u.avatar_url from organization_members om join users u on u.id=om.user_id where om.organization_id=$1 and (u.email ilike $2 or coalesce(u.display_name,'') ilike $2) order by u.display_name nulls last,u.email limit 20").bind(organization).bind(pattern).fetch_all(&self.pool).await?;
        Ok(Some(people))
    }

    pub async fn add_member(
        &self,
        actor: Uuid,
        channel_id: Uuid,
        email: &str,
        role: &str,
    ) -> anyhow::Result<AddChannelMember> {
        let mut tx = self.pool.begin().await?;
        let context:Option<(Uuid,Uuid,String,String)>=sqlx::query_as("select c.organization_id,om.id,o.name,coalesce(u.display_name,u.email) from channels c join organizations o on o.id=c.organization_id join channel_members cm on cm.channel_id=c.id join organization_members om on om.id=cm.organization_member_id join users u on u.id=om.user_id where c.id=$1 and om.user_id=$2 and cm.role in ('owner','admin')").bind(channel_id).bind(actor).fetch_optional(&mut *tx).await?;
        let Some((organization_id, actor_member_id, organization_name, inviter_name)) = context
        else {
            return Ok(AddChannelMember::Forbidden);
        };
        let org_user:Option<Uuid>=sqlx::query_scalar("select om.id from organization_members om join users u on u.id=om.user_id where om.organization_id=$1 and lower(u.email)=lower($2)").bind(organization_id).bind(email).fetch_optional(&mut *tx).await?;
        if let Some(id) = org_user {
            sqlx::query("insert into channel_members(channel_id,organization_member_id,organization_id,role) values($1,$2,$3,$4) on conflict(channel_id,organization_member_id) do update set role=excluded.role where channel_members.role<>'owner'").bind(channel_id).bind(id).bind(organization_id).bind(role).execute(&mut *tx).await?;
            tx.commit().await?;
            return Ok(AddChannelMember::Joined);
        }
        sqlx::query("update organization_invitations set revoked_at=now() where organization_id=$1 and channel_id=$2 and lower(email)=lower($3) and accepted_at is null and revoked_at is null").bind(organization_id).bind(channel_id).bind(email).execute(&mut *tx).await?;
        let invitation_id = Uuid::new_v4();
        let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        sqlx::query("insert into organization_invitations(id,organization_id,channel_id,email,organization_role,channel_role,token_hash,invited_by_member_id,expires_at) values($1,$2,$3,lower($4),'member',$5,$6,$7,now()+interval '7 days')").bind(invitation_id).bind(organization_id).bind(channel_id).bind(email).bind(role).bind(token_hash(&token)).bind(actor_member_id).execute(&mut *tx).await?;
        // The invitation and notification intent commit together. Delivery is performed later by
        // a leased worker, so a provider outage never turns a successful invite into an HTTP 503.
        sqlx::query("insert into email_outbox(id,invitation_id,kind,payload) values($1,$2,'organization_invite',$3)")
            .bind(Uuid::new_v4()).bind(invitation_id).bind(serde_json::json!({"to":email.to_lowercase(),"organizationName":organization_name,"inviterName":inviter_name,"token":token})).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(AddChannelMember::Invitation {
            invitation_id,
            token,
            email: email.to_lowercase(),
            organization_name,
            inviter_name,
        })
    }

    pub async fn claim_email(&self) -> anyhow::Result<Option<EmailOutboxJob>> {
        sqlx::query_as(
            "with due as (select id from email_outbox where next_attempt_at<=now() and (state='pending' or lease_until<now()) order by next_attempt_at,created_at for update skip locked limit 1) update email_outbox o set state='sending',attempts=attempts+1,lease_until=now()+interval '2 minutes' from due where o.id=due.id returning o.id,o.payload->>'to' as to,o.payload->>'organizationName' as organization_name,o.payload->>'inviterName' as inviter_name,o.payload->>'token' as token,o.attempts"
        ).fetch_optional(&self.pool).await.map_err(Into::into)
    }

    pub async fn complete_email(&self, id: Uuid) -> anyhow::Result<()> {
        // Successful rows are deleted so the plaintext short-lived invitation token is retained
        // no longer than delivery requires.
        sqlx::query("delete from email_outbox where id=$1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn retry_email(&self, id: Uuid, error: &str) -> anyhow::Result<()> {
        let error = error.chars().take(2000).collect::<String>();
        sqlx::query("update email_outbox set state='pending',lease_until=null,last_error=$2,next_attempt_at=now()+make_interval(secs=>least(3600,5*(1<<least(attempts,10)))) where id=$1")
            .bind(id).bind(error).execute(&self.pool).await?;
        Ok(())
    }

    pub async fn update_member_role(
        &self,
        actor: Uuid,
        channel_id: Uuid,
        member_id: Uuid,
        role: &str,
    ) -> anyhow::Result<bool> {
        let result = sqlx::query("update channel_members target set role=$4 from channel_members actor join organization_members actor_om on actor_om.id=actor.organization_member_id where target.channel_id=$1 and target.organization_member_id=$2 and actor.channel_id=target.channel_id and actor_om.user_id=$3 and actor.role='owner' and target.role<>'owner'").bind(channel_id).bind(member_id).bind(actor).bind(role).execute(&self.pool).await?;
        Ok(result.rows_affected() == 1)
    }

    pub async fn remove_member(
        &self,
        actor: Uuid,
        channel_id: Uuid,
        member_id: Option<Uuid>,
        email: Option<&str>,
    ) -> anyhow::Result<bool> {
        let owner: bool = sqlx::query_scalar("select exists(select 1 from channel_members cm join organization_members om on om.id=cm.organization_member_id where cm.channel_id=$1 and om.user_id=$2 and cm.role='owner')").bind(channel_id).bind(actor).fetch_one(&self.pool).await?;
        if !owner {
            return Ok(false);
        }
        let affected = if let Some(id) = member_id {
            sqlx::query(
                "delete from channel_members where channel_id=$1 and organization_member_id=$2 and role<>'owner'",
            )
            .bind(channel_id)
            .bind(id)
            .execute(&self.pool)
            .await?
            .rows_affected()
        } else {
            sqlx::query("update organization_invitations set revoked_at=now() where channel_id=$1 and lower(email)=lower($2) and accepted_at is null and revoked_at is null").bind(channel_id).bind(email.unwrap_or_default()).execute(&self.pool).await?.rows_affected()
        };
        Ok(affected == 1)
    }

    pub async fn accept_organization_invitation(
        &self,
        user_id: Uuid,
        token: &str,
    ) -> anyhow::Result<bool> {
        let mut tx = self.pool.begin().await?;
        let invitation:Option<(Uuid,Option<Uuid>,String,String)>=sqlx::query_as("select organization_id,channel_id,organization_role,coalesce(channel_role,'member') from organization_invitations i join users u on u.id=$2 where i.token_hash=$1 and lower(i.email)=lower(u.email) and i.accepted_at is null and i.revoked_at is null and i.expires_at>now() for update").bind(token_hash(token)).bind(user_id).fetch_optional(&mut *tx).await?;
        let Some((organization_id, channel_id, organization_role, channel_role)) = invitation
        else {
            return Ok(false);
        };
        let organization_member_id = Uuid::new_v4();
        sqlx::query("insert into organization_members(id,organization_id,user_id,role) values($1,$2,$3,$4) on conflict(organization_id,user_id) do nothing").bind(organization_member_id).bind(organization_id).bind(user_id).bind(organization_role).execute(&mut *tx).await?;
        let organization_member_id: Uuid = sqlx::query_scalar(
            "select id from organization_members where organization_id=$1 and user_id=$2",
        )
        .bind(organization_id)
        .bind(user_id)
        .fetch_one(&mut *tx)
        .await?;
        if let Some(channel_id) = channel_id {
            sqlx::query("insert into channel_members(channel_id,organization_member_id,organization_id,role) values($1,$2,$3,$4) on conflict(channel_id,organization_member_id) do nothing").bind(channel_id).bind(organization_member_id).bind(organization_id).bind(channel_role).execute(&mut *tx).await?;
        }
        sqlx::query("update organization_invitations set accepted_at=now() where token_hash=$1")
            .bind(token_hash(token))
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(true)
    }

    pub async fn list_file_shares(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
    ) -> anyhow::Result<Option<Vec<FileShare>>> {
        let actor:Option<Uuid>=sqlx::query_scalar("select cm.organization_member_id from channel_members cm join organization_members om on om.id=cm.organization_member_id where cm.channel_id=$1 and om.user_id=$2").bind(channel_id).bind(user_id).fetch_optional(&self.pool).await?;
        let Some(actor) = actor else { return Ok(None) };
let rows=sqlx::query_as::<_,FileShare>("select fs.id,fs.channel_id,fs.name,fs.contributor_member_id,coalesce(u.display_name,u.email) contributor_name,u.avatar_url contributor_avatar_url,fs.state,fs.current_root_oid,(fs.contributor_member_id=$2) can_withdraw,fs.updated_at::text updated_at from channel_shares fs join organization_members om on om.id=fs.contributor_member_id join users u on u.id=om.user_id where fs.channel_id=$1 and fs.kind='files' and fs.state='active' order by fs.updated_at desc").bind(channel_id).bind(actor).fetch_all(&self.pool).await?;
        Ok(Some(rows))
    }

    pub async fn create_file_share(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
        name: &str,
    ) -> anyhow::Result<Option<FileShare>> {
        let member:Option<Uuid>=sqlx::query_scalar("select cm.organization_member_id from channel_members cm join organization_members om on om.id=cm.organization_member_id where cm.channel_id=$1 and om.user_id=$2").bind(channel_id).bind(user_id).fetch_optional(&self.pool).await?;
        let Some(member) = member else {
            return Ok(None);
        };
        let id = Uuid::new_v4();
        let share=sqlx::query_as::<_,FileShare>("insert into channel_shares(id,channel_id,contributor_member_id,name,kind,source_adapter) values($1,$2,$3,$4,'files','shadow-git-v1') returning id,channel_id,name,contributor_member_id,(select coalesce(u.display_name,u.email) from organization_members om join users u on u.id=om.user_id where om.id=$3) contributor_name,(select u.avatar_url from organization_members om join users u on u.id=om.user_id where om.id=$3) contributor_avatar_url,state,current_root_oid,true can_withdraw,updated_at::text updated_at").bind(id).bind(channel_id).bind(member).bind(name).fetch_one(&self.pool).await?;
        Ok(Some(share))
    }

    pub async fn create_file_revision(
        &self,
        user_id: Uuid,
        share_id: Uuid,
        root_oid: &str,
        parent_root_oid: Option<&str>,
        blob_key: &str,
        byte_size: i64,
    ) -> anyhow::Result<Option<FileRevision>> {
        self.create_git_revision(
            user_id,
            share_id,
            "files",
            root_oid,
            parent_root_oid,
            blob_key,
            byte_size,
        )
        .await
    }

    pub async fn list_file_revisions(
        &self,
        user_id: Uuid,
        share_id: Uuid,
    ) -> anyhow::Result<Option<Vec<FileRevision>>> {
        let allowed:bool=sqlx::query_scalar("select exists(select 1 from channel_shares fs join channel_members cm on cm.channel_id=fs.channel_id join organization_members om on om.id=cm.organization_member_id where fs.id=$1 and fs.kind='files' and om.user_id=$2 and fs.state='active')").bind(share_id).bind(user_id).fetch_one(&self.pool).await?;
        if !allowed {
            return Ok(None);
        };
        Ok(Some(sqlx::query_as::<_,FileRevision>("select id,share_id,root_oid,parent_root_oid,byte_size,created_at::text created_at from file_revisions where share_id=$1 order by created_at").bind(share_id).fetch_all(&self.pool).await?))
    }

    pub async fn file_revision_blob_key(
        &self,
        user_id: Uuid,
        revision_id: Uuid,
    ) -> anyhow::Result<Option<String>> {
        sqlx::query_scalar("select fr.blob_key from file_revisions fr join channel_shares fs on fs.id=fr.share_id join channel_members cm on cm.channel_id=fs.channel_id join organization_members om on om.id=cm.organization_member_id where fr.id=$1 and fs.kind='files' and om.user_id=$2 and fs.state='active'").bind(revision_id).bind(user_id).fetch_optional(&self.pool).await.map_err(Into::into)
    }

    pub async fn withdraw_file_share(&self, user_id: Uuid, share_id: Uuid) -> anyhow::Result<bool> {
        let result=sqlx::query("update channel_shares fs set state='withdrawn',updated_at=now() from organization_members om where fs.id=$1 and fs.kind='files' and om.id=fs.contributor_member_id and om.user_id=$2 and fs.state='active'").bind(share_id).bind(user_id).execute(&self.pool).await?;
        Ok(result.rows_affected() == 1)
    }

    /// Lists active Skill Shared Items. Skill package bytes remain opaque to the Server and use
    /// the same revision table as Files; `kind` is the authorization boundary between them.
    pub async fn list_skill_shares(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
    ) -> anyhow::Result<Option<Vec<SkillShare>>> {
        let actor:Option<Uuid>=sqlx::query_scalar("select cm.organization_member_id from channel_members cm join organization_members om on om.id=cm.organization_member_id where cm.channel_id=$1 and om.user_id=$2").bind(channel_id).bind(user_id).fetch_optional(&self.pool).await?;
        let Some(actor) = actor else { return Ok(None) };
        Ok(Some(sqlx::query_as("select s.id,s.channel_id,s.name,s.description,coalesce(u.display_name,u.email) contributor_name,u.avatar_url contributor_avatar_url,s.state,s.current_root_oid,(s.contributor_member_id=$2) can_withdraw,s.updated_at::text updated_at from channel_shares s join organization_members om on om.id=s.contributor_member_id join users u on u.id=om.user_id where s.channel_id=$1 and s.kind='skill' and s.state='active' order by s.updated_at desc").bind(channel_id).bind(actor).fetch_all(&self.pool).await?))
    }

    pub async fn create_skill_share(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
        name: &str,
        description: Option<&str>,
    ) -> anyhow::Result<Option<SkillShare>> {
        let member:Option<Uuid>=sqlx::query_scalar("select cm.organization_member_id from channel_members cm join organization_members om on om.id=cm.organization_member_id where cm.channel_id=$1 and om.user_id=$2").bind(channel_id).bind(user_id).fetch_optional(&self.pool).await?;
        let Some(member) = member else {
            return Ok(None);
        };
        let id = Uuid::new_v4();
        Ok(Some(sqlx::query_as("insert into channel_shares(id,channel_id,contributor_member_id,name,description,kind,source_adapter) values($1,$2,$3,$4,$5,'skill','shadow-git-v1') returning id,channel_id,name,description,(select coalesce(u.display_name,u.email) from organization_members om join users u on u.id=om.user_id where om.id=$3) contributor_name,(select u.avatar_url from organization_members om join users u on u.id=om.user_id where om.id=$3) contributor_avatar_url,state,current_root_oid,true can_withdraw,updated_at::text updated_at").bind(id).bind(channel_id).bind(member).bind(name).bind(description).fetch_one(&self.pool).await?))
    }

    pub async fn create_skill_revision(
        &self,
        user_id: Uuid,
        share_id: Uuid,
        root_oid: &str,
        parent_root_oid: Option<&str>,
        blob_key: &str,
        byte_size: i64,
    ) -> anyhow::Result<Option<FileRevision>> {
        self.create_git_revision(
            user_id,
            share_id,
            "skill",
            root_oid,
            parent_root_oid,
            blob_key,
            byte_size,
        )
        .await
    }

    pub async fn list_skill_revisions(
        &self,
        user_id: Uuid,
        share_id: Uuid,
    ) -> anyhow::Result<Option<Vec<FileRevision>>> {
        self.list_git_revisions(user_id, share_id, "skill").await
    }

    pub async fn skill_revision_blob_key(
        &self,
        user_id: Uuid,
        revision_id: Uuid,
    ) -> anyhow::Result<Option<String>> {
        self.git_revision_blob_key(user_id, revision_id, "skill")
            .await
    }

    pub async fn withdraw_skill_share(
        &self,
        user_id: Uuid,
        share_id: Uuid,
    ) -> anyhow::Result<bool> {
        self.withdraw_git_share(user_id, share_id, "skill").await
    }

    async fn create_git_revision(
        &self,
        user_id: Uuid,
        share_id: Uuid,
        kind: &str,
        root_oid: &str,
        parent_root_oid: Option<&str>,
        blob_key: &str,
        byte_size: i64,
    ) -> anyhow::Result<Option<FileRevision>> {
        let mut tx = self.pool.begin().await?;
        // Serialize quota accounting per user. Without the advisory lock, concurrent uploads can
        // both observe spare capacity and exceed the limit after committing.
        sqlx::query("select pg_advisory_xact_lock(hashtext($1::text))")
            .bind(user_id)
            .execute(&mut *tx)
            .await?;
        let allowed:bool=sqlx::query_scalar("select exists(select 1 from channel_shares s join organization_members om on om.id=s.contributor_member_id where s.id=$1 and s.kind=$2 and om.user_id=$3 and s.state='active' and s.current_root_oid is not distinct from $4)").bind(share_id).bind(kind).bind(user_id).bind(parent_root_oid).fetch_one(&mut *tx).await?;
        if !allowed {
            return Ok(None);
        }
        const USER_GIT_QUOTA_BYTES: i64 = 2 * 1024 * 1024 * 1024;
        let used: i64 = sqlx::query_scalar("select coalesce(sum(r.byte_size),0)::bigint from file_revisions r join channel_shares s on s.id=r.share_id join organization_members om on om.id=s.contributor_member_id where om.user_id=$1 and s.state='active' and s.kind in ('files','skill')")
            .bind(user_id).fetch_one(&mut *tx).await?;
        if byte_size < 0 || used.saturating_add(byte_size) > USER_GIT_QUOTA_BYTES {
            anyhow::bail!("storage quota exceeded");
        }
        let id = Uuid::new_v4();
        let revision=sqlx::query_as::<_,FileRevision>("insert into file_revisions(id,share_id,root_oid,parent_root_oid,blob_key,byte_size) values($1,$2,$3,$4,$5,$6) returning id,share_id,root_oid,parent_root_oid,byte_size,created_at::text created_at").bind(id).bind(share_id).bind(root_oid).bind(parent_root_oid).bind(blob_key).bind(byte_size).fetch_one(&mut *tx).await?;
        sqlx::query("update channel_shares set current_root_oid=$2,updated_at=now() where id=$1 and kind=$3").bind(share_id).bind(root_oid).bind(kind).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(Some(revision))
    }

    /// Returns the complete Blob reachability set used by filesystem GC. Withdrawn Channel
    /// shares and expired/revoked Quick Shares are intentionally absent and become collectible.
    pub async fn referenced_blob_keys(&self) -> anyhow::Result<Vec<String>> {
        sqlx::query_scalar(
            "select r.blob_key from file_revisions r join channel_shares s on s.id=r.share_id where s.state='active' and s.kind in ('files','skill') union select sg.blob_key from session_segments sg join session_snapshots ss on ss.id=sg.snapshot_id join channel_shares s on s.id=ss.share_id where s.state='active' and s.kind='session' union select qi.blob_key from quick_transfer_items qi join quick_transfers qt on qt.id=qi.transfer_id where qi.blob_key is not null and qt.state in ('uploading','ready') and qt.expires_at>now()"
        ).fetch_all(&self.pool).await.map_err(Into::into)
    }

    async fn list_git_revisions(
        &self,
        user_id: Uuid,
        share_id: Uuid,
        kind: &str,
    ) -> anyhow::Result<Option<Vec<FileRevision>>> {
        let allowed:bool=sqlx::query_scalar("select exists(select 1 from channel_shares s join channel_members cm on cm.channel_id=s.channel_id join organization_members om on om.id=cm.organization_member_id where s.id=$1 and s.kind=$2 and om.user_id=$3 and s.state='active')").bind(share_id).bind(kind).bind(user_id).fetch_one(&self.pool).await?;
        if !allowed {
            return Ok(None);
        }
        Ok(Some(sqlx::query_as("select id,share_id,root_oid,parent_root_oid,byte_size,created_at::text created_at from file_revisions where share_id=$1 order by created_at").bind(share_id).fetch_all(&self.pool).await?))
    }

    async fn git_revision_blob_key(
        &self,
        user_id: Uuid,
        revision_id: Uuid,
        kind: &str,
    ) -> anyhow::Result<Option<String>> {
        sqlx::query_scalar("select r.blob_key from file_revisions r join channel_shares s on s.id=r.share_id join channel_members cm on cm.channel_id=s.channel_id join organization_members om on om.id=cm.organization_member_id where r.id=$1 and s.kind=$2 and om.user_id=$3 and s.state='active'").bind(revision_id).bind(kind).bind(user_id).fetch_optional(&self.pool).await.map_err(Into::into)
    }

    async fn withdraw_git_share(
        &self,
        user_id: Uuid,
        share_id: Uuid,
        kind: &str,
    ) -> anyhow::Result<bool> {
        let result=sqlx::query("update channel_shares s set state='withdrawn',updated_at=now() from organization_members om where s.id=$1 and s.kind=$2 and om.id=s.contributor_member_id and om.user_id=$3 and s.state='active'").bind(share_id).bind(kind).bind(user_id).execute(&self.pool).await?;
        Ok(result.rows_affected() == 1)
    }

    pub async fn list_session_shares(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
    ) -> anyhow::Result<Option<Vec<SessionShare>>> {
        let actor:Option<Uuid>=sqlx::query_scalar("select cm.organization_member_id from channel_members cm join organization_members om on om.id=cm.organization_member_id where cm.channel_id=$1 and om.user_id=$2").bind(channel_id).bind(user_id).fetch_optional(&self.pool).await?;
        let Some(actor) = actor else { return Ok(None) };
        Ok(Some(sqlx::query_as("select s.id,s.channel_id,s.name,s.source_adapter,s.contributor_member_id,coalesce(u.display_name,u.email) contributor_name,u.avatar_url contributor_avatar_url,s.state,s.current_snapshot_id,(s.contributor_member_id=$2) can_withdraw,s.updated_at::text updated_at from channel_shares s join organization_members om on om.id=s.contributor_member_id join users u on u.id=om.user_id where s.channel_id=$1 and s.kind='session' and s.state='active' order by s.updated_at desc").bind(channel_id).bind(actor).fetch_all(&self.pool).await?))
    }

    pub async fn create_session_share(
        &self,
        user_id: Uuid,
        channel_id: Uuid,
        name: &str,
        adapter: &str,
    ) -> anyhow::Result<Option<SessionShare>> {
        let member:Option<Uuid>=sqlx::query_scalar("select cm.organization_member_id from channel_members cm join organization_members om on om.id=cm.organization_member_id where cm.channel_id=$1 and om.user_id=$2").bind(channel_id).bind(user_id).fetch_optional(&self.pool).await?;
        let Some(member) = member else {
            return Ok(None);
        };
        let id = Uuid::new_v4();
        Ok(Some(sqlx::query_as("insert into channel_shares(id,channel_id,contributor_member_id,name,kind,source_adapter) values($1,$2,$3,$4,'session',$5) returning id,channel_id,name,contributor_member_id,source_adapter,(select coalesce(u.display_name,u.email) from organization_members om join users u on u.id=om.user_id where om.id=$3) contributor_name,(select u.avatar_url from organization_members om join users u on u.id=om.user_id where om.id=$3) contributor_avatar_url,state,current_snapshot_id,true can_withdraw,updated_at::text updated_at").bind(id).bind(channel_id).bind(member).bind(name).bind(adapter).fetch_one(&self.pool).await?))
    }

    pub async fn append_session_segment(
        &self,
        user_id: Uuid,
        share_id: Uuid,
        parent: Option<Uuid>,
        reset_chain: bool,
        source_cursor: &str,
        blob_key: &str,
        digest: &str,
        byte_size: i64,
    ) -> anyhow::Result<Option<(SessionSnapshot, SessionSegment)>> {
        let mut tx = self.pool.begin().await?;
        let allowed:bool=sqlx::query_scalar("select exists(select 1 from channel_shares s join organization_members om on om.id=s.contributor_member_id where s.id=$1 and s.kind='session' and om.user_id=$2 and s.state='active' and s.current_snapshot_id is not distinct from $3)").bind(share_id).bind(user_id).bind(parent).fetch_one(&mut *tx).await?;
        if !allowed {
            return Ok(None);
        };
        let snapshot_id = Uuid::new_v4();
        let segment_id = Uuid::new_v4();
        let snapshot_parent = if reset_chain { None } else { parent };
        let snapshot:SessionSnapshot=sqlx::query_as("insert into session_snapshots(id,share_id,parent_snapshot_id,source_cursor) values($1,$2,$3,$4) returning id,share_id,parent_snapshot_id,source_cursor,created_at::text created_at").bind(snapshot_id).bind(share_id).bind(snapshot_parent).bind(source_cursor).fetch_one(&mut *tx).await?;
        let segment:SessionSegment=sqlx::query_as("insert into session_segments(id,snapshot_id,position,blob_key,digest,byte_size) values($1,$2,0,$3,$4,$5) returning id,snapshot_id,position,digest,byte_size,created_at::text created_at").bind(segment_id).bind(snapshot_id).bind(blob_key).bind(digest).bind(byte_size).fetch_one(&mut *tx).await?;
        sqlx::query(
            "update channel_shares set current_snapshot_id=$2,updated_at=now() where id=$1",
        )
        .bind(share_id)
        .bind(snapshot_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(Some((snapshot, segment)))
    }

    pub async fn session_snapshot_chain(
        &self,
        user_id: Uuid,
        share_id: Uuid,
    ) -> anyhow::Result<Option<Vec<(SessionSnapshot, SessionSegment)>>> {
        let allowed:bool=sqlx::query_scalar("select exists(select 1 from channel_shares s join channel_members cm on cm.channel_id=s.channel_id join organization_members om on om.id=cm.organization_member_id where s.id=$1 and s.kind='session' and om.user_id=$2 and s.state='active')").bind(share_id).bind(user_id).fetch_one(&self.pool).await?;
        if !allowed {
            return Ok(None);
        };
        let rows:Vec<(Uuid,Uuid,Option<Uuid>,String,String,Uuid,i32,String,i64,String)>=sqlx::query_as("with recursive chain as (select ss.* from session_snapshots ss join channel_shares s on s.current_snapshot_id=ss.id where s.id=$1 union all select p.* from session_snapshots p join chain c on c.parent_snapshot_id=p.id) select c.id,c.share_id,c.parent_snapshot_id,c.source_cursor,c.created_at::text,sg.id,sg.position,sg.digest,sg.byte_size,sg.created_at::text from chain c join session_segments sg on sg.snapshot_id=c.id order by c.created_at,sg.position").bind(share_id).fetch_all(&self.pool).await?;
        Ok(Some(
            rows.into_iter()
                .map(|r| {
                    (
                        SessionSnapshot {
                            id: r.0,
                            share_id: r.1,
                            parent_snapshot_id: r.2,
                            source_cursor: r.3,
                            created_at: r.4,
                        },
                        SessionSegment {
                            id: r.5,
                            snapshot_id: r.0,
                            position: r.6,
                            digest: r.7,
                            byte_size: r.8,
                            created_at: r.9,
                        },
                    )
                })
                .collect(),
        ))
    }

    pub async fn session_segment_blob_key(
        &self,
        user_id: Uuid,
        segment_id: Uuid,
    ) -> anyhow::Result<Option<String>> {
        sqlx::query_scalar("select sg.blob_key from session_segments sg join session_snapshots ss on ss.id=sg.snapshot_id join channel_shares s on s.id=ss.share_id join channel_members cm on cm.channel_id=s.channel_id join organization_members om on om.id=cm.organization_member_id where sg.id=$1 and om.user_id=$2 and s.state='active'").bind(segment_id).bind(user_id).fetch_optional(&self.pool).await.map_err(Into::into)
    }

    pub async fn withdraw_session_share(
        &self,
        user_id: Uuid,
        share_id: Uuid,
    ) -> anyhow::Result<bool> {
        Ok(sqlx::query("update channel_shares s set state='withdrawn',updated_at=now() from organization_members om where s.id=$1 and s.kind='session' and om.id=s.contributor_member_id and om.user_id=$2 and s.state='active'").bind(share_id).bind(user_id).execute(&self.pool).await?.rows_affected()==1)
    }
}

fn token_hash(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}
