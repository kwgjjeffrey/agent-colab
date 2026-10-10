use super::*;
impl Database {
    pub async fn external_subject(&self,user:Uuid,provider:&str)->anyhow::Result<Option<String>> {
        Ok(sqlx::query_scalar("select subject from auth_identities where user_id=$1 and provider=$2").bind(user).bind(provider).fetch_optional(&self.pool).await?)
    }
    /// Resolve only within the requested organization; directory hits never provision accounts.
    pub async fn directory_member(&self,channel:Uuid,provider:&str,subject:&str)->anyhow::Result<Option<(Uuid,Uuid)>> {
        Ok(sqlx::query_as("select om.user_id,om.id from channels c join organization_members om on om.organization_id=c.organization_id join auth_identities i on i.user_id=om.user_id where c.id=$1 and i.provider=$2 and i.subject=$3").bind(channel).bind(provider).bind(subject).fetch_optional(&self.pool).await?)
    }
    pub async fn can_manage_channel(&self,actor:Uuid,channel:Uuid)->anyhow::Result<bool>{
        Ok(sqlx::query_scalar("select exists(select 1 from channel_members cm join organization_members om on om.id=cm.organization_member_id where cm.channel_id=$1 and om.user_id=$2 and cm.role in ('owner','admin'))").bind(channel).bind(actor).fetch_one(&self.pool).await?)
    }
    pub async fn add_external_member(&self,actor:Uuid,channel:Uuid,provider:&str,subject:&str,email:&str,name:Option<&str>,avatar:Option<&str>,role:&str)->anyhow::Result<bool>{
        let policy=self.external_policy.as_ref().context("external policy required")?;
        anyhow::ensure!(policy.provider==provider && matches!(role,"member"|"admin"),"invalid external member");
        let mut tx=self.pool.begin().await?;
        // Same advisory lock as SSO: provisioning and first login must resolve one UUID.
        sqlx::query("select pg_advisory_xact_lock(hashtextextended($1,1))").bind(format!("{provider}:{subject}")).execute(&mut *tx).await?;
        let organization:Option<Uuid>=sqlx::query_scalar("select c.organization_id from channels c join channel_members cm on cm.channel_id=c.id join organization_members om on om.id=cm.organization_member_id where c.id=$1 and om.user_id=$2 and cm.role in ('owner','admin') for update of cm").bind(channel).bind(actor).fetch_optional(&mut *tx).await?;
        if organization!=Some(policy.organization_id){return Ok(false);}
        let existing:Option<Uuid>=sqlx::query_scalar("select user_id from auth_identities where provider=$1 and subject=$2").bind(provider).bind(subject).fetch_optional(&mut *tx).await?;
        let user=if let Some(id)=existing{id}else{
            let id=Uuid::new_v4();
            // Directory selection creates no session or login lease; only verified SSO can activate it.
            // Email collisions fail rather than attaching an unrelated account by mutable email.
            sqlx::query("insert into users(id,email,display_name,avatar_url) values($1,$2,$3,$4)").bind(id).bind(email).bind(name).bind(avatar).execute(&mut *tx).await?;
            sqlx::query("insert into auth_identities(provider,subject,user_id) values($1,$2,$3)").bind(provider).bind(subject).bind(id).execute(&mut *tx).await?;id
        };
        let member:Uuid=sqlx::query_scalar("insert into organization_members(id,organization_id,user_id,role) values($1,$2,$3,'member') on conflict(organization_id,user_id) do update set user_id=excluded.user_id returning id").bind(Uuid::new_v4()).bind(policy.organization_id).bind(user).fetch_one(&mut *tx).await?;
        sqlx::query("insert into channel_members(channel_id,organization_member_id,organization_id,role) values($1,$2,$3,$4) on conflict(channel_id,organization_member_id) do nothing").bind(channel).bind(member).bind(policy.organization_id).bind(role).execute(&mut *tx).await?;
        tx.commit().await?;Ok(true)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    #[ignore="requires isolated COLAB_DEVICE_TEST_DATABASE_URL"]
    async fn directory_provisioning_requires_admin_and_only_sso_activates_account(){
        let db=Database::connect(&std::env::var("COLAB_DEVICE_TEST_DATABASE_URL").unwrap(),3).await.unwrap();
        let actor=Uuid::new_v4();let provider="directory-test";
        let db=db.with_external_policy(Some(ExternalPolicy{provider:provider.into(),organization_id:actor,organization_name:"Directory fixture".into(),administrator_subjects:vec!["owner".into()],login_lifetime_seconds:300}));
        let session=db.create_identity_session(provider,&format!("owner-{actor}"),&format!("{actor}@example.test"),Some("Owner"),None,None).await.unwrap();
        let channel=db.create_channel(session.user.id,actor,"Directory fixture",None).await.unwrap();
        let subject=format!("person-{}",Uuid::new_v4());let email=format!("{subject}@example.test");
        assert!(!db.add_external_member(Uuid::new_v4(),channel.id,provider,&subject,&email,None,None,"member").await.unwrap());
        assert!(db.external_subject(session.user.id,provider).await.unwrap().is_some());
        assert!(db.add_external_member(session.user.id,channel.id,provider,&subject,&email,Some("Employee"),None,"member").await.unwrap());
        let user:Uuid=sqlx::query_scalar("select user_id from auth_identities where provider=$1 and subject=$2").bind(provider).bind(&subject).fetch_one(&db.pool).await.unwrap();
        let participants=db.list_channel_participants(session.user.id,channel.id).await.unwrap().unwrap();
        assert_eq!(participants.iter().find(|p|p.email==email).unwrap().username.as_deref(),Some(subject.as_str()));
        let people=db.search_organization_people(session.user.id,channel.id,&subject).await.unwrap().unwrap();
        let person=people.iter().find(|p|p.user_id==user).unwrap();
        assert_eq!(person.username.as_deref(),Some(subject.as_str()));
        assert_eq!(db.directory_member(channel.id,provider,&subject).await.unwrap(),Some((user,person.member_id)));
        assert!(db.directory_member(Uuid::new_v4(),provider,&subject).await.unwrap().is_none());
        assert!(!db.external_login_allowed(user).await.unwrap());
        assert!(db.add_external_member(session.user.id,channel.id,provider,&subject,&email,None,None,"admin").await.unwrap());
        let members=db.list_members(session.user.id,channel.id).await.unwrap().unwrap();
        assert_eq!(members.iter().filter(|m|m.email==email).count(),1);
        assert_eq!(members.iter().find(|m|m.email==email).unwrap().role,"member","duplicate selection cannot silently escalate role");
        let login=db.create_identity_session(provider,&subject,&email,Some("Employee"),None,None).await.unwrap();
        assert_eq!(login.user.id,user);assert!(db.external_login_allowed(user).await.unwrap());
        assert!(db.add_external_member(session.user.id,channel.id,provider,&format!("collision-{subject}"),&email,None,None,"member").await.is_err());
    }
}
