use serde::Serialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub enum AddTransferItemError {
    #[error("a transfer item already uses that name")]
    DuplicateName,
    #[error(transparent)]
    Database(#[from] anyhow::Error),
}

use super::Database;

const MAX_ACTIVE_TRANSFERS_PER_IP: i64 = 5;
const MAX_ITEMS_PER_TRANSFER: i64 = 20;
const MAX_TRANSFER_BYTES: i64 = 512 * 1024 * 1024;

#[derive(Debug)]
pub enum CreateTransferError {
    RateLimited,
    Database(anyhow::Error),
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TransferItem {
    pub id: Uuid,
    pub position: i32,
    pub kind: String,
    pub name: String,
    pub source_adapter: String,
    pub metadata: serde_json::Value,
    pub digest: Option<String>,
    pub byte_size: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferManifest {
    pub id: Uuid,
    pub expires_at: String,
    pub items: Vec<TransferItem>,
}

#[derive(Debug)]
pub struct ExpiredTransfer {
    pub id: Uuid,
    pub blob_keys: Vec<String>,
}

impl Database {
    pub async fn create_transfer(
        &self,
        created_ip: &str,
        expires_in_seconds: i64,
        upload_token: &str,
        read_token: &str,
        revoke_token: &str,
    ) -> Result<(Uuid, String), CreateTransferError> {
        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(anyhow::Error::from)
            .map_err(CreateTransferError::Database)?;
        sqlx::query("select pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(created_ip)
            .execute(&mut *tx)
            .await
            .map_err(anyhow::Error::from)
            .map_err(CreateTransferError::Database)?;
        // This is intentionally a database-enforced rolling limit, not an in-process counter: it
        // remains effective across restarts and when several Server replicas share PostgreSQL.
        let recent: i64 = sqlx::query_scalar(
            "select count(*) from quick_transfers where created_ip=$1::inet and created_at > now() - interval '1 hour' and state <> 'revoked' and expires_at > now()",
        )
        .bind(created_ip)
        .fetch_one(&mut *tx)
        .await
        .map_err(anyhow::Error::from)
        .map_err(CreateTransferError::Database)?;
        if recent >= MAX_ACTIVE_TRANSFERS_PER_IP {
            return Err(CreateTransferError::RateLimited);
        }
        let id = Uuid::new_v4();
        let expires_at: String = sqlx::query_scalar(
            "insert into quick_transfers(id,upload_token_hash,read_token_hash,revoke_token_hash,created_ip,expires_at) values($1,$2,$3,$4,$5::inet,now()+make_interval(secs=>$6::double precision)) returning expires_at::text",
        )
        .bind(id)
        .bind(hash_token(upload_token))
        .bind(hash_token(read_token))
        .bind(hash_token(revoke_token))
        .bind(created_ip)
        .bind(expires_in_seconds as f64)
        .fetch_one(&mut *tx)
        .await
        .map_err(anyhow::Error::from)
        .map_err(CreateTransferError::Database)?;
        tx.commit()
            .await
            .map_err(anyhow::Error::from)
            .map_err(CreateTransferError::Database)?;
        Ok((id, expires_at))
    }

    pub async fn add_transfer_item(
        &self,
        transfer_id: Uuid,
        upload_token: &str,
        kind: &str,
        name: &str,
        source_adapter: &str,
        metadata: &serde_json::Value,
    ) -> Result<Option<TransferItem>, AddTransferItemError> {
        let mut tx = self.pool.begin().await.map_err(anyhow::Error::from)?;
        let writable: Option<Uuid> = sqlx::query_scalar("select id from quick_transfers where id=$1 and upload_token_hash=$2 and state='uploading' and expires_at>now() for update")
            .bind(transfer_id).bind(hash_token(upload_token)).fetch_optional(&mut *tx).await.map_err(anyhow::Error::from)?;
        if writable.is_none() {
            return Ok(None);
        }
        let position: Option<i32> = sqlx::query_scalar(
            "select count(*)::integer from quick_transfer_items where transfer_id=$1 having count(*) < $2",
        )
        .bind(transfer_id)
        .bind(MAX_ITEMS_PER_TRANSFER)
        .fetch_optional(&mut *tx)
        .await.map_err(anyhow::Error::from)?;
        let Some(position) = position else {
            return Ok(None);
        };
        let item = sqlx::query_as::<_, TransferItem>(
            "insert into quick_transfer_items(id,transfer_id,position,kind,name,source_adapter,metadata) values($1,$2,$3,$4,$5,$6,$7) returning id,position,kind,name,source_adapter,metadata,digest,byte_size",
        )
        .bind(Uuid::new_v4()).bind(transfer_id).bind(position).bind(kind).bind(name)
        .bind(source_adapter).bind(metadata).fetch_one(&mut *tx).await.map_err(|error| {
            if error.as_database_error().and_then(|value| value.constraint()) == Some("quick_transfer_item_name_unique") {
                AddTransferItemError::DuplicateName
            } else {
                AddTransferItemError::Database(error.into())
            }
        })?;
        tx.commit().await.map_err(anyhow::Error::from)?;
        Ok(Some(item))
    }

    pub async fn may_upload_transfer_item(
        &self,
        transfer_id: Uuid,
        item_id: Uuid,
        upload_token: &str,
    ) -> anyhow::Result<bool> {
        sqlx::query_scalar("select exists(select 1 from quick_transfer_items i join quick_transfers t on t.id=i.transfer_id where t.id=$1 and i.id=$2 and t.upload_token_hash=$3 and t.state='uploading' and t.expires_at>now() and i.blob_key is null)")
            .bind(transfer_id).bind(item_id).bind(hash_token(upload_token)).fetch_one(&self.pool).await.map_err(Into::into)
    }

    pub async fn commit_transfer_item(
        &self,
        transfer_id: Uuid,
        item_id: Uuid,
        upload_token: &str,
        blob_key: &str,
        digest: &str,
        byte_size: i64,
    ) -> anyhow::Result<bool> {
        let mut tx = self.pool.begin().await?;
        let current_total: Option<i64> = sqlx::query_scalar("select total_bytes from quick_transfers where id=$1 and upload_token_hash=$2 and state='uploading' and expires_at>now() for update")
            .bind(transfer_id).bind(hash_token(upload_token)).fetch_optional(&mut *tx).await?;
        if current_total.is_none_or(|total| total + byte_size > MAX_TRANSFER_BYTES) {
            return Ok(false);
        }
        let updated = sqlx::query(
            "update quick_transfer_items set blob_key=$3,digest=$4,byte_size=$5 where transfer_id=$1 and id=$2 and blob_key is null",
        )
        .bind(transfer_id).bind(item_id).bind(blob_key).bind(digest)
        .bind(byte_size).execute(&mut *tx).await?;
        if updated.rows_affected() != 1 {
            return Ok(false);
        }
        sqlx::query("update quick_transfers set total_bytes=total_bytes+$2 where id=$1")
            .bind(transfer_id)
            .bind(byte_size)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(true)
    }

    pub async fn finalize_transfer(
        &self,
        transfer_id: Uuid,
        upload_token: &str,
    ) -> anyhow::Result<bool> {
        let result = sqlx::query("update quick_transfers t set state='ready',finalized_at=now() where t.id=$1 and t.upload_token_hash=$2 and t.state='uploading' and t.expires_at>now() and exists(select 1 from quick_transfer_items i where i.transfer_id=t.id) and not exists(select 1 from quick_transfer_items i where i.transfer_id=t.id and i.blob_key is null)")
            .bind(transfer_id).bind(hash_token(upload_token)).execute(&self.pool).await?;
        Ok(result.rows_affected() == 1)
    }

    pub async fn transfer_manifest(
        &self,
        transfer_id: Uuid,
        read_token: &str,
    ) -> anyhow::Result<Option<TransferManifest>> {
        let expires_at: Option<String> = sqlx::query_scalar("select expires_at::text from quick_transfers where id=$1 and read_token_hash=$2 and state='ready' and expires_at>now()")
            .bind(transfer_id).bind(hash_token(read_token)).fetch_optional(&self.pool).await?;
        let Some(expires_at) = expires_at else {
            return Ok(None);
        };
        let items=sqlx::query_as::<_,TransferItem>("select id,position,kind,name,source_adapter,metadata,digest,byte_size from quick_transfer_items where transfer_id=$1 order by position")
            .bind(transfer_id).fetch_all(&self.pool).await?;
        Ok(Some(TransferManifest {
            id: transfer_id,
            expires_at,
            items,
        }))
    }

    pub async fn transfer_item_blob_key(
        &self,
        transfer_id: Uuid,
        item_id: Uuid,
        read_token: &str,
    ) -> anyhow::Result<Option<String>> {
        sqlx::query_scalar("select i.blob_key from quick_transfer_items i join quick_transfers t on t.id=i.transfer_id where t.id=$1 and i.id=$2 and t.read_token_hash=$3 and t.state='ready' and t.expires_at>now()")
            .bind(transfer_id).bind(item_id).bind(hash_token(read_token)).fetch_optional(&self.pool).await.map_err(Into::into)
    }

    pub async fn revoke_transfer(
        &self,
        transfer_id: Uuid,
        revoke_token: &str,
    ) -> anyhow::Result<bool> {
        let result=sqlx::query("update quick_transfers set state='revoked',revoked_at=now() where id=$1 and revoke_token_hash=$2 and state<>'revoked'")
            .bind(transfer_id).bind(hash_token(revoke_token)).execute(&self.pool).await?;
        Ok(result.rows_affected() == 1)
    }

    pub async fn expired_transfers(&self, limit: i64) -> anyhow::Result<Vec<ExpiredTransfer>> {
        let ids: Vec<Uuid> = sqlx::query_scalar("select id from quick_transfers where expires_at<=now() or state='revoked' order by expires_at limit $1")
            .bind(limit).fetch_all(&self.pool).await?;
        let mut result = Vec::with_capacity(ids.len());
        for id in ids {
            let blob_keys=sqlx::query_scalar("select blob_key from quick_transfer_items where transfer_id=$1 and blob_key is not null")
                .bind(id).fetch_all(&self.pool).await?;
            result.push(ExpiredTransfer { id, blob_keys });
        }
        Ok(result)
    }

    pub async fn delete_expired_transfer(&self, id: Uuid) -> anyhow::Result<()> {
        sqlx::query(
            "delete from quick_transfers where id=$1 and (expires_at<=now() or state='revoked')",
        )
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}
