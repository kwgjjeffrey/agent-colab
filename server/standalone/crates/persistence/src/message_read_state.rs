use super::*;

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MessageReadState {
    pub channel_id: Uuid,
    pub last_read_seq: i64,
    pub latest_seq: i64,
    pub unread_count: i64,
    pub first_unread_seq: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore = "requires a disposable COLAB_UNREAD_TEST_DATABASE_URL"]
    async fn unread_membership_contract() -> anyhow::Result<()> {
        let db = Database::connect(&std::env::var("COLAB_UNREAD_TEST_DATABASE_URL")?, 2).await?;
        let a = Uuid::new_v4(); let b = Uuid::new_v4(); let outsider = Uuid::new_v4();
        let org = Uuid::new_v4(); let ma = Uuid::new_v4(); let mb = Uuid::new_v4();
        let channel = Uuid::new_v4(); let agent = Uuid::new_v4();
        sqlx::query("insert into users(id,email) values($1,$1::text||'@unread.invalid'),($2,$2::text||'@unread.invalid')").bind(a).bind(b).execute(&db.pool).await?;
        sqlx::query("insert into organizations(id,name,slug,created_by) values($1,'Unread test',$1::text,$2)").bind(org).bind(a).execute(&db.pool).await?;
        sqlx::query("insert into organization_members(id,organization_id,user_id,role) values($1,$3,$4,'owner'),($2,$3,$5,'member')").bind(ma).bind(mb).bind(org).bind(a).bind(b).execute(&db.pool).await?;
        sqlx::query("insert into channels(id,name,organization_id,created_by_member_id) values($1,'Unread test',$2,$3)").bind(channel).bind(org).bind(ma).execute(&db.pool).await?;
        sqlx::query("insert into channel_members(channel_id,organization_id,organization_member_id,role) values($1,$2,$3,'owner'),($1,$2,$4,'member')").bind(channel).bind(org).bind(ma).bind(mb).execute(&db.pool).await?;
        sqlx::query("insert into agent_blueprints(id,organization_id,owner_member_id,name) values($1,$2,$3,'Unread agent')").bind(agent).bind(org).bind(ma).execute(&db.pool).await?;
        let one: i64 = sqlx::query_scalar("insert into channel_messages(id,channel_id,sender_member_id,body,client_nonce) values(gen_random_uuid(),$1,$2,'first',gen_random_uuid()) returning seq").bind(channel).bind(ma).fetch_one(&db.pool).await?;
        let two: i64 = sqlx::query_scalar("insert into channel_messages(id,channel_id,sender_blueprint_id,body,client_nonce) values(gen_random_uuid(),$1,$2,'agent',gen_random_uuid()) returning seq").bind(channel).bind(agent).fetch_one(&db.pool).await?;
        let own = db.message_read_states(a).await?;
        assert_eq!(own[0].unread_count, 1, "own human messages excluded; own Agent replies count");
        let incoming = db.message_read_states(b).await?;
        assert_eq!(incoming[0].unread_count, 2);
        assert_eq!(incoming[0].first_unread_seq, Some(one));
        assert!(db.message_read_states(outsider).await?.is_empty());
        assert_eq!(db.acknowledge_messages(outsider, channel, two).await?, None);
        assert_eq!(db.acknowledge_messages(b, channel, two).await?, Some(two));
        assert_eq!(db.acknowledge_messages(b, channel, one).await?, Some(two));
        assert_eq!(db.acknowledge_messages(b, channel, i64::MAX).await?, Some(two));
        assert_eq!(db.message_read_states(b).await?[0].unread_count, 0);
        assert_eq!(db.message_read_states(a).await?[0].unread_count, 1, "reading is private to one account");
        sqlx::query("delete from channel_members where channel_id=$1 and organization_member_id=$2").bind(channel).bind(mb).execute(&db.pool).await?;
        assert!(db.message_read_states(b).await?.is_empty());
        sqlx::query("insert into channel_members(channel_id,organization_id,organization_member_id,role) values($1,$2,$3,'member')").bind(channel).bind(org).bind(mb).execute(&db.pool).await?;
        assert_eq!(db.message_read_states(b).await?[0].last_read_seq, two, "rejoining starts at committed latest");
        Ok(())
    }
}

impl Database {
    pub async fn message_read_states(&self, user: Uuid) -> anyhow::Result<Vec<MessageReadState>> {
        Ok(sqlx::query_as(r#"
            select cm.channel_id, cm.last_read_message_seq last_read_seq,
                coalesce((select max(seq) from channel_messages where channel_id=cm.channel_id),0) latest_seq,
                unread.unread_count, unread.first_unread_seq
            from channel_members cm
            join organization_members om on om.id=cm.organization_member_id
            cross join lateral (
                select count(*) unread_count, min(m.seq) first_unread_seq
                from channel_messages m
                where m.channel_id=cm.channel_id and m.seq>cm.last_read_message_seq
                    and (m.sender_blueprint_id is not null or m.sender_member_id is distinct from om.id)
            ) unread
            where om.user_id=$1
        "#).bind(user).fetch_all(&self.pool).await?)
    }

    /// A delayed acknowledgement from another device cannot move progress backwards.
    /// Limit to committed messages in this Channel, never a client-supplied future cursor.
    pub async fn acknowledge_messages(&self, user: Uuid, channel: Uuid, seq: i64) -> anyhow::Result<Option<i64>> {
        Ok(sqlx::query_scalar(r#"
            update channel_members cm
            set last_read_message_seq=greatest(cm.last_read_message_seq,
                least($3,coalesce((select max(seq) from channel_messages where channel_id=$2),0)))
            from organization_members om
            where cm.organization_member_id=om.id and om.user_id=$1 and cm.channel_id=$2
            returning cm.last_read_message_seq
        "#).bind(user).bind(channel).bind(seq).fetch_optional(&self.pool).await?)
    }
}
