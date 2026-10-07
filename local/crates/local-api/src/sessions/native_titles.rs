use std::{collections::HashMap, fs, path::Path};
use rusqlite::{Connection, OpenFlags};

/// Read only the client's title metadata, never its conversation bodies. Opening read-only
/// avoids creating a database or modifying the client's WAL/checkpoint state.
pub(super) fn codex_titles(home: &Path) -> HashMap<String, String> {
    let mut titles = HashMap::new();
    let Ok(entries) = fs::read_dir(home.join(".codex")) else { return titles };
    let mut databases: Vec<_> = entries.flatten().map(|entry| entry.path()).filter(|path| {
        path.file_name().and_then(|name| name.to_str()).is_some_and(|name|
            name.starts_with("state_") && name.ends_with(".sqlite"))
    }).collect();
    databases.sort_by_key(|path| path.file_stem().and_then(|name| name.to_str())
        .and_then(|name| name.strip_prefix("state_"))
        .and_then(|version| version.parse::<u32>().ok()).unwrap_or_default());
    for path in databases {
        let Ok(db) = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY) else { continue };
        let Ok(mut statement) = db.prepare("select rollout_path, coalesce(nullif(trim(name),''),nullif(trim(title),'')) from threads") else { continue };
        let Ok(rows) = statement.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))) else { continue };
        for (path, title) in rows.flatten() {
            if let Some(title) = title { titles.insert(path, title); }
        }
    }
    titles
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "reads the current machine's native Codex metadata"]
    fn actual_client_title() {
        let home = std::env::var_os("HOME").unwrap();
        let titles = codex_titles(Path::new(&home));
        assert!(titles.values().any(|title| title == "Agent colab 主迭代"));
    }
    #[test]
    fn renamed_title_wins_over_first_message_and_refreshes_without_transcript_changes() {
        let root = std::env::temp_dir().join(format!("colab-titles-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join(".codex")).unwrap();
        let db = Connection::open(root.join(".codex/state_5.sqlite")).unwrap();
        db.execute_batch("create table threads(rollout_path text,name text,title text); insert into threads values('/session.jsonl','Real session name','Original user instruction');").unwrap();
        assert_eq!(codex_titles(&root)["/session.jsonl"], "Real session name");
        db.execute("update threads set name='Renamed again'", []).unwrap();
        assert_eq!(codex_titles(&root)["/session.jsonl"], "Renamed again");
        db.execute("update threads set name=null", []).unwrap();
        assert_eq!(codex_titles(&root)["/session.jsonl"], "Original user instruction");
        drop(db);
        fs::remove_dir_all(root).unwrap();
    }
}
