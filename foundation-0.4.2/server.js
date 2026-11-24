import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, AppError } from './store.js';
const here=path.dirname(fileURLToPath(import.meta.url));
export async function createApp({root=path.join(here,'studio-workspace'),dev=true}={}) {
  const store=new Store(root);await store.init();
  const vite=dev?await (await import('vite')).createServer({root:here,server:{middlewareMode:true},appType:'spa'}):null;
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const server=http.createServer(async(req,res)=>{
    try {
      if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host||'')) throw new AppError('로컬 접속만 지원합니다.',403);
      if(req.headers.origin && req.headers.origin!==`http://${req.headers.host}`) throw new AppError('다른 사이트에서의 요청은 허용하지 않습니다.',403);
      const url=new URL(req.url,'http://localhost');
      if(url.pathname.startsWith('/api/')) {
        if(req.method==='GET'&&url.pathname==='/api/state') return json(res,200,await store.state());
        const projectMatch=url.pathname.match(/^\/api\/projects\/([0-9a-f-]+)$/);
        if(req.method==='GET'&&projectMatch) return json(res,200,await store.project(projectMatch[1]));
        const fileMatch=url.pathname.match(/^\/api\/files\/([0-9a-f]{64})$/);
        if(req.method==='GET'&&fileMatch) {
          const bytes=await readFile(path.join(store.root,'blobs',fileMatch[1])).catch(()=>{throw new AppError('파일을 찾을 수 없습니다.',404);});
          const ext=url.searchParams.get('ext');
          const mime={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',glb:'model/gltf-binary'}[ext]||'application/octet-stream';
          res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(url.searchParams.has('download')?{'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(url.searchParams.get('name')||'asset.'+ext)}:{})});return res.end(bytes);
        }
        if(req.method==='POST'||req.method==='PUT') {
          let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>68*1024*1024)throw new AppError('파일이 너무 큽니다.',413);chunks.push(c);}
          let body;try {body=JSON.parse(Buffer.concat(chunks).toString());}catch{throw new AppError('요청 형식 오류');}
          if(req.method==='POST'&&url.pathname==='/api/projects') return json(res,201,await store.serial(()=>store.createProject(body.name)));
          if(req.method==='PUT'&&projectMatch) return json(res,200,await store.serial(()=>store.saveProject(projectMatch[1],body.project,body.expectedRevision)));
          if(req.method==='POST'&&url.pathname==='/api/assets')return json(res,201,await store.serial(()=>store.importAsset(body)));
        }
        throw new AppError('지원하지 않는 요청',404);
      }
      if(vite)return vite.middlewares(req,res,()=>{res.writeHead(404);res.end();});
      const files={'/':'index.html','/index.html':'index.html'};
      const relative=files[url.pathname]||(url.pathname.startsWith('/assets/')?url.pathname.slice(1):null);
      if(!relative||relative.includes('..')||relative.includes('\\'))throw new AppError('찾을 수 없습니다.',404);
      const data=await readFile(path.join(here,'dist',relative));
      res.writeHead(200,{'Content-Type':relative.endsWith('.woff2')?'font/woff2':relative.endsWith('.txt')?'text/plain; charset=utf-8':relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':'text/html; charset=utf-8'});res.end(data);
    } catch(e) {json(res,e.status||500,{error:e.status?e.message:'저장 또는 읽기에 실패했습니다. 원본은 보존됩니다.'});console.error(e.message);}
  });
  server.on('close',()=>vite?.close());return {server,store};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {server}=await createApp({root:process.env.STUDIO_WORKSPACE,dev:process.env.NODE_ENV!=='production'});
 server.listen(Number(process.env.PORT||4310),'127.0.0.1',()=>console.log('Level Design Studio: http://127.0.0.1:'+ (process.env.PORT||4310)));
}
