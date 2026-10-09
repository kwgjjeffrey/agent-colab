use super::*;
use yrs::{Doc, ReadTxn, Transact, Update, Xml, XmlFragment, XmlOut, updates::decoder::Decode};
#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CanvasImage {
    pub id: Uuid,
    pub canvas_id: Uuid,
    pub content_type: String,
    pub byte_size: i64,
    pub sha256: String,
    pub image_interpretation: String,
}
impl Database {
    pub async fn create_canvas_image(
        &self,
        canvas: Uuid,
        id: Uuid,
        key: &str,
        mime: &str,
        size: i64,
        digest: &str,
    ) -> anyhow::Result<CanvasImage> {
        Ok(sqlx::query_as("insert into canvas_images(id,canvas_id,blob_key,content_type,byte_size,sha256) values($1,$2,$3,$4,$5,$6) returning id,canvas_id,content_type,byte_size,sha256,image_interpretation").bind(id).bind(canvas).bind(key).bind(mime).bind(size).bind(digest).fetch_one(&self.pool).await?)
    }
    pub async fn canvas_image(&self, id: Uuid) -> anyhow::Result<Option<CanvasImage>> {
        Ok(sqlx::query_as("select id,canvas_id,content_type,byte_size,sha256,image_interpretation from canvas_images where id=$1 and blob_key is not null").bind(id).fetch_optional(&self.pool).await?)
    }
    pub async fn canvas_image_blob(&self, id: Uuid) -> anyhow::Result<Option<(String, String)>> {
        Ok(sqlx::query_as(
            "select blob_key,content_type from canvas_images where id=$1 and blob_key is not null",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?)
    }
    pub async fn interpret_canvas_image(
        &self,
        id: Uuid,
        text: &str,
    ) -> anyhow::Result<Option<CanvasImage>> {
        Ok(sqlx::query_as("update canvas_images set image_interpretation=$2 where id=$1 and blob_key is not null returning id,canvas_id,content_type,byte_size,sha256,image_interpretation").bind(id).bind(text).fetch_optional(&self.pool).await?)
    }
    pub async fn reclaim_canvas_images(&self) -> anyhow::Result<()> {
        // Durable heads are cleared first; ordinary Blob GC handles retryable object reclamation.
        sqlx::query("update canvas_images i set blob_key=null where blob_key is not null and (unreferenced_since<now()-interval '24 hours' or exists(select 1 from canvases c where c.id=i.canvas_id and c.archived_at<now()-interval '24 hours'))").execute(&self.pool).await?;
        Ok(())
    }
}
// Compute references from the merged authoritative replica inside the existing Canvas lock.
// Client reference lists would race with concurrent edits and could collect a still-used image.
pub(crate) async fn reconcile_images(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    canvas: Uuid,
) -> anyhow::Result<()> {
    let has_images: bool = sqlx::query_scalar(
        "select exists(select 1 from canvas_images where canvas_id=$1 and blob_key is not null)",
    )
    .bind(canvas)
    .fetch_one(&mut **tx)
    .await?;
    if !has_images {
        return Ok(());
    }
    let updates: Vec<Vec<u8>> = sqlx::query_scalar(
        "select update_bytes from canvas_updates where canvas_id=$1 order by server_seq",
    )
    .bind(canvas)
    .fetch_all(&mut **tx)
    .await?;
    let ids = collect_image_ids(updates)?;
    sqlx::query("update canvas_images set unreferenced_since=case when id=any($2) then null else coalesce(unreferenced_since,now()) end where canvas_id=$1 and blob_key is not null").bind(canvas).bind(ids).execute(&mut **tx).await?;
    Ok(())
}
fn collect_image_ids(updates: Vec<Vec<u8>>) -> anyhow::Result<Vec<Uuid>> {
    let doc = Doc::new();
    for bytes in updates {
        doc.transact_mut()
            .apply_update(Update::decode_v1(&bytes)?)?;
    }
    let txn = doc.transact();
    let mut ids = Vec::<Uuid>::new();
    fn walk<T: ReadTxn>(node: XmlOut, txn: &T, ids: &mut Vec<Uuid>) {
        match node {
            XmlOut::Element(e) => {
                if e.tag().as_ref() == "image" {
                    if let Some(value) = e.get_attribute(txn, "attachmentId") {
                        if let Ok(id) = value.to_string(txn).parse() {
                            ids.push(id);
                        }
                    }
                }
                for c in e.children(txn) {
                    walk(c, txn, ids);
                }
            }
            XmlOut::Fragment(f) => {
                for c in f.children(txn) {
                    walk(c, txn, ids);
                }
            }
            _ => {}
        }
    }
    if let Some(f) = txn.get_xml_fragment("default") {
        for c in f.children(&txn) {
            walk(c, &txn, &mut ids);
        }
    }
    Ok(ids)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn discovers_image_identity_in_real_tiptap_replica() {
        let ids = collect_image_ids(vec![include_bytes!("../assets/canvas-image.yjs").to_vec()]).unwrap();
        assert_eq!(ids, vec![Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap()]);
    }
}
