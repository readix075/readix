const http = require('http');
const fs = require('fs');
const path = require('path');
const port = process.env.PORT || 3000;
const root = __dirname;
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/markdown; charset=utf-8'};
const server = http.createServer((req,res)=>{
  const raw = decodeURIComponent((req.url||'/').split('?')[0]);
  const requested = raw === '/' ? '/index.html' : raw;
  const file = path.normalize(path.join(root, requested));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file,(err,st)=>{
    const target = !err && st.isFile() ? file : (raw.startsWith('/app') ? path.join(root,'app.html') : path.join(root,'index.html'));
    fs.readFile(target,(e,data)=>{
      if(e){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Not found');}
      res.writeHead(200,{'Content-Type':types[path.extname(target).toLowerCase()]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data);
    });
  });
});
server.listen(port,()=>console.log(`Readix Reader running on port ${port}`));
