"""Bounded-memory, frozen-extent trial; never prints transcript content."""
import argparse, gzip, hashlib, json, pathlib, subprocess, time

p = argparse.ArgumentParser()
p.add_argument('source')
a = p.parse_args()
root = pathlib.Path(__file__).resolve().parent
extent = pathlib.Path(a.source).stat().st_size
target = 8 * 1024 * 1024
metrics = {k: {'bytes': 0, 'compressSeconds': 0, 'decompressSeconds': 0} for k in ['zstd-1', 'zstd-3', 'gzip-1']}
manifest, records, invalid, mismatches = [], 0, 0, 0
source_hash, restored_hash = hashlib.sha256(), hashlib.sha256()
started = time.perf_counter()
with open(a.source, 'rb') as f:
    while f.tell() < extent:
        start = f.tell()
        block = bytearray()
        count = 0
        while f.tell() < extent and len(block) < target:
            line = f.readline(extent - f.tell())
            if not line.endswith(b'\n'):
                f.seek(-len(line), 1)
                break
            block.extend(line)
            count += 1
            try:
                json.loads(line)
            except (ValueError, UnicodeDecodeError):
                invalid += 1
        if not block:
            break
        raw = bytes(block)
        source_hash.update(raw)
        digest = hashlib.sha256(raw).hexdigest()
        end = f.tell()
        for codec, m in metrics.items():
            t = time.perf_counter()
            if codec.startswith('zstd'):
                encoded = subprocess.run(['zstd', '-q', '-' + codec.split('-')[1], '-c'], input=raw, capture_output=True, check=True).stdout
            else:
                encoded = gzip.compress(raw, compresslevel=1, mtime=0)
            m['compressSeconds'] += time.perf_counter() - t
            m['bytes'] += len(encoded)
            t = time.perf_counter()
            decoded = subprocess.run(['zstd', '-q', '-d', '-c'], input=encoded, capture_output=True, check=True).stdout if codec.startswith('zstd') else gzip.decompress(encoded)
            m['decompressSeconds'] += time.perf_counter() - t
            assert decoded == raw, 'roundtrip mismatch'
            if codec == 'zstd-3':
                restored_hash.update(decoded)
        # Reopen at the persisted cursor, not the previous file handle position.
        with open(a.source, 'rb') as resumed:
            resumed.seek(start)
            assert hashlib.sha256(resumed.read(end-start)).hexdigest() == digest, 'resume mismatch/source rewrite'
        manifest.append({'start': start, 'end': end, 'records': count, 'sha256': digest})
        records += count
        if len(manifest) % 20 == 0:
            print(json.dumps({'chunks': len(manifest), 'processedBytes': end}), flush=True)
assert all(x['end'] == y['start'] for x,y in zip(manifest, manifest[1:]))
assert source_hash.digest() == restored_hash.digest()
report = {'frozenBytes': extent, 'completeBytes': manifest[-1]['end'], 'incompleteTailBytes': extent-manifest[-1]['end'], 'chunks': len(manifest), 'records': records, 'invalidRecords': invalid, 'roundtripAndResume': True, 'codecs': metrics, 'wallSeconds': time.perf_counter()-started}
(root/'manifest.json').write_text(json.dumps(manifest, indent=2))
(root/'results.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
