#!/usr/bin/env python3
"""Black-box the installed downloader across a process-level interrupted transfer."""
import hashlib, http.server, json, os, pathlib, socket, subprocess, tempfile, threading

PAYLOAD = (b"agent-colab-resume-probe-" * 400000)[:8 * 1024 * 1024]

class Handler(http.server.BaseHTTPRequestHandler):
    healthy = False
    def log_message(self, *_args): pass
    def do_GET(self):
        start = int(self.headers.get("Range", "bytes=0-").split("=")[1].split("-")[0])
        remaining = PAYLOAD[start:]
        self.send_response(206 if start else 200)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(len(remaining)))
        if start: self.send_header("Content-Range", f"bytes {start}-{len(PAYLOAD)-1}/{len(PAYLOAD)}")
        self.end_headers()
        amount = len(remaining) if Handler.healthy else min(len(remaining), 64 * 1024)
        self.wfile.write(remaining[:amount]); self.wfile.flush()
        if not Handler.healthy:
            self.connection.shutdown(socket.SHUT_RDWR); self.connection.close()

def invoke(setup_path, home, url, digest, target):
    code = """import importlib.machinery,importlib.util,pathlib,sys
p=sys.argv[1]; loader=importlib.machinery.SourceFileLoader('installed_setup',p); spec=importlib.util.spec_from_loader(loader.name,loader); m=importlib.util.module_from_spec(spec); loader.exec_module(m)
m.download(sys.argv[2],sys.argv[3],int(sys.argv[4]),pathlib.Path(sys.argv[5]))
"""
    return subprocess.run(["python3","-c",code,str(setup_path),url,digest,str(len(PAYLOAD)),str(target)],env={**os.environ,"HOME":str(home)},capture_output=True,text=True)

def main():
    setup_path = pathlib.Path.home()/".local/share/agent-colab/current/skill/setup/colab-setup"
    digest = hashlib.sha256(PAYLOAD).hexdigest()
    server = http.server.ThreadingHTTPServer(("127.0.0.1",0),Handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    with tempfile.TemporaryDirectory(prefix="colab-resume-probe-") as directory:
        root=pathlib.Path(directory); home=root/"home"; home.mkdir(); target=root/"artifact.bin"
        url=f"http://127.0.0.1:{server.server_port}/artifact.bin"
        first=invoke(setup_path,home,url,digest,target)
        cache=home/".local/share/agent-colab/downloads"; part=cache/f"{digest}.part"
        interrupted=part.stat().st_size
        Handler.healthy=True
        second=invoke(setup_path,home,url,digest,target)
        progress=json.loads((home/".local/share/agent-colab/update-progress.json").read_text())
        result={"firstExit":first.returncode,"partialBytes":interrupted,"secondExit":second.returncode,"finalBytes":target.stat().st_size,"sha256":hashlib.sha256(target.read_bytes()).hexdigest(),"progress":progress}
        print(json.dumps(result,indent=2))
        if not (first.returncode and interrupted>0 and second.returncode==0 and result["sha256"]==digest and progress["state"]=="completed"): raise SystemExit(1)
    server.shutdown()

if __name__=="__main__": main()
