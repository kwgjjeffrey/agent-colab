"""Mechanically extract production projection functions; generated Rust is a trial artifact."""
import pathlib, subprocess
root = pathlib.Path(__file__).resolve().parent
source = (root.parents[1]/'local/crates/local-api/src/sessions.rs').read_text()
projector = source[source.index('fn project_codex('):source.index('fn project_anthropic(')]
helpers = source[source.index('fn tool_result_text('):source.index('fn encode_cursor(')]
incremental = projector.replace('fn project_codex(text: &str, include_outputs: bool, max_chars: usize)', 'fn project_incremental(chunks: &[String], include_outputs: bool, max_chars: usize)')
incremental = incremental.replace('text.lines().enumerate()', 'chunks.iter().flat_map(|chunk| chunk.lines()).enumerate()')
main = r'''
fn main() {
 let path = std::env::args().nth(1).unwrap();
 let mut input = std::io::BufReader::new(std::fs::File::open(path).unwrap());
 use std::io::BufRead;
 let mut chunks = Vec::new();
 for _ in 0..4 {
  let mut bytes = Vec::new();
  while bytes.len() < 8*1024*1024 { let n=input.read_until(b'\n', &mut bytes).unwrap(); if n==0 {break;} }
  chunks.push(String::from_utf8(bytes).unwrap());
 }
 let text = chunks.concat();
 for outputs in [false,true] {
  let baseline=project_codex(&text,outputs,4000);
  let resumed=project_incremental(&chunks,outputs,4000);
  assert_eq!(baseline,resumed);
  let naive: Vec<Value> = chunks.iter().flat_map(|s|project_codex(s,outputs,4000)).collect();
  println!("{}", json!({"sampleBytes":text.len(),"includeOutputs":outputs,"turns":baseline.len(),"statefulExactMatch":true,"independentChunkMatch":naive==baseline}));
 }
}
'''
(root/'src').mkdir(exist_ok=True)
(root/'src/main.rs').write_text('use serde_json::{Value,json};\n'+projector+incremental+helpers+main)
subprocess.run(['cargo','run','--release','--offline','--manifest-path',str(root/'Cargo.toml'),'--',__import__('sys').argv[1]],check=True)
