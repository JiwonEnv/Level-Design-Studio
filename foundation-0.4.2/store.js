import { mkdir, readFile, writeFile, rename, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { upgradeProject, newSceneFields, validateScene, entityIssues } from './core/scene-model.js';

export class AppError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const idPattern = /^[0-9a-f-]{36}$/;
const hashPattern = /^[0-9a-f]{64}$/;
export const allowed = new Set(['fbx','glb','png','jpg','jpeg','webp','tga','exr','psd','pcraft']);
const finiteVector = a => Array.isArray(a) && a.length === 3 && a.every(n => Number.isFinite(n) && Math.abs(n) <= 1e7);
const vectorReference=r=>(r.origin===undefined||finiteVector(r.origin))&&(r.rotation===undefined||Number.isFinite(r.rotation))&&(r.sourceSize===undefined||(Array.isArray(r.sourceSize)&&r.sourceSize.length===2&&r.sourceSize.every(n=>Number.isFinite(n)&&n>0)));
export class Store {
  constructor(root) { this.root = path.resolve(root); this.pending = Promise.resolve(); }
  async init() {
    await mkdir(this.root, { recursive:true });
    await mkdir(path.join(this.root,'blobs'), { recursive:true });
    await mkdir(path.join(this.root,'projects'), { recursive:true });
    try { await readFile(path.join(this.root,'library.json')); }
    catch (e) { if(e.code !== 'ENOENT') throw e; await this.atomic('library.json', { schemaVersion:1, assets:[], projects:[] }); }
  }
  serial(action) { const result = this.pending.then(action); this.pending = result.catch(()=>{}); return result; }
  async read(file) { return JSON.parse(await readFile(path.join(this.root,file),'utf8')); }
  async atomic(file, data) {
    const target = path.join(this.root,file), temp = target+'.tmp';
    await writeFile(temp, JSON.stringify(data,null,2));
    try { await copyFile(target,target+'.bak'); } catch(e) { if(e.code !== 'ENOENT') throw e; }
    await rename(temp,target);
  }
  projectPath(id) { if(!idPattern.test(id)) throw new AppError('잘못된 프로젝트 ID'); return `projects/${id}.json`; }
  async project(id) { try { const project=upgradeProject(await this.read(this.projectPath(id)));validateScene(project);return project; } catch(e) { if(e.code === 'ENOENT') throw new AppError('프로젝트를 찾을 수 없습니다.',404); if(e instanceof AppError)throw e;throw new AppError('프로젝트 검사 실패: '+e.message,422); } }
  async state() { return this.read('library.json'); }
  async createProject(name) {
    if(typeof name !== 'string' || !name.trim() || name.length>100) throw new AppError('프로젝트 이름은 1~100자로 입력하세요.');
    const p = { ...newSceneFields(), id:randomUUID(), name:name.trim(), revision:0, coordinateSystem:{unit:'meter',up:'Z',handedness:'right'}, assets:{}, objects:[], references:[], footprints:[], recipes:[], exportProfile:{engine:'unreal',version:'미설정',implemented:false} };
    const lib = await this.state();
    await this.atomic(this.projectPath(p.id),p);
    lib.projects.push({id:p.id,name:p.name}); await this.atomic('library.json',lib); return p;
  }
  async saveProject(id, incoming, expectedRevision) {
    const previous = await this.project(id);
    if(expectedRevision !== previous.revision) throw new AppError('다른 창에서 저장한 변경이 있습니다. 새로고침 후 다시 편집하세요. 현재 창의 편집은 유지됩니다.',409);
    if(!incoming||![1,2].includes(incoming.schemaVersion)||incoming.id!==id)throw new AppError('지원하지 않는 프로젝트 형식');
    incoming=upgradeProject(incoming);
    for(const key of ['objects','references','footprints','recipes']) if(!Array.isArray(incoming[key])||incoming[key].length>10000) throw new AppError('프로젝트 데이터가 올바르지 않습니다.');
    if(!incoming.assets || typeof incoming.assets !== 'object') throw new AppError('에셋 참조가 없습니다.');
    for(const [assetId,a] of Object.entries(incoming.assets)) {
      if(!idPattern.test(assetId)||!hashPattern.test(a.hash)||!allowed.has(a.ext)) throw new AppError('에셋 참조 형식 오류');
      const bytes=await readFile(path.join(this.root,'blobs',a.hash)).catch(()=>{throw new AppError('누락된 에셋 파일');});
      if(createHash('sha256').update(bytes).digest('hex')!==a.hash)throw new AppError('에셋 파일 무결성 검사 실패');
    }
    const ids = new Set();
    for(const o of incoming.objects) {
      if(!idPattern.test(o.id)||ids.has(o.id)||!finiteVector(o.position)||!finiteVector(o.rotation)||!finiteVector(o.scale)||o.scale.some(x=>x<=0)) throw new AppError('오브젝트 좌표 형식 오류');
      ids.add(o.id);
      if(o.kind === 'asset' && !incoming.assets[o.assetId]) throw new AppError('배치된 모델의 에셋 참조 누락');
      if(!['asset','blockout','generated'].includes(o.kind)) throw new AppError('지원하지 않는 오브젝트');
      if(o.kind==='generated'&&entityIssues({type:o.entityType,geometry:o.geometry,parameters:o.parameters}).length)throw new AppError('생성 결과 기하 오류');
      if(o.kind==='generated'&&o.assetId&&!incoming.assets[o.assetId])throw new AppError('생성 결과 에셋 누락');
      o.ownership??=o.sourceEntityId?'Generated':'Independent';
      if(o.kind==='blockout'&&(!finiteVector(o.dimensions)||o.dimensions.some(x=>x<=0)))throw new AppError('블록아웃 치수 오류');
      if(o.kind==='asset'&&(!Number.isFinite(o.unitScale)||o.unitScale<=0||o.unitScale>1000))throw new AppError('모델 단위 오류');
    }
    for(const r of incoming.references) if(!incoming.assets[r.assetId]||!Number.isFinite(r.widthMeters)||r.widthMeters<=0) throw new AppError('레퍼런스 형식 오류');
    for(const r of incoming.references)if(!vectorReference(r))throw new AppError('레퍼런스 좌표·원본 크기 오류');
    for(const f of incoming.footprints) if(!idPattern.test(f.id)||!Number.isFinite(f.width)||!Number.isFinite(f.depth)||f.width<=0||f.depth<=0||!finiteVector(f.position)) throw new AppError('외곽선 형식 오류');
    for(const r of incoming.recipes) if(!idPattern.test(r.id)||!Number.isInteger(r.floors)||r.floors<1||r.floors>100||!Number.isFinite(r.floorHeight)||r.floorHeight<=0||r.floorHeight>100) throw new AppError('레시피 형식 오류');
    for(const [modelId,links] of Object.entries(incoming.textureLinks||{}))if(!incoming.assets[modelId]||!Array.isArray(links)||links.some(l=>!incoming.assets[l.assetId]||!['baseColor','normal','orm','special'].includes(l.role)))throw new AppError('텍스처 연결 오류');
    try{validateScene(incoming);}catch(error){throw new AppError(error.message);}
    const raw=await readFile(path.join(this.root,this.projectPath(id)),'utf8');
    if(JSON.parse(raw).schemaVersion===1)await writeFile(path.join(this.root,this.projectPath(id)+'.v1-original.json'),raw,{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});
    const next = {...incoming,name:previous.name,revision:previous.revision+1};
    await this.atomic(this.projectPath(id),next); return next;
  }
  async importAsset({ name, content, projectId=null, assetId=null, category='Model', textureRole='baseColor' }) {
    if(typeof name!=='string'||name.length>255||!name.trim()) throw new AppError('파일 이름 오류');
    const ext = name.split('.').pop().toLowerCase();
    if(!allowed.has(ext)) throw new AppError('FBX, GLB, PNG, JPG, WebP, TGA, EXR, PSD 파일을 등록하세요.');
    if(typeof content!=='string'||!content.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(content)) throw new AppError('파일 데이터 오류');
    const bytes = Buffer.from(content,'base64');
    if(!bytes.length||bytes.length>48*1024*1024) throw new AppError('파일당 최대 48MB까지 지원합니다.');
    const lib=await this.state();
    if(projectId) await this.project(projectId);
    let asset = assetId ? lib.assets.find(a=>a.id===assetId) : null;
    if(assetId&&!asset) throw new AppError('갱신할 에셋을 찾을 수 없습니다.',404);
    if(asset && (asset.projectId!==projectId || (['fbx','glb'].includes(asset.ext)!==['fbx','glb'].includes(ext)))) throw new AppError('다른 라이브러리 또는 파일 종류로 갱신할 수 없습니다.');
    const hash = createHash('sha256').update(bytes).digest('hex');
    if(!asset) asset=lib.assets.find(a=>a.hash===hash&&a.projectId===projectId&&a.ext===ext);
    if(!asset) { asset={id:randomUUID(),createdAt:new Date().toISOString()};lib.assets.push(asset); }
    // One visible item per logical asset; unchanged imports do not create history entries.
    const changed = asset.hash!==hash;
    await writeFile(path.join(this.root,'blobs',hash),bytes,{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
    Object.assign(asset,{ name,ext,hash,size:bytes.length,projectId,category,textureRole,updatedAt:changed?new Date().toISOString():asset.updatedAt });
    await this.atomic('library.json',lib); return asset;
  }
}
