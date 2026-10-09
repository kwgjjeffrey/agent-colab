//! Local source ownership and Channel references are separate; publication is keyed once.
use super::*;
use rusqlite::OptionalExtension;
use serde_json::Value;
use sha2::{Digest, Sha256};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Binding {
    pub reference_id: String,
    pub asset_id: String,
    pub publication_id: String,
    pub current_root_oid: Option<String>,
    pub current_snapshot_id: Option<String>,
    pub reference_count: i64,
}
fn table(kind: &str) -> Result<&'static str, LocalError> {
    match kind {
        "files" => Ok("local_file_sources"),
        "skill" => Ok("local_skill_sources"),
        "session" => Ok("local_session_sources"),
        _ => Err(LocalError::bad_request("Unsupported asset type")),
    }
}
pub(super) async fn publication_guard(
    state: &AppState,
    kind: &str,
    id: &str,
) -> tokio::sync::OwnedMutexGuard<()> {
    let key = if kind == "session" {
        id.to_owned()
    } else {
        format!("asset:{kind}:{id}")
    };
    let lock = {
        let mut locks = state.inner.session_sync_locks.lock().await;
        Arc::clone(locks.entry(key).or_insert_with(|| Arc::new(Mutex::new(()))))
    };
    lock.lock_owned().await
}
pub(super) async fn local_id(state: &AppState, id: &str) -> Result<String, LocalError> {
    let user = current_user_id(state).await?;
    Ok(state.inner.store.lock().await.query_row("select publication_id from local_asset_references where reference_id=?1 and user_id=?2",[id,&user],|row|row.get(0)).optional().map_err(LocalError::internal)?.unwrap_or_else(||id.into()))
}
pub(super) async fn lookup(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<Binding>, LocalError> {
    binding(&state, &id).await.map(Json)
}
pub(super) async fn register(
    state: &AppState,
    channel: &str,
    kind: &str,
    source: &Path,
    name: &str,
    description: Option<&str>,
    adapter: &str,
) -> Result<Binding, LocalError> {
    colab_observability::registered_business(
        include_str!("../../../tracing/registry.json"),
        "core.assets.register-source",
        register_impl(state, channel, kind, source, name, description, adapter),
    )
    .await
}
async fn register_impl(
    state: &AppState,
    channel: &str,
    kind: &str,
    source: &Path,
    name: &str,
    description: Option<&str>,
    adapter: &str,
) -> Result<Binding, LocalError> {
    let user = current_user_id(state).await?;
    let table = table(kind)?;
    let path = source.to_string_lossy();
    let (device, candidates): (String, Vec<String>) = {
        let store = state.inner.store.lock().await;
        store
            .execute(
                "insert or ignore into local_settings(key,value) values('device_id',?1)",
                [Uuid::new_v4().to_string()],
            )
            .map_err(LocalError::internal)?;
        let device = store
            .query_row(
                "select value from local_settings where key='device_id'",
                [],
                |row| row.get(0),
            )
            .map_err(LocalError::internal)?;
        let ordering = if kind == "session" {
            "last_byte_offset desc"
        } else {
            "(last_root_oid is not null) desc,updated_at desc"
        };
        let sql = format!(
            "select share_id,source_path from {table} where user_id=?1 {} order by {ordering}",
            if kind == "session" {
                "and source_adapter=?2"
            } else {
                ""
            }
        );
        let mut statement = store.prepare(&sql).map_err(LocalError::internal)?;
        let read_id =
            |row: &rusqlite::Row<'_>| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?));
        let rows = if kind == "session" {
            statement.query_map(rusqlite::params![user, adapter], read_id)
        } else {
            statement.query_map(rusqlite::params![user], read_id)
        }
        .map_err(LocalError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(LocalError::internal)?;
        let ids = rows
            .into_iter()
            .filter(|(_, candidate)| fs::canonicalize(candidate).ok().as_deref() == Some(source))
            .map(|(id, _)| id)
            .collect();
        (device, ids)
    };
    let key = hex::encode(Sha256::digest(format!(
        "{user}\0{device}\0{kind}\0{adapter}\0{path}"
    )));
    let mut locked_ids = candidates.clone();
    locked_ids.sort();
    locked_ids.dedup();
    // Ordinary re-sharing only adds a reference and must not wait for a large upload.
    // Historical multi-publisher consolidation alone needs ordered cursor locks.
    let mut guards = Vec::new();
    if locked_ids.len() > 1 {
        for id in &locked_ids {
            guards.push(publication_guard(state, kind, id).await);
        }
    }
    let token = access_token_for_user(state, &user).await?;
    let response=state.inner.http.post(format!("{}/v1/channels/{channel}/assets",state.inner.server_url)).bearer_auth(token)
  .json(&serde_json::json!({"kind":kind,"name":name,"description":description,"sourceAdapter":adapter,"sourceKey":key,"existingShareIds":candidates})).send().await.map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let binding: Binding = response.json().await.map_err(LocalError::internal)?;
    if current_user_id(state).await? != user {
        return Err(LocalError::bad_request(
            "Account changed during asset registration",
        ));
    }
    let mut store = state.inner.store.lock().await;
    let tx = store.transaction().map_err(LocalError::internal)?;
    let stopped: bool = tx
        .query_row(
            "select exists(select 1 from local_settings where key=?1)",
            [format!("asset_stopped:{user}:{}", binding.publication_id)],
            |row| row.get(0),
        )
        .map_err(LocalError::internal)?;
    tx.execute(
        "delete from local_settings where key=?1",
        [format!("asset_stopped:{user}:{}", binding.publication_id)],
    )
    .map_err(LocalError::internal)?;
    if !candidates.is_empty() && !candidates.contains(&binding.publication_id) {
        tx.execute(
            &format!("update {table} set share_id=?1 where share_id=?2 and user_id=?3"),
            [&binding.publication_id, &candidates[0], &user],
        )
        .map_err(LocalError::internal)?;
    }
    for reference in candidates
        .iter()
        .chain(std::iter::once(&binding.reference_id))
    {
        let reference_channel = if reference == &binding.reference_id {
            channel.to_owned()
        } else {
            tx.query_row(
                &format!("select channel_id from {table} where share_id=?1 and user_id=?2"),
                [reference, &user],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(LocalError::internal)?
            .unwrap_or_default()
        };
        tx.execute("insert into local_asset_references(user_id,reference_id,asset_id,publication_id,channel_id) values(?1,?2,?3,?4,?5) on conflict(user_id,reference_id) do update set asset_id=excluded.asset_id,publication_id=excluded.publication_id,channel_id=case when excluded.channel_id='' then local_asset_references.channel_id else excluded.channel_id end",rusqlite::params![user,reference,binding.asset_id,binding.publication_id,reference_channel]).map_err(LocalError::internal)?;
        if reference != &binding.publication_id {
            if kind == "skill" {
                // Preserve an existing managed install receipt without modifying its directory.
                // A differing installed root remains visible as update_available/conflict.
                tx.execute("insert into skill_installations(share_id,user_id,target_agent,installed_path,installed_root_oid,content_hash,installed_at) select ?1,user_id,target_agent,installed_path,installed_root_oid,content_hash,installed_at from skill_installations where share_id=?2 and user_id=?3 on conflict(share_id,user_id,target_agent) do nothing",[&binding.asset_id,reference,&user]).map_err(LocalError::internal)?;
            }
            tx.execute(
                &format!("delete from {table} where share_id=?1 and user_id=?2"),
                [reference, &user],
            )
            .map_err(LocalError::internal)?;
            tx.execute(
                "delete from local_jobs where share_id=?1 and user_id=?2",
                [reference, &user],
            )
            .map_err(LocalError::internal)?;
        }
    }
    // A retained asset may have been collected; reset only its remote publication cursor.
    if stopped && kind == "session" && binding.current_snapshot_id.is_none() {
        tx.execute("update local_session_sources set last_byte_offset=0,last_snapshot_id=null where share_id=?1 and user_id=?2",[&binding.publication_id,&user]).map_err(LocalError::internal)?;
    }
    if stopped && kind != "session" && binding.current_root_oid.is_none() {
        tx.execute(
            &format!("update {table} set last_root_oid=null where share_id=?1 and user_id=?2"),
            [&binding.publication_id, &user],
        )
        .map_err(LocalError::internal)?;
    }
    tx.commit().map_err(LocalError::internal)?;
    Ok(binding)
}
pub(super) async fn binding(state: &AppState, id: &str) -> Result<Binding, LocalError> {
    colab_observability::registered_business(
        include_str!("../../../tracing/registry.json"),
        "core.assets.binding",
        binding_impl(state, id),
    )
    .await
}
async fn binding_impl(state: &AppState, id: &str) -> Result<Binding, LocalError> {
    let user = current_user_id(state).await?;
    let token = access_token_for_user(state, &user).await?;
    let response = state
        .inner
        .http
        .get(format!("{}/v1/shares/{id}/asset", state.inner.server_url))
        .bearer_auth(token)
        .send()
        .await
        .map_err(LocalError::internal)?;
    if !response.status().is_success() {
        return Err(remote_error(response).await);
    }
    let binding: Binding = response.json().await.map_err(LocalError::internal)?;
    if current_user_id(state).await? != user {
        return Err(LocalError::bad_request(
            "Account changed during asset lookup",
        ));
    }
    state.inner.store.lock().await.execute("insert into local_asset_references(user_id,reference_id,asset_id,publication_id,channel_id) values(?1,?2,?3,?4,'') on conflict(user_id,reference_id) do update set asset_id=excluded.asset_id,publication_id=excluded.publication_id",rusqlite::params![user,id,binding.asset_id,binding.publication_id]).map_err(LocalError::internal)?;
    Ok(binding)
}
pub(super) async fn after_withdraw(
    state: &AppState,
    id: &str,
    kind: &str,
) -> Result<(), LocalError> {
    let binding = binding(state, id).await?;
    if binding.reference_count > 0 {
        return Ok(());
    }
    let user = current_user_id(state).await?;
    let table = table(kind)?;
    let store = state.inner.store.lock().await;
    // Retain the source/shadow/cursor for re-sharing, but remove it from scheduled publication.
    store
        .execute(
            "delete from local_jobs where share_id=?1 and user_id=?2",
            [&binding.publication_id, &user],
        )
        .map_err(LocalError::internal)?;
    store.execute("insert into local_settings(key,value) values(?1,'stopped') on conflict(key) do update set value='stopped'",[format!("asset_stopped:{user}:{}",binding.publication_id)]).map_err(LocalError::internal)?;
    let _ = table;
    Ok(())
}
pub(super) async fn enabled(state: &AppState, id: &str) -> Result<bool, LocalError> {
    let user = current_user_id(state).await?;
    enabled_for_user(state, id, &user).await
}
pub(super) async fn enabled_for_user(
    state: &AppState,
    id: &str,
    user: &str,
) -> Result<bool, LocalError> {
    let stopped: Option<String> = state
        .inner
        .store
        .lock()
        .await
        .query_row(
            "select value from local_settings where key=?1",
            [format!("asset_stopped:{user}:{id}")],
            |row| row.get(0),
        )
        .optional()
        .map_err(LocalError::internal)?;
    Ok(stopped.is_none())
}

/// Only the source-owning Core can prove equality for historical per-Channel publications.
/// Enumerating active metadata prevents migration from resurrecting a withdrawn placement.
pub(super) async fn consolidate_sources(state: &AppState) -> Result<(), LocalError> {
    colab_observability::registered_business(
        include_str!("../../../tracing/registry.json"),
        "core.assets.consolidate-sources",
        consolidate_sources_impl(state),
    )
    .await
}
async fn consolidate_sources_impl(state: &AppState) -> Result<(), LocalError> {
    let user = current_user_id(state).await?;
    let rows = {
        let store = state.inner.store.lock().await;
        let mut statement=store.prepare("select share_id,channel_id,source_path,'files','shadow-git-v1' from local_file_sources where user_id=?1 union all select share_id,channel_id,source_path,'skill','shadow-git-v1' from local_skill_sources where user_id=?1 union all select share_id,channel_id,source_path,'session',source_adapter from local_session_sources where user_id=?1").map_err(LocalError::internal)?;
        statement
            .query_map([&user], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .map_err(LocalError::internal)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(LocalError::internal)?
    };
    let token = access_token_for_user(state, &user).await?;
    let mut metadata = std::collections::HashMap::<(String, String), Vec<Value>>::new();
    for (id, channel, path, kind, adapter) in rows {
        let mapped:bool=state.inner.store.lock().await.query_row("select exists(select 1 from local_asset_references where reference_id=?1 and user_id=?2)",[&id,&user],|row|row.get(0)).map_err(LocalError::internal)?;
        if mapped {
            continue;
        }
        let Ok(path) = fs::canonicalize(path) else {
            continue;
        };
        let key = (channel.clone(), kind.clone());
        if !metadata.contains_key(&key) {
            let endpoint = match kind.as_str() {
                "session" => "sessions",
                "skill" => "skills",
                _ => "files",
            };
            let response = state
                .inner
                .http
                .get(format!(
                    "{}/v1/channels/{channel}/{endpoint}",
                    state.inner.server_url
                ))
                .bearer_auth(&token)
                .send()
                .await
                .map_err(LocalError::internal)?;
            if !response.status().is_success() {
                return Err(remote_error(response).await);
            }
            metadata.insert(
                key.clone(),
                response.json().await.map_err(LocalError::internal)?,
            );
        }
        let Some(item) = metadata[&key]
            .iter()
            .find(|item| item["id"].as_str() == Some(id.as_str()))
        else {
            continue;
        };
        let Some(name) = item["name"].as_str() else {
            continue;
        };
        register(
            state,
            &channel,
            &kind,
            &path,
            name,
            item["description"].as_str(),
            &adapter,
        )
        .await?;
    }
    Ok(())
}
