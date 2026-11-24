import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../store.js';
import {saveAssetCatalog} from '../infrastructure/asset-catalog.js';

const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.glb':'model/gltf-binary', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.txt':'text/plain; charset=utf-8' };
const json = (data, status=200) => new Response(JSON.stringify(data), { status, headers:{'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'} });
export const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://tile.openstreetmap.org; connect-src 'self' blob: data: https://tile.openstreetmap.org; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'";

// A private application protocol; no TCP listener or development server is used.
export function createLocalHandler({ getStore, getMonitor=()=>null, distRoot }) {
  return async request => {
    try {
      const url = new URL(request.url);
      if (url.protocol !== 'studio:' || url.hostname !== 'app' || url.port || url.username || url.password) throw new AppError('허용하지 않는 주소입니다.',403);
      const origin = request.headers.get('origin');
      if (origin && origin !== 'studio://app') throw new AppError('다른 출처의 요청은 허용하지 않습니다.',403);
      const store = getStore();
      const monitor=getMonitor();
      if(request.method==='GET'&&url.pathname==='/api/asset-monitor')return json(monitor?monitor.snapshot():{rows:[],integrity:[]});
      const projectMatch = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})$/);
      if(request.method==='GET' && url.pathname==='/api/state') return json(await store.state());
      if(request.method==='GET' && projectMatch) return json(await store.project(projectMatch[1]));
      const operation=url.pathname.match(/^\/api\/foundation\/([0-9a-f-]{36})\/(inspect|recovery|usages|versions)$/);
      if(request.method==='GET'&&operation){if(operation[2]==='versions')return json(await store.versions(operation[1]));if(operation[2]==='inspect')return json(await store.inspect(operation[1]));if(operation[2]==='recovery')return json(await store.recoveries(operation[1]));return json(await store.usages(operation[1]));}
      const fileMatch = url.pathname.match(/^\/api\/files\/([0-9a-f]{64})$/);
      if(request.method==='GET' && fileMatch) {
        const bytes = await readFile(store.findBlob?await store.findBlob(fileMatch[1]):path.join(store.root,'blobs',fileMatch[1])).catch(()=>{throw new AppError('파일을 찾을 수 없습니다.',404);});
        const ext = '.'+(url.searchParams.get('ext')||'');
        return new Response(bytes,{headers:{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(url.searchParams.has('download')?{'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(url.searchParams.get('name')||'asset'+ext)}:{})}});
      }
      if(url.pathname.startsWith('/api/')) {
        if(!['POST','PUT'].includes(request.method)) throw new AppError('지원하지 않는 요청입니다.',404);
        const raw=await request.text();
        if(Buffer.byteLength(raw)>68*1024*1024) throw new AppError('파일이 너무 큽니다.',413);
        let body;try{body=JSON.parse(raw);}catch{throw new AppError('요청 형식 오류');}
        if(!body || typeof body!=='object') throw new AppError('요청 형식 오류');
        if(request.method==='POST'&&url.pathname.startsWith('/api/asset-monitor/')){if(!monitor)throw new AppError('데스크톱 변경 감지 서비스가 없습니다.');const action=url.pathname.split('/').pop();if(action==='active'){monitor.activeProjectId=body.id||null;return json({ok:true});}if(action==='scan'){await monitor.scan();return json(monitor.snapshot());}if(action==='decision')return json(await monitor.decide(body));if(action==='relink')return json(await monitor.relink(body));}
        if(request.method==='POST' && url.pathname==='/api/projects') return json(await store.serial(()=>store.createProject(body.name,body)),201);
        if(request.method==='POST' && url.pathname==='/api/foundation/import')return json(await store.serial(()=>store.importLegacy(body.sourceRoot,body.id)));
        if(request.method==='POST' && url.pathname==='/api/foundation/duplicate')return json(await store.serial(()=>store.duplicate(body.id,body.name,body.folder)));
        if(request.method==='POST' && operation&&operation[2]==='recovery')return json(await store.serial(()=>body.mode?body.mode==='version'?store.restoreVersion(operation[1],body.generation,body.expectedGeneration):store.applyRecovery(operation[1],body.mode,body.expectedGeneration):store.writeRecovery(operation[1],body.project)));
        if(request.method==='PUT' && projectMatch) return json(await store.serial(()=>store.saveProject(projectMatch[1],body.project,body.expectedRevision)));
        if(request.method==='POST' && url.pathname==='/api/assets/catalog')return json(await store.serial(()=>saveAssetCatalog(store,body)));
        if(request.method==='POST' && url.pathname==='/api/assets') return json(await (monitor?monitor.requestImport(body):store.serial(()=>store.importAsset(body))),201);
        throw new AppError('지원하지 않는 요청입니다.',404);
      }
      if(request.method!=='GET') throw new AppError('지원하지 않는 요청입니다.',405);
      const relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
      if(relative!=='index.html' && !/^assets\/[a-zA-Z0-9_.-]+$/.test(relative)) throw new AppError('찾을 수 없습니다.',404);
      const bytes=await readFile(path.join(distRoot,relative)).catch(()=>{throw new AppError('프로그램 파일을 찾을 수 없습니다. 다시 설치해 주세요.',404);});
      return new Response(bytes,{headers:{'Content-Type':mime[path.extname(relative)]||'application/octet-stream','Content-Security-Policy':CSP,'X-Content-Type-Options':'nosniff'}});
    } catch(error) {
      return json({error:error.status?error.message:'저장 또는 읽기에 실패했습니다. 원본 파일은 보존됩니다.'},error.status||500);
    }
  };
}
