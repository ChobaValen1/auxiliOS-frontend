// Local-only fixture server. Never exposes files outside this checkout.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  const file=path.resolve(root,'.'+(pathname==='/'?'/test/fixtures/driver-handoff-preview.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  if(!['.html','.css','.js','.png','.svg','.ico'].includes(path.extname(file))){res.writeHead(404);return res.end();}
  fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);return res.end();}
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');
    res.setHeader('Cache-Control','no-store');res.end(data);
  });
}).listen(4178,'127.0.0.1',()=>console.log('Handoff fixture: http://127.0.0.1:4178'));
