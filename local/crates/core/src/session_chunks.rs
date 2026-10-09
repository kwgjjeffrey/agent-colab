//! Independent frames and a bounded, seekable transcript view. The caller must authorize
//! the pinned manifest before loading bytes; this module has no credentials or server access.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{self, Read, Seek, SeekFrom, Write};

pub const ZSTD_LEVEL: i32 = 3;
// An 8 MiB target can overshoot by one complete 32 MiB provider record.
pub const MAX_DECODED_BYTES: u64 = 40 * 1024 * 1024;
pub const MAX_ENCODED_BYTES: u64 = MAX_DECODED_BYTES + 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chunk {
    pub id: String,
    pub codec: String,
    pub encoded_bytes: u64,
    pub encoded_digest: String,
    pub decoded_bytes: u64,
    pub decoded_digest: String,
}

fn invalid(message: &'static str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
fn digest(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

pub fn encode(id: String, raw: &[u8]) -> io::Result<(Chunk, Vec<u8>)> {
    if raw.is_empty() || raw.len() as u64 > MAX_DECODED_BYTES {
        return Err(invalid("Session chunk size invalid"));
    }
    let mut encoder = zstd::stream::Encoder::new(Vec::new(), ZSTD_LEVEL)?;
    encoder.include_checksum(true)?;
    encoder.write_all(raw)?;
    let encoded = encoder.finish()?;
    let chunk = Chunk {
        id,
        codec: "zstd".into(),
        encoded_bytes: encoded.len() as u64,
        encoded_digest: digest(&encoded),
        decoded_bytes: raw.len() as u64,
        decoded_digest: digest(raw),
    };
    Ok((chunk, encoded))
}

impl Chunk {
    pub fn validate(&self) -> io::Result<()> {
        let is_digest = |s: &str| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit());
        if !matches!(self.codec.as_str(), "identity" | "zstd")
            || self.encoded_bytes == 0
            || self.encoded_bytes > if self.codec == "identity" {256 * 1024 * 1024} else {MAX_ENCODED_BYTES}
            || self.decoded_bytes == 0
            || self.decoded_bytes > if self.codec == "identity" {256 * 1024 * 1024} else {MAX_DECODED_BYTES}
            || !is_digest(&self.encoded_digest)
            || !is_digest(&self.decoded_digest)
        {
            return Err(invalid("Session chunk metadata invalid"));
        }
        Ok(())
    }

    pub fn decode(&self, encoded: &[u8]) -> io::Result<Vec<u8>> {
        self.validate()?;
        if encoded.len() as u64 != self.encoded_bytes || digest(encoded) != self.encoded_digest {
            return Err(invalid("Session encoded chunk mismatch"));
        }
        let raw = match self.codec.as_str() {
            "identity" => encoded.to_vec(),
            "zstd" => {
                // A manifest entry is exactly one frame, not concatenated frames or trailing junk.
                if zstd::zstd_safe::find_frame_compressed_size(encoded)
                    .map_err(|_| invalid("Session frame invalid"))?
                    != encoded.len()
                {
                    return Err(invalid("Session frame has trailing data"));
                }
                let mut decoder = zstd::stream::read::Decoder::new(encoded)?;
                decoder.window_log_max(26)?;
                let mut raw = Vec::new();
                decoder.take(self.decoded_bytes + 1).read_to_end(&mut raw)?;
                raw
            }
            _ => unreachable!(),
        };
        if raw.len() as u64 != self.decoded_bytes || digest(&raw) != self.decoded_digest {
            return Err(invalid("Session decoded chunk mismatch"));
        }
        Ok(raw)
    }
}

/// Exposes the logical original byte offsets without concatenating a snapshot file.
/// Only one decoded block is retained. Provider boundary/dependency indexing belongs
/// above this adapter; byte seeking alone must not be mistaken for turn pagination.
pub struct ChunkReader<F> {
    chunks: Vec<Chunk>,
    offsets: Vec<u64>,
    position: u64,
    cached: Option<(usize, Vec<u8>)>,
    load: F,
}

impl<F: FnMut(&Chunk) -> io::Result<Vec<u8>>> ChunkReader<F> {
    pub fn new(chunks: Vec<Chunk>, load: F) -> io::Result<Self> {
        let mut offsets = vec![0_u64];
        for chunk in &chunks {
            chunk.validate()?;
            offsets.push(
                offsets
                    .last()
                    .unwrap()
                    .checked_add(chunk.decoded_bytes)
                    .ok_or_else(|| invalid("Session size overflow"))?,
            );
        }
        Ok(Self {
            chunks,
            offsets,
            position: 0,
            cached: None,
            load,
        })
    }
    pub fn len(&self) -> u64 {
        *self.offsets.last().unwrap()
    }
    pub fn is_empty(&self) -> bool {
        self.chunks.is_empty()
    }
}

impl<F: FnMut(&Chunk) -> io::Result<Vec<u8>>> Read for ChunkReader<F> {
    fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
        if output.is_empty() || self.position >= self.len() {
            return Ok(0);
        }
        let index = self
            .offsets
            .partition_point(|offset| *offset <= self.position)
            - 1;
        if self.cached.as_ref().map(|(i, _)| *i) != Some(index) {
            // Drop the preceding block before allocation. A failed load never advances position.
            self.cached = None;
            let encoded = (self.load)(&self.chunks[index])?;
            self.cached = Some((index, self.chunks[index].decode(&encoded)?));
        }
        let raw = &self.cached.as_ref().unwrap().1;
        let start = (self.position - self.offsets[index]) as usize;
        let count = output.len().min(raw.len() - start);
        output[..count].copy_from_slice(&raw[start..start + count]);
        self.position += count as u64;
        Ok(count)
    }
}

impl<F: FnMut(&Chunk) -> io::Result<Vec<u8>>> Seek for ChunkReader<F> {
    fn seek(&mut self, request: SeekFrom) -> io::Result<u64> {
        let next = match request {
            SeekFrom::Start(offset) => offset as i128,
            SeekFrom::Current(offset) => self.position as i128 + offset as i128,
            SeekFrom::End(offset) => self.len() as i128 + offset as i128,
        };
        if !(0..=u64::MAX as i128).contains(&next) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid Session seek",
            ));
        }
        self.position = next as u64;
        Ok(self.position)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn zstd_three_and_identity_preserve_bytes() {
        let raw = "{\"text\":\"中文🦀\"}\n".as_bytes();
        let (mut metadata, encoded) = encode("a".into(), raw).unwrap();
        assert_eq!(metadata.decode(&encoded).unwrap(), raw);
        metadata.codec = "identity".into();
        metadata.encoded_bytes = raw.len() as u64;
        metadata.encoded_digest = digest(raw);
        assert_eq!(metadata.decode(raw).unwrap(), raw);
    }
    #[test]
    fn rejects_corruption_truncation_trailing_frames_and_false_decoded_size() {
        let (metadata, encoded) = encode("a".into(), &[7; 4096]).unwrap();
        let mut damaged = encoded.clone();
        damaged[0] ^= 1;
        assert!(metadata.decode(&damaged).is_err());
        assert!(metadata.decode(&encoded[..encoded.len() - 1]).is_err());
        let mut small = metadata.clone();
        small.decoded_bytes = 1;
        assert!(small.decode(&encoded).is_err());
        let mut joined = encoded.clone();
        joined.extend_from_slice(&encoded);
        let mut multiple = metadata.clone();
        multiple.encoded_bytes = joined.len() as u64;
        multiple.encoded_digest = digest(&joined);
        assert!(multiple.decode(&joined).is_err());
        let mut corrupt = metadata.clone();
        corrupt.encoded_digest = digest(&damaged);
        assert!(corrupt.decode(&damaged).is_err());
    }
    #[test]
    fn seeks_to_tail_without_loading_preceding_chunks_and_reads_across_boundary() {
        let blocks = [b"first".as_slice(), b"middle", b"last"];
        let pairs: Vec<_> = blocks
            .iter()
            .enumerate()
            .map(|(i, raw)| encode(i.to_string(), raw).unwrap())
            .collect();
        let mut loads = Vec::new();
        {
            let mut reader = ChunkReader::new(
                pairs.iter().map(|(chunk, _)| chunk.clone()).collect(),
                |chunk: &Chunk| {
                    let index = chunk.id.parse::<usize>().unwrap();
                    loads.push(index);
                    Ok(pairs[index].1.clone())
                },
            )
            .unwrap();
            reader.seek(SeekFrom::End(-4)).unwrap();
            let mut tail = Vec::new();
            reader.read_to_end(&mut tail).unwrap();
            assert_eq!(tail, b"last");
            reader.seek(SeekFrom::Start(3)).unwrap();
            let mut slice = [0; 5];
            reader.read_exact(&mut slice).unwrap();
            assert_eq!(&slice, b"stmid");
            assert!(reader.seek(SeekFrom::Current(-100)).is_err());
        }
        assert_eq!(loads, vec![2, 0, 1]);
    }
    #[test]
    fn empty_view_and_failed_load_leave_position_intact() {
        let mut empty = ChunkReader::new(Vec::new(), |_| Ok(Vec::new())).unwrap();
        assert!(empty.is_empty());
        assert_eq!(empty.read(&mut [0; 1]).unwrap(), 0);
        let (chunk, _) = encode("a".into(), b"text").unwrap();
        let mut reader =
            ChunkReader::new(vec![chunk], |_| Err(io::Error::other("offline"))).unwrap();
        assert!(reader.read(&mut [0; 1]).is_err());
        assert_eq!(reader.stream_position().unwrap(), 0);
    }
}
