//! Provider-derived byte locators, never a second transcript/message database.
use super::*;
use std::collections::BTreeMap;

pub(super) trait ReadSeek: Read+Seek {}
impl<T:Read+Seek> ReadSeek for T {}

#[derive(Serialize,Deserialize)]
struct SourceView {path:PathBuf,size:u64,modified:u128,identity:Option<(u64,u64)>}
fn identity(metadata:&fs::Metadata)->Option<(u64,u64)> {
    #[cfg(unix)] {use std::os::unix::fs::MetadataExt;Some((metadata.dev(),metadata.ino()))}
    #[cfg(not(unix))] {let _=metadata;None}
}
fn modified(metadata:&fs::Metadata)->u128 {metadata.modified().ok().and_then(|time|time.duration_since(std::time::UNIX_EPOCH).ok()).map(|duration|duration.as_nanos()).unwrap_or(0)}
pub(super) fn freeze(source:&Path,output:&Path)->Result<(),LocalError> {
    freeze_extent(source,output,None)
}
pub(super) fn freeze_extent(source:&Path,output:&Path,extent:Option<u64>)->Result<(),LocalError> {
    let file=fs::File::open(source).map_err(LocalError::internal)?;
    let metadata=file.metadata().map_err(LocalError::internal)?;
    let size=extent.unwrap_or(metadata.len());if size>metadata.len() {return Err(LocalError::internal("Session index source was truncated"))}
    let view=SourceView {path:source.to_path_buf(),size,modified:modified(&metadata),identity:identity(&metadata)};
    let parent=output.parent().ok_or_else(||LocalError::internal("Invalid Session preview path"))?;
    fs::create_dir_all(parent).map_err(LocalError::internal)?;
    let temporary=output.with_extension("writing");
    fs::write(&temporary,serde_json::to_vec(&view).map_err(LocalError::internal)?).map_err(LocalError::internal)?;
    fs::rename(temporary,output).map_err(LocalError::internal)?;Ok(())
}
pub(super) fn reusable(source:&Path,dir:&Path)->Option<String> {
    let metadata=fs::metadata(source).ok()?;
    for entry in fs::read_dir(dir).ok()?.filter_map(Result::ok) {
        if entry.path().extension().is_none_or(|extension|extension!="view") {continue}
        let Ok(bytes)=fs::read(entry.path()) else {continue};
        let Ok(view)=serde_json::from_slice::<SourceView>(&bytes) else {continue};
        if view.path==source && view.size==metadata.len() && view.modified==modified(&metadata) && view.identity==identity(&metadata) {
            let id=entry.path().file_stem()?.to_str()?.to_owned();uuid::Uuid::parse_str(&id).ok()?;return Some(id)
        }
    }
    None
}
struct FrozenFile {file:fs::File,size:u64,position:u64}
impl Read for FrozenFile {
    fn read(&mut self,bytes:&mut [u8])->std::io::Result<usize> {
        let count=bytes.len().min(self.size.saturating_sub(self.position) as usize);
        let read=self.file.read(&mut bytes[..count])?;self.position+=read as u64;Ok(read)
    }
}
impl Seek for FrozenFile {
    fn seek(&mut self,position:SeekFrom)->std::io::Result<u64> {
        let target=match position {SeekFrom::Start(n)=>n as i128,SeekFrom::Current(n)=>self.position as i128+n as i128,SeekFrom::End(n)=>self.size as i128+n as i128};
        if !(0..=u64::MAX as i128).contains(&target) {return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput,"Invalid frozen Session seek"))}
        self.position=self.file.seek(SeekFrom::Start(target as u64))?;Ok(self.position)
    }
}

#[derive(Clone,Serialize,Deserialize)]
struct Record { offset:u64,length:u64,index:usize,digest:String }
#[derive(Serialize,Deserialize)]
struct Turn {id:String,records:Vec<Record>,plain:bool,outputs:bool}
#[derive(Serialize,Deserialize)]
struct Index {version:u32,adapter:String,turns:Vec<Turn>,invalid:usize,include_outputs:bool,#[serde(default,skip_serializing_if="Option::is_none")] checkpoint:Option<Checkpoint>}
#[derive(Serialize,Deserialize)]
struct Checkpoint {offset:u64,ordinal:usize,seed:Vec<Value>,owners:HashMap<String,usize>}
#[derive(Serialize,Deserialize)]
struct Bundle {version:u32,plain:Index,outputs:Index}

pub(super) fn bundle(path:&Path,adapter:&str)->Result<Vec<u8>,LocalError> {
    let mut plain=build(path,adapter,false)?;let mut outputs=build(path,adapter,true)?;
    save_index(&cache_path(path,false),&plain)?;save_index(&cache_path(path,true),&outputs)?;
    // Contributor-only incremental parser state contains message text and must not become
    // a second remotely stored transcript. Recipients receive byte locators only.
    plain.checkpoint=None;outputs.checkpoint=None;
    serde_json::to_vec(&Bundle {version:1,plain,outputs}).map_err(LocalError::internal)
}

fn save_index(target:&Path,index:&Index)->Result<(),LocalError> {
    let temporary=target.with_extension(format!("{}.writing",uuid::Uuid::new_v4()));
    fs::write(&temporary,serde_json::to_vec(index).map_err(LocalError::internal)?).map_err(LocalError::internal)?;
    fs::rename(temporary,target).map_err(LocalError::internal)?;Ok(())
}

fn cache_path(path:&Path,outputs:bool)->PathBuf {
    path.with_extension(format!("{}.index-v2-{outputs}",path.extension().and_then(|e|e.to_str()).unwrap_or("raw")))
}

pub(super) fn cached(path:&Path)->bool {cache_path(path,false).is_file() && cache_path(path,true).is_file()}

/// Only cache-owned UUID views expire; native paths referenced by descriptors are never deleted.
pub(super) fn prune_views(dir:&Path,current:&Path) {
    let Ok(entries)=fs::read_dir(dir) else {return};
    for entry in entries.filter_map(Result::ok) {
        let path=entry.path();
        if path==current || !entry.file_type().is_ok_and(|kind|kind.is_file())
            || path.extension().is_none_or(|extension|!matches!(extension.to_str(),Some("view"|"chunks"|"jsonl")))
            || path.file_stem().and_then(|name|name.to_str()).is_none_or(|id|uuid::Uuid::parse_str(id).is_err()) {continue}
        if !entry.metadata().ok().and_then(|metadata|metadata.modified().ok()).and_then(|time|time.elapsed().ok()).is_some_and(|age|age.as_secs()>24*60*60) {continue}
        if fs::remove_file(&path).is_ok() {for outputs in [false,true] {let _=fs::remove_file(cache_path(&path,outputs));}}
    }
}

pub(super) fn install(path:&Path,bytes:&[u8],extent:u64)->Result<(),LocalError> {
    let bundle:Bundle=serde_json::from_slice(bytes).map_err(LocalError::internal)?;
    if bundle.version!=1 || bundle.plain.adapter!=bundle.outputs.adapter {return Err(LocalError::internal("Unsupported Session read index"))}
    for (outputs,mut index) in [(false,bundle.plain),(true,bundle.outputs)] {
        if index.version!=2 || index.include_outputs!=outputs {return Err(LocalError::internal("Unsupported Session read index"))}
        for turn in &index.turns {for record in &turn.records {
            if record.length>SESSION_RECORD_MAX_BYTES as u64 || record.offset.checked_add(record.length).is_none_or(|end|end>extent) || record.digest.len()!=64 || !record.digest.bytes().all(|b|b.is_ascii_hexdigit()) {return Err(LocalError::internal("Invalid Session read locator"))}
        }}
        index.checkpoint=None;
        let target=cache_path(path,outputs);
        if path.extension().is_some_and(|extension|extension=="view") {
            if let Some(previous)=fs::read(&target).ok().and_then(|bytes|serde_json::from_slice::<Index>(&bytes).ok()).filter(|previous|previous.adapter==index.adapter && previous.include_outputs==outputs && previous.checkpoint.as_ref().is_some_and(|checkpoint|checkpoint.offset==extent)) {index.checkpoint=previous.checkpoint;}
        }
        save_index(&target,&index)?;
    }
    Ok(())
}

pub(super) fn required_ranges(path:&Path,outputs:bool,cursor:Option<&str>,snapshot:&str,limit:usize)->Result<Option<Vec<(u64,u64)>>,LocalError> {
    let target=cache_path(path,outputs);
    if !target.is_file() {return Ok(None)}
    let index:Index=serde_json::from_slice(&fs::read(target).map_err(LocalError::internal)?).map_err(LocalError::internal)?;
    let turns:Vec<_>=index.turns.iter().filter(|turn|if outputs {turn.outputs} else {turn.plain}).collect();
    let before=decode_cursor(cursor,snapshot,turns.len())?;let start=before.saturating_sub(limit);
    let ranges=turns[start..before].iter().flat_map(|turn|turn.records.iter()).map(|record| {
        record.offset.checked_add(record.length).map(|end|(record.offset,end)).ok_or_else(||LocalError::internal("Invalid Session read locator"))
    }).collect::<Result<Vec<_>,_>>()?;
    Ok(Some(ranges))
}

pub(super) fn input(path:&Path)->Result<Box<dyn ReadSeek>,LocalError> {
    if path.extension().is_some_and(|extension|extension=="chunks") {Ok(Box::new(chunk_cache::reader(path)?))}
    else if path.extension().is_some_and(|extension|extension=="view") {
        let view:SourceView=serde_json::from_slice(&fs::read(path).map_err(LocalError::internal)?).map_err(LocalError::internal)?;
        let file=fs::File::open(&view.path).map_err(LocalError::internal)?;let metadata=file.metadata().map_err(LocalError::internal)?;
        if metadata.len()<view.size || identity(&metadata)!=view.identity || (metadata.len()==view.size && modified(&metadata)!=view.modified) {return Err(LocalError::bad_request("Pinned Session source changed; restart pagination"))}
        Ok(Box::new(FrozenFile {file,size:view.size,position:0}))
    }
    else {Ok(Box::new(fs::File::open(path).map_err(LocalError::internal)?))}
}

fn scan(reader:&mut BufReader<Box<dyn ReadSeek>>,ordinal:&mut usize,invalid:&mut usize)->Result<Option<(Record,Value)>,LocalError> {
    loop {
        let offset=reader.stream_position().map_err(LocalError::internal)?;
        let mut bytes=Vec::new();
        let size=std::io::BufRead::read_until(&mut reader.by_ref().take((SESSION_RECORD_MAX_BYTES+1) as u64),b'\n',&mut bytes).map_err(LocalError::internal)?;
        if size==0 {return Ok(None)}
        if size>SESSION_RECORD_MAX_BYTES {return Err(LocalError::internal("Session record exceeds reader bound"))}
        let line=match std::str::from_utf8(&bytes) {Ok(line)=>line,Err(_)=>{*invalid+=1;continue}};
        let index=*ordinal;*ordinal+=1;
        if let Ok(row)=serde_json::from_str::<Value>(line) {
            return Ok(Some((Record {offset,length:size as u64,index,digest:hex::encode(Sha256::digest(&bytes))},row)))
        }
    }
}

fn read_record(reader:&mut BufReader<Box<dyn ReadSeek>>,record:&Record)->Result<Value,LocalError> {
    if record.length>SESSION_RECORD_MAX_BYTES as u64 {return Err(LocalError::internal("Invalid Session index size"))}
    reader.seek(SeekFrom::Start(record.offset)).map_err(LocalError::internal)?;
    let mut bytes=vec![0;record.length as usize];reader.read_exact(&mut bytes).map_err(LocalError::internal)?;
    if hex::encode(Sha256::digest(&bytes))!=record.digest {return Err(LocalError::bad_request("Pinned Session source changed; restart pagination"))}
    serde_json::from_slice(&bytes).map_err(LocalError::internal)
}

fn fold(adapter:&str,index:usize,row:Value,seed:&mut Vec<Value>,outputs:bool,max:usize) {
    match adapter {
        "codex-jsonl-v1"=>fold_codex_rows(std::iter::once((index,row)),seed,outputs,max),
        "myflicker-desktop-jsonl-v1"=>fold_desktop_rows(std::iter::once((index,row)),seed,outputs,max),
        _=>fold_anthropic_rows(std::iter::once((index,row)),seed,outputs,max),
    }
}

fn result_ids(row:&Value)->Vec<String> {
    let mut ids=Vec::new();
    if matches!(row.pointer("/payload/type").and_then(Value::as_str),Some("function_call_output"|"custom_tool_call_output")) {
        if let Some(id)=row.pointer("/payload/call_id").and_then(Value::as_str) {ids.push(id.into())}
    }
    if row["role"]=="tool" {if let Some(id)=row["toolCallId"].as_str().or_else(||row["tool_use_id"].as_str()) {ids.push(id.into())}}
    for path in ["/payload/content","/message/content","/content"] {
        for block in row.pointer(path).and_then(Value::as_array).into_iter().flatten() {
            if matches!(block["type"].as_str(),Some("tool_result"|"tool-result")) {
                if let Some(id)=block["tool_use_id"].as_str().or_else(||block["toolCallId"].as_str()) {ids.push(id.into())}
            }
        }
    }
    ids
}

fn index_record(index:&mut Index,seed:&mut Vec<Value>,owners:&mut HashMap<String,usize>,record:Record,row:Value) {
    let results=result_ids(&row);
    let before=seed.clone();
    fold(&index.adapter,record.index,row,seed,index.include_outputs,0);
    let changed=*seed!=before;
    let new_turn=seed.len()>1;
    if new_turn {let last=seed.pop().unwrap();seed.clear();seed.push(last)}
    if let Some(turn)=seed.last() {
        let id=turn["id"].as_str().unwrap_or("turn");
        // task_started can create an empty turn; retaining it preserves its later provider ID.
        if new_turn || index.turns.is_empty() {index.turns.push(Turn {id:id.into(),records:Vec::new(),plain:false,outputs:false})}
        let position=index.turns.len()-1;
        let entry=&mut index.turns[position];if changed {entry.records.push(record.clone());}
        for item in turn["items"].as_array().into_iter().flatten() {
            entry.outputs=true;
            if item["type"]!="reasoning" {entry.plain=true}
            if let Some(id)=item["id"].as_str() {owners.insert(id.into(),position);}
        }
    }
    for id in results.into_iter().filter(|_|index.include_outputs) {
        if let Some(&owner)=owners.get(&id) {
            let records=&mut index.turns[owner].records;
            if records.last().is_none_or(|last|last.offset!=record.offset) {records.push(record.clone())}
        }
    }
    // Boundary detection only needs whether a user exists and the last message for mirror
    // deduplication. Historical tool arguments/results must not accumulate during indexing.
    if let Some(turn)=seed.last_mut() {
        let items=turn["items"].as_array().unwrap();
        let has_user=items.iter().any(|item|item["type"]=="userMessage");
        let last=items.last().cloned();let mut compact=Vec::new();
        if has_user && last.as_ref().is_some_and(|item|item["type"]!="userMessage") {compact.push(json!({"type":"userMessage"}));}
        if let Some(mut last)=last {
            if !matches!(last["type"].as_str(),Some("userMessage"|"agentMessage")) {last=json!({"type":last["type"],"id":last["id"]});}
            compact.push(last);
        }
        turn["items"]=json!(compact);
    }
}

fn build(path:&Path,adapter:&str,outputs:bool)->Result<Index,LocalError> {
    let mut reader=BufReader::new(input(path)?);let mut ordinal=0;let mut invalid=0;
    let mut index=Index {version:2,adapter:adapter.into(),turns:Vec::new(),invalid:0,include_outputs:outputs,checkpoint:None};
    let mut seed=Vec::new();let mut owners=HashMap::new();
    if adapter!="myflicker-desktop-jsonl-v1" {
        if let Some(mut previous)=incremental_base(path,adapter,outputs)? {
            let checkpoint=previous.checkpoint.take().unwrap();
            reader.seek(SeekFrom::Start(checkpoint.offset)).map_err(LocalError::internal)?;
            ordinal=checkpoint.ordinal;invalid=previous.invalid;seed=checkpoint.seed;owners=checkpoint.owners;index=previous;
        }
    }
    if adapter=="myflicker-desktop-jsonl-v1" {
        // Desktop overrides and rollback retain record locators, not high-volume raw content.
        let mut live:Vec<(Option<i64>,Record)>=Vec::new();
        while let Some((record,row))=scan(&mut reader,&mut ordinal,&mut invalid)? {
            if row["activityType"]=="CHECKPOINT_ROLLBACK" {
                if let Some(target)=row.pointer("/content/description").and_then(Value::as_str).unwrap_or("").split_whitespace().find_map(|part|part.parse::<i64>().ok()) {live.retain(|(id,_)|id.is_none_or(|id|id<target));}
            } else if row.get("role").is_some() {
                let id=row["id"].as_i64();
                if let Some(position)=id.and_then(|id|live.iter().position(|(old,_)|*old==Some(id))) {live[position]=(id,record)} else {live.push((id,record))}
            }
        }
        for (position,(_,mut record)) in live.into_iter().enumerate() {
            record.index=position;let row=read_record(&mut reader,&record)?;
            index_record(&mut index,&mut seed,&mut owners,record,row);
        }
    } else {
        while let Some((record,row))=scan(&mut reader,&mut ordinal,&mut invalid)? {index_record(&mut index,&mut seed,&mut owners,record,row)}
    }
    index.invalid=invalid;
    if adapter!="myflicker-desktop-jsonl-v1" {
        let offset=reader.stream_position().map_err(LocalError::internal)?;
        // An incomplete native tail can change on append; do not resume from such an index.
        if offset==0 || {reader.seek(SeekFrom::Start(offset-1)).map_err(LocalError::internal)?;let mut byte=[0];reader.read_exact(&mut byte).map_err(LocalError::internal)?;byte[0]==b'\n'} {
            index.checkpoint=Some(Checkpoint {offset,ordinal,seed,owners});
        }
    }
    Ok(index)
}

fn incremental_base(path:&Path,adapter:&str,outputs:bool)->Result<Option<Index>,LocalError> {
    if path.extension().is_none_or(|extension|extension!="view") {return Ok(None)}
    let current:SourceView=serde_json::from_slice(&fs::read(path).map_err(LocalError::internal)?).map_err(LocalError::internal)?;
    let Some(dir)=path.parent() else {return Ok(None)};
    let mut best:Option<(u64,Index)>=None;
    for entry in fs::read_dir(dir).map_err(LocalError::internal)?.filter_map(Result::ok) {
        let candidate=entry.path();if candidate==path || candidate.extension().is_none_or(|extension|extension!="view") {continue}
        let Some(view)=fs::read(&candidate).ok().and_then(|bytes|serde_json::from_slice::<SourceView>(&bytes).ok()) else {continue};
        if view.path!=current.path || view.identity!=current.identity || view.size>=current.size || best.as_ref().is_some_and(|(size,_)|*size>=view.size) {continue}
        let Some(index)=fs::read(cache_path(&candidate,outputs)).ok().and_then(|bytes|serde_json::from_slice::<Index>(&bytes).ok()) else {continue};
        if index.version!=2 || index.adapter!=adapter || index.include_outputs!=outputs || index.checkpoint.as_ref().is_none_or(|checkpoint|checkpoint.offset!=view.size) {continue}
        // Check the old boundary before trusting an append-only checkpoint. Individual page
        // locators additionally verify every selected record against its original digest.
        let mut reader=BufReader::new(input(path)?);
        if let Some(record)=index.turns.iter().flat_map(|turn|&turn.records).max_by_key(|record|record.offset) {
            if read_record(&mut reader,record).is_err() {continue}
        }
        best=Some((view.size,index));
    }
    Ok(best.map(|(_,index)|index))
}

pub(super) fn page(path:&Path,adapter:&str,outputs:bool,max:usize,cursor:Option<&str>,snapshot:&str,limit:usize)->Result<(Vec<Value>,usize,usize),LocalError> {
    let cache=cache_path(path,outputs);
    let index:Index=match fs::read(&cache).ok().and_then(|bytes|serde_json::from_slice::<Index>(&bytes).ok()).filter(|index|index.version==2 && index.adapter==adapter && index.include_outputs==outputs) {
        Some(index)=>index,
        None=>{let index=build(path,adapter,outputs)?;let temporary=cache.with_extension(format!("{}.writing",uuid::Uuid::new_v4()));fs::write(&temporary,serde_json::to_vec(&index).map_err(LocalError::internal)?).map_err(LocalError::internal)?;fs::rename(temporary,&cache).map_err(LocalError::internal)?;index}
    };
    let visible:Vec<_>=index.turns.iter().filter(|turn|if outputs {turn.outputs} else {turn.plain}).collect();
    let before=decode_cursor(cursor,snapshot,visible.len())?;let start=before.saturating_sub(limit);
    let selected=&visible[start..before];let ids:HashSet<_>=selected.iter().map(|turn|turn.id.as_str()).collect();
    let mut records=BTreeMap::new();for turn in selected {for record in &turn.records {records.insert(record.index,record.clone());}}
    let mut reader=BufReader::new(input(path)?);let mut turns=Vec::new();
    for record in records.into_values() {let row=read_record(&mut reader,&record)?;fold(adapter,record.index,row,&mut turns,outputs,max);}
    turns.retain(|turn|turn["id"].as_str().is_some_and(|id|ids.contains(id)) && turn["items"].as_array().is_some_and(|items|!items.is_empty()));
    Ok((turns,start,index.invalid))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn temporary()->PathBuf {std::env::temp_dir().join(format!("colab-read-index-{}",uuid::Uuid::new_v4()))}
    #[test]
    fn append_index_resumes_checkpoint_and_keeps_remote_bundle_locator_only() {
        use std::io::Write;
        let dir=temporary();fs::create_dir_all(&dir).unwrap();let source=dir.join("native.jsonl");
        let rows=[
            json!({"type":"event_msg","payload":{"type":"user_message","message":"PRIVATE_MESSAGE_BODY"}}),
            json!({"type":"response_item","payload":{"type":"function_call","call_id":"call","name":"bash","arguments":"{}"}}),
            json!({"type":"event_msg","payload":{"type":"task_started","turn_id":"second"}}),
            json!({"type":"event_msg","payload":{"type":"user_message","message":"second"}}),
            json!({"type":"response_item","payload":{"type":"function_call_output","call_id":"call","output":"later result"}}),
            json!({"type":"event_msg","payload":{"type":"agent_message","message":"answer"}}),
        ];
        let lines:Vec<_>=rows.iter().map(|row|format!("{row}\n")).collect();fs::write(&source,lines[..2].concat()).unwrap();
        let first=dir.join("first.view");freeze(&source,&first).unwrap();let remote=bundle(&first,"codex-jsonl-v1").unwrap();
        assert!(!String::from_utf8(remote.clone()).unwrap().contains("PRIVATE_MESSAGE_BODY"));
        install(&first,&remote,fs::metadata(&source).unwrap().len()).unwrap();
        fs::OpenOptions::new().append(true).open(&source).unwrap().write_all(lines[2..].concat().as_bytes()).unwrap();
        let second=dir.join("second.view");freeze(&source,&second).unwrap();
        for outputs in [false,true] {assert!(incremental_base(&second,"codex-jsonl-v1",outputs).unwrap().is_some())}
        bundle(&second,"codex-jsonl-v1").unwrap();
        for outputs in [false,true] {
            let expected=project_codex(&lines.concat(),outputs,4000);
            assert_eq!(page(&second,"codex-jsonl-v1",outputs,4000,None,"second",20).unwrap().0,expected);
        }
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    #[ignore = "read-only large native Session measurement; set COLAB_TRIAL_SESSION"]
    fn native_large_index_measurement() {
        let source=PathBuf::from(std::env::var("COLAB_TRIAL_SESSION").expect("COLAB_TRIAL_SESSION"));
        let dir=temporary();fs::create_dir_all(&dir).unwrap();let view=dir.join("fixed.view");freeze(&source,&view).unwrap();
        let mut base_ms=None;
        if let Ok(extent)=std::env::var("COLAB_TRIAL_BASE_EXTENT") {
            let base=dir.join("base.view");freeze_extent(&source,&base,Some(extent.parse().unwrap())).unwrap();
            let start=std::time::Instant::now();bundle(&base,"codex-jsonl-v1").unwrap();base_ms=Some(start.elapsed().as_millis());
        }
        let start=std::time::Instant::now();let bytes=bundle(&view,"codex-jsonl-v1").unwrap();let build_ms=start.elapsed().as_millis();
        let descriptor:SourceView=serde_json::from_slice(&fs::read(&view).unwrap()).unwrap();
        let extent=descriptor.size;install(&view,&bytes,extent).unwrap();
        let start=std::time::Instant::now();let (recent,before,_)=page(&view,"codex-jsonl-v1",false,4000,None,"fixed",5).unwrap();let page_ms=start.elapsed().as_millis();
        let ranges=required_ranges(&view,false,None,"fixed",5).unwrap().unwrap();
        let selected_bytes:u64=ranges.iter().map(|(a,b)|b-a).sum();
        let start=std::time::Instant::now();let expected=project_jsonl(&view,"codex-jsonl-v1",false,4000).unwrap().0;let full_ms=start.elapsed().as_millis();
        assert!(recent==expected[before..],"indexed tail differs from frozen reference (metadata-only assertion)");
        println!("{}",json!({"extent":extent,"base_index_ms":base_ms,"index_bytes":bytes.len(),"index_build_ms":build_ms,"tail_page_ms":page_ms,"selected_record_bytes":selected_bytes,"reference_full_projection_ms":full_ms,"turns":expected.len(),"tail_turns":recent.len(),"equal":true}));
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn indexed_preview_reads_only_selected_frames_without_reconstruction() {
        let dir=temporary();fs::create_dir_all(&dir).unwrap();
        let records=[
            json!({"type":"event_msg","payload":{"type":"user_message","message":"old"}}),
            json!({"type":"response_item","payload":{"type":"function_call","call_id":"call","name":"bash","arguments":"{}"}}),
            json!({"type":"response_item","payload":{"type":"function_call_output","call_id":"call","output":"large ignored output".repeat(10000)}}),
            json!({"type":"event_msg","payload":{"type":"task_started","turn_id":"recent"}}),
            json!({"type":"event_msg","payload":{"type":"user_message","message":"recent question"}}),
            json!({"type":"event_msg","payload":{"type":"agent_message","message":"recent answer"}}),
        ];
        let lines:Vec<_>=records.iter().map(|row|format!("{row}\n")).collect();
        let source=dir.join("native.jsonl");fs::write(&source,lines.concat()).unwrap();
        let bundle=bundle(&source,"codex-jsonl-v1").unwrap();
        let path=dir.join("fixed.chunks");let mut chunks=Vec::new();let mut extent=0_u64;
        for (index,line) in lines.iter().enumerate() {
            let (chunk,encoded)=colab_local_core::session_chunks::encode(index.to_string(),line.as_bytes()).unwrap();
            // Deliberately omit all old frames, including the large tool output.
            if index>=3 {fs::write(dir.join(format!("{}.frame",chunk.encoded_digest)),encoded).unwrap()}
            extent+=chunk.decoded_bytes;chunks.push(chunk);
        }
        fs::write(&path,serde_json::to_vec(&chunk_cache::Manifest {chunks}).unwrap()).unwrap();
        install(&path,&bundle,extent).unwrap();
        let (recent,start,_)=page(&path,"codex-jsonl-v1",false,4000,None,"fixed",1).unwrap();
        assert_eq!(start,1);assert_eq!(recent,project_codex(&lines.concat(),false,4000)[1..]);
        assert!(page(&path,"codex-jsonl-v1",false,4000,Some(&encode_cursor("fixed",start)),"fixed",1).is_err());
        assert!(!dir.join("fixed.jsonl").exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn frozen_native_view_allows_append_but_detects_changed_selected_records() {
        use std::io::Write;
        let dir=temporary();fs::create_dir_all(&dir).unwrap();
        let source=dir.join("native.jsonl");let view=dir.join("fixed.view");
        let old=json!({"type":"event_msg","payload":{"type":"user_message","message":"before"}}).to_string()+"\n";
        fs::write(&source,&old).unwrap();freeze(&source,&view).unwrap();
        let expected=page(&view,"codex-jsonl-v1",false,4000,None,"fixed",1).unwrap().0;
        fs::OpenOptions::new().append(true).open(&source).unwrap().write_all(old.as_bytes()).unwrap();
        assert_eq!(page(&view,"codex-jsonl-v1",false,4000,None,"fixed",1).unwrap().0,expected);
        let modified=old.replace("before","after!")+&old;fs::write(&source,modified).unwrap();
        assert!(page(&view,"codex-jsonl-v1",false,4000,None,"fixed",1).is_err());
        fs::write(&source,b"truncated").unwrap();assert!(input(&view).is_err());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn indexed_pages_equal_full_projection_for_all_adapters_and_output_modes() {
        let codex=[
            json!({"type":"response_item","payload":{"type":"reasoning","summary":"planning"}}),
            json!({"type":"event_msg","payload":{"type":"user_message","message":"first"}}),
            json!({"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"first"}]}}),
            json!({"type":"response_item","payload":{"type":"function_call","call_id":"call","name":"exec_command","arguments":"{\"cmd\":\"pwd\"}"}}),
            json!({"type":"event_msg","payload":{"type":"task_started","turn_id":"second"}}),
            json!({"type":"event_msg","payload":{"type":"user_message","message":"second"}}),
            json!({"type":"response_item","payload":{"type":"function_call_output","call_id":"call","output":"cross-turn output"}}),
            json!({"type":"event_msg","payload":{"type":"agent_message","message":"answer"}}),
            json!({"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"answer"}]}}),
        ];
        let anthropic=[
            json!({"type":"user","message":{"role":"user","content":"first"}}),
            json!({"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"call","name":"bash","input":{"command":"pwd"}}]}}),
            json!({"type":"user","message":{"role":"user","content":"second"}}),
            json!({"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"call","content":"result"}]}}),
            json!({"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"answer"}]}}),
        ];
        let desktop=[
            json!({"id":1,"role":"user","content":"first"}),
            json!({"id":2,"role":"assistant","content":"old answer"}),
            json!({"id":3,"role":"user","content":"discarded"}),
            json!({"activityType":"CHECKPOINT_ROLLBACK","content":{"description":"rollback 3"}}),
            json!({"id":2,"role":"assistant","content":"new answer","toolCalls":[{"id":"call","function":{"name":"bash","arguments":"{}"}}]}),
            json!({"id":4,"role":"user","content":"second"}),
            json!({"id":5,"role":"tool","toolCallId":"call","content":"result"}),
        ];
        let dir=temporary();fs::create_dir_all(&dir).unwrap();
        for (adapter,rows) in [("codex-jsonl-v1",codex.as_slice()),("claude-jsonl-v1",anthropic.as_slice()),("myflicker-jsonl-v1",anthropic.as_slice()),("myflicker-desktop-jsonl-v1",desktop.as_slice())] {
            let path=dir.join(format!("{adapter}.jsonl"));
            let text=rows.iter().map(Value::to_string).collect::<Vec<_>>().join("\n")+"\n";fs::write(&path,&text).unwrap();
            for outputs in [false,true] {
                let expected=match adapter {"codex-jsonl-v1"=>project_codex(&text,outputs,4000),"myflicker-desktop-jsonl-v1"=>project_myflicker_desktop(&text,outputs,4000),_=>project_anthropic(&text,outputs,4000)};
                let snapshot="fixed";let mut cursor=None;let mut actual=Vec::new();
                loop {
                    let (mut rows,start,_)=page(&path,adapter,outputs,4000,cursor.as_deref(),snapshot,1).unwrap();
                    rows.append(&mut actual);actual=rows;
                    if start==0 {break}cursor=Some(encode_cursor(snapshot,start));
                }
                assert_eq!(actual,expected,"{adapter} outputs={outputs}");
            }
        }
        fs::remove_dir_all(dir).unwrap();
    }
}
