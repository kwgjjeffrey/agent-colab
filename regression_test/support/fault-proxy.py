"""Owned loopback TCP fault boundary. Forwards real HTTP/WebSocket bytes without logging them."""
import pathlib,socket,socketserver,select,sys,time,threading,re
state=pathlib.Path(sys.argv[1]);host=sys.argv[2];port=int(sys.argv[3]);listen=int(sys.argv[4])
class Handler(socketserver.BaseRequestHandler):
 def handle(self):
  up=None
  try:
   raw=b''
   while b'\r\n\r\n' not in raw:
    raw+=self.request.recv(65536)
    if not raw:return
   path=raw.split(b' ',2)[1].decode();websocket=b'upgrade: websocket' in raw.lower();session_upload=raw.startswith(b'POST ') and '/sessions/' in path and path.split('?')[0].endswith('/segments');publication=session_upload or any(x in path for x in ['/sync-','/file-revisions','/git-objects','/session-segments']) or '/files/' in path and '/revisions' in path
   def blocked():
    mode=state.read_text().strip() if state.exists() else 'on'
    return mode=='off' or mode=='publication-off' and publication or mode=='work-events-off' and '/agent-requests/' in path and path.endswith('/events') and raw.startswith(b'POST ') or mode=='realtime-off' and websocket
   if blocked():return
   up=socket.create_connection((host,port),timeout=10)
   if not websocket:
    lines=raw.split(b'\r\n');raw=b'\r\n'.join(x for x in lines if not x.lower().startswith(b'connection:'));raw=raw.replace(b'\r\n\r\n',b'\r\nConnection: close\r\n\r\n',1)
   raw=re.sub(br'(?im)^host:[^\r\n]+',('Host: '+host+':'+str(port)).encode(),raw)
   if session_upload and state.exists() and state.read_text().strip()=='session-slow':
    # Delay inside the real body transaction independent of compression ratio.
    # Headers start Server processing; 35s exceeds its old 30s metadata policy,
    # but stays below the intentional 60s upload idle timeout.
    header,body=raw.split(b'\r\n\r\n',1);up.sendall(header+b'\r\n\r\n');time.sleep(35);up.sendall(body)
   else:up.sendall(raw)
   up.setblocking(True);self.request.setblocking(True)
   while not blocked():
    ready,_,_=select.select([up,self.request],[],[],.2)
    for source in ready:
     b=source.recv(65536)
     if not b:return
     (self.request if source is up else up).sendall(b)
  except (OSError,IndexError) as e:print(type(e).__name__,flush=True)
  finally:
   if up:up.close()
class Server(socketserver.ThreadingTCPServer):allow_reuse_address=True;daemon_threads=True
Server(('127.0.0.1',listen),Handler).serve_forever()
