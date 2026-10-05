import {pathToFileURL} from 'node:url';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const skillRoot=process.env.TRACE_SKILL_ROOT || path.join(os.homedir(),'.codex/skills/trace');
const {load}=await import(pathToFileURL(path.join(skillRoot,'instrumentation/scripts/registry.mjs')).href);
const discovery=()=>JSON.parse(fs.readFileSync(process.env.COLAB_DISCOVERY_FILE || path.join(os.homedir(),'.local/share/agent-colab/discovery.json'),'utf8'));
const headers=(req,d)=>({...req.headers,host:new URL(d.endpoint).host,...(req.headers.origin?{origin:new URL(d.endpoint).origin}:{}),authorization:`Bearer ${d.bearer}`,'accept-encoding':'identity'});
// Credentials remain in the loopback proxy. No credential enters the registry or HTML.
const server=http.createServer((req,res)=>{
 if(req.headers.host!==`127.0.0.1:${server.address().port}` || (req.headers.origin && req.headers.origin!==`http://127.0.0.1:${server.address().port}`)){res.writeHead(403);return res.end('Use the loopback URL');}
 if(req.url==='/locator/entries.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(load(path.resolve(root,'../..')).operations));}
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname.startsWith('/trial')){res.writeHead(410,{'Content-Type':'text/plain; charset=utf-8'});return res.end('旧验证页面已退出使用，请打开正式 Trace 清单：http://127.0.0.1:53481/');}
 const files={'/locate':'index.html','/locator/bootstrap.mjs':'bootstrap.mjs','/locator/runtime.mjs':'../page-locator/browser.mjs'};
 if(files[pathname]){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',req.url.endsWith('.json')?'application/json':/\.m?js$/.test(pathname)?'text/javascript':'text/html');return res.end(fs.readFileSync(path.join(root,files[pathname]),'utf8').replace('id="gui" src="/"',`id="gui" src="/?trace-locator=${Date.now()}"`));}
 const d=discovery(),u=new URL(pathname==='/embed'?'/':req.url,d.endpoint);
 const proxyHeaders=headers(req,d);if(pathname==='/'){delete proxyHeaders['if-none-match'];delete proxyHeaders['if-modified-since'];}
 const upstream=http.request(u,{method:req.method,headers:proxyHeaders},r=>{
  const h={...r.headers};if((r.headers['content-type']||'').includes('text/html')){h['cache-control']='no-store';delete h.etag;delete h['last-modified'];}delete h['content-length'];delete h['transfer-encoding'];
  res.writeHead(r.statusCode,h);
  if((r.headers['content-type']||'').includes('text/html')){
   let body='';r.setEncoding('utf8');r.on('data',c=>body+=c);r.on('end',()=>res.end(body.replace('</head>','<script type="application/json" id="trace-locator-config">'+JSON.stringify({catalogOrigin:process.env.TRACE_CATALOG_ORIGIN||'http://127.0.0.1:53481'}).replaceAll('<','\\u003c')+'</script><script type="module" src="/locator/bootstrap.mjs"></script></head>')));
  }else r.pipe(res);
 });upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Local Core unavailable');});req.pipe(upstream);
});
// Preserve the existing realtime WebSocket via a transparent byte tunnel.
server.on('upgrade',(req,socket,head)=>{
 if(req.headers.host!==`127.0.0.1:${server.address().port}` || (req.headers.origin && req.headers.origin!==`http://127.0.0.1:${server.address().port}`)){socket.destroy();return;}
 const d=discovery(),u=new URL(d.endpoint);const remote=net.connect(Number(u.port),u.hostname,()=>{
  const h=headers(req,d);remote.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`+Object.entries(h).map(([k,v])=>`${k}: ${v}`).join('\r\n')+'\r\n\r\n');if(head.length)remote.write(head);socket.pipe(remote);remote.pipe(socket);
 });remote.on('error',()=>socket.destroy());socket.on('error',()=>remote.destroy());socket.on('close',()=>remote.destroy());
});
server.listen(Number(process.env.TRACE_LOCATOR_PORT||53480),'127.0.0.1',()=>console.log(`http://127.0.0.1:${server.address().port}/locate`));
