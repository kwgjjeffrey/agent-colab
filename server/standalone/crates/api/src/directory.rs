//! Provider-neutral directory contract; deployment adapter owns corporate APIs and secrets.
use super::*;
#[derive(Clone,Deserialize,Serialize)]
pub(super) struct Identity { pub provider:String,pub subject:String }
#[derive(Deserialize,Serialize)]
#[serde(rename_all="camelCase")]
pub(super) struct Person {
    pub user_id:Option<uuid::Uuid>,pub email:String,pub display_name:Option<String>,pub avatar_url:Option<String>,
    pub username:Option<String>,pub department:Option<String>,pub identity:Option<Identity>,
}
impl From<colab_server_persistence::OrganizationPerson> for Person {
    fn from(p:colab_server_persistence::OrganizationPerson)->Self {Self {user_id:Some(p.user_id),email:p.email,display_name:p.display_name,avatar_url:p.avatar_url,username:None,department:None,identity:None}}
}
async fn lookup(state:&AppState,actor:uuid::Uuid,query:&str,subject:Option<&str>)->Result<Vec<Person>,ApiError> {
    if query.chars().count()>128 {return Err(ApiError::bad_request("invalid_people_query"));}
    let config=state.external_auth.as_ref().ok_or_else(||ApiError::internal("directory_unavailable"))?;
    let url=config.directory_url.as_ref().ok_or_else(||ApiError::internal("directory_unavailable"))?;
    let searcher=state.database.external_subject(actor,&config.provider).await.map_err(|_|ApiError::internal("identity_read_failed"))?.ok_or_else(||ApiError::unauthorized("external_identity_required"))?;
    let secret=std::fs::read_to_string(&config.client_secret_file).map_err(|_|ApiError::internal("directory_unavailable"))?;
    let client=reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).timeout(std::time::Duration::from_secs(25)).build().map_err(|_|ApiError::internal("directory_unavailable"))?;
    let r=client.post(url).bearer_auth(secret.trim()).json(&serde_json::json!({"searcher":searcher,"query":query,"subject":subject})).send().await.map_err(|_|ApiError::internal("directory_unavailable"))?;
    if !r.status().is_success(){return Err(ApiError::internal("directory_unavailable"));}
    let bytes=r.bytes().await.map_err(|_|ApiError::internal("directory_unavailable"))?;
    if bytes.len()>262144{return Err(ApiError::internal("invalid_directory_response"));}
    let rows:Vec<Person>=serde_json::from_slice(&bytes).map_err(|_|ApiError::internal("invalid_directory_response"))?;
    if rows.len()>50 || rows.iter().any(|p| p.identity.as_ref().is_none_or(|i|i.provider!=config.provider || i.subject.is_empty() || i.subject.len()>128) || p.email.len()>320) {return Err(ApiError::internal("invalid_directory_response"));}
    Ok(rows)
}
pub(super) async fn search(state:&AppState,actor:uuid::Uuid,channel:uuid::Uuid,q:&str)->Result<Vec<Person>,ApiError>{
    if state.database.list_members(actor,channel).await.map_err(|_|ApiError::internal("member_list_failed"))?.is_none(){return Err(ApiError::forbidden("channel_access_forbidden"));}
    lookup(state,actor,q,None).await
}
pub(super) async fn add(state:&AppState,actor:uuid::Uuid,channel:uuid::Uuid,request:&AddMemberRequest)->Result<(StatusCode,Json<AddMemberResponse>),ApiError>{
    let identity=request.identity.as_ref().ok_or_else(||ApiError::bad_request("person_selection_required"))?;
    let config=state.external_auth.as_ref().ok_or_else(||ApiError::internal("directory_unavailable"))?;
    if identity.provider!=config.provider || identity.subject.len()>128{return Err(ApiError::bad_request("invalid_person_identity"));}
    // Reject unauthorized writes before looking up a corporate directory record.
    if !state.database.can_manage_channel(actor,channel).await.map_err(|_|ApiError::internal("member_read_failed"))?{return Err(ApiError::forbidden("member_add_forbidden"));}
    let person=lookup(state,actor,"",Some(&identity.subject)).await?.into_iter().find(|p|p.identity.as_ref().is_some_and(|i|i.subject==identity.subject)).ok_or_else(||ApiError::bad_request("person_not_found"))?;
    let joined=state.database.add_external_member(actor,channel,&identity.provider,&identity.subject,&person.email,person.display_name.as_deref(),person.avatar_url.as_deref(),&request.role).await.map_err(|_|ApiError::conflict("member_identity_conflict"))?;
    if !joined{return Err(ApiError::forbidden("member_add_forbidden"));}
    Ok((StatusCode::OK,Json(AddMemberResponse{status:"joined",email_delivery:"not_required"})))
}
