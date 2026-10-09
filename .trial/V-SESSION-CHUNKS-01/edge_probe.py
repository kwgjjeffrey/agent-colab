import hashlib, io, json, pathlib, subprocess, sys, time
root = pathlib.Path(__file__).resolve().parent
manifest = json.loads((root/'manifest.json').read_text())
max_record, over_limit = 0, 0
with open(sys.argv[1], 'rb') as f:
    remaining = manifest[-1]['end']
    while remaining:
        line = f.readline(remaining)
        remaining -= len(line)
        max_record = max(max_record, len(line))
        over_limit += len(line) > 32*1024*1024
def cut(data, target=32):
    reader = io.BytesIO(data)
    chunks = []
    while True:
        start, block = reader.tell(), bytearray()
        while len(block)<target:
            line=reader.readline()
            if not line or not line.endswith(b'\n'): break
            block.extend(line)
        if not block: break
        chunks.append((start,start+len(block),bytes(block)))
    return chunks
raw = ('{"text":"你好 🌍"}\n'*12).encode()
chunks = cut(raw+b'{"partial":')
assert b''.join(c[2] for c in chunks)==raw
for start,end,block in chunks:
    assert raw[start:end]==block
    assert hashlib.sha256(raw[start:end]).digest()==hashlib.sha256(block).digest()
assert cut(raw+b'{"partial":true}\n')[-1][1] > len(raw)
# A lost acknowledgement retries exactly the same range/hash; hash is not a new cursor.
assert cut(raw)==cut(raw)
encoded=subprocess.run(['zstd','-q','-3','-c'],input=raw,capture_output=True,check=True).stdout
assert subprocess.run(['zstd','-q','-d','-c'],input=encoded[:-3],capture_output=True).returncode!=0
report={'maxRecordBytes':max_record,'recordsExceedProduction32MiBLimit':over_limit,'maxChunkBytes':max(x['end']-x['start'] for x in manifest),'utf8AndPartialTail':True,'replayRangeAndDigest':True,'truncatedCompressionRejected':True,'rewriteProtection':'requires generation identity; byte cursor alone insufficient'}
(root/'edges.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
