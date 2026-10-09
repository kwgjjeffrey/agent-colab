use std::{io::{Read, Seek, SeekFrom, Write},time::Instant};
use serde_json::{Value,json};
fn main() {
 let args:Vec<_>=std::env::args().collect();
 let manifest:Value=serde_json::from_slice(&std::fs::read(&args[2]).unwrap()).unwrap();
 let entries=manifest.as_array().unwrap();
 let mut f=std::fs::File::open(&args[1]).unwrap();
 let full=args.get(4).map(String::as_str)==Some("full");
 let indices:Vec<usize>=if full {(0..entries.len()).collect()} else {vec![0,entries.len()/2,entries.len()-1]};
 let mut results=Vec::new();
 for (codec,level) in [("zstd",1),("zstd",3),("zstd",6),("zstd",9),("zstd",12),("zstd",15),("gzip",6),("gzip",9),("brotli",6),("brotli",9)] {
  let(mut bytes,mut compression,mut decompression)=(0usize,0f64,0f64);
  let mut sample_bytes=0usize;let mut block_times=Vec::new();
  for &i in &indices {
   let offset=entries[i]["start"].as_u64().unwrap();let end=entries[i]["end"].as_u64().unwrap();
   f.seek(SeekFrom::Start(offset)).unwrap();let mut raw=vec![0;(end-offset) as usize];f.read_exact(&mut raw).unwrap();sample_bytes+=raw.len();
   let start=Instant::now();
   let encoded=match codec {
    "zstd"=>zstd::stream::encode_all(raw.as_slice(),level).unwrap(),
    "gzip"=>{let mut w=flate2::write::GzEncoder::new(Vec::new(),flate2::Compression::new(level as u32));w.write_all(&raw).unwrap();w.finish().unwrap()},
    _=>{let mut out=Vec::new();{let mut w=brotli::CompressorWriter::new(&mut out,65536,level as u32,22);w.write_all(&raw).unwrap();}out}
   }; let elapsed=start.elapsed().as_secs_f64();compression+=elapsed;block_times.push(elapsed); bytes+=encoded.len();
   let start=Instant::now(); let mut decoded=Vec::new();
   match codec {"zstd"=>{decoded=zstd::stream::decode_all(encoded.as_slice()).unwrap();},"gzip"=>{flate2::read::GzDecoder::new(encoded.as_slice()).read_to_end(&mut decoded).unwrap();},_=>{brotli::Decompressor::new(encoded.as_slice(),65536).read_to_end(&mut decoded).unwrap();}}
   decompression+=start.elapsed().as_secs_f64();assert_eq!(decoded,raw);
  }
  block_times.sort_by(f64::total_cmp);
  let row=json!({"codec":codec,"level":level,"sampleBytes":sample_bytes,"blocks":indices.len(),"compressedBytes":bytes,"compressSeconds":compression,"blockCompressP50Seconds":block_times[block_times.len()/2],"blockCompressP95Seconds":block_times[(block_times.len()-1)*95/100],"blockCompressMaxSeconds":block_times[block_times.len()-1],"decompressSeconds":decompression,"exactRoundtrip":true});
  println!("{row}");results.push(row);
  std::fs::write(&args[3],serde_json::to_vec_pretty(&results).unwrap()).unwrap();
 }
 std::fs::write(&args[3],serde_json::to_vec_pretty(&results).unwrap()).unwrap();
}
