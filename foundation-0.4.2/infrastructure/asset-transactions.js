import {mkdir,readFile,writeFile,rename,open,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store,AppError,allowed} from '../store.js';
import {ASSET_KINDS} from '../core/foundation/document.js';
import {inspectAsset,digest} from './asset-inspection.js';
import {replaceFile} from './replace-file.js';
export async function atomicAssetJSON(file,value){await mkdir(path.dirname(file),{recursive:true});const tmp=file+'.tmp-'+randomUUID(),f=await open(tmp,'wx');try{await f.writeFile(JSON.stringify(value,null,2));await f.sync();}finally{await f.close();}await replaceFile(tmp,file);}
export async function assetRegistry(store,projectId){const root=projectId?path.join(store.location(projectId),'assets'):store.sharedRoot;const registry=new Store(root);await registry.init();await mkdir(path.join(root,'.studio'),{recursive:true});return registry;}
export async function importAssetAtomic(store,body){
 const kind=body.kind||body.category||'Model',ext=body.name?.split('.').pop().toLowerCase();
 if(!ASSET_KINDS.includes(kind)&&!['Texture','Model'].includes(kind))throw new AppError('지원하지 않는 에셋 분류');
 if(typeof body.name!=='string'||!body.name.trim()||body.name.length>255||!allowed.has(ext)&&ext!=='json')throw new AppError('지원하지 않는 파일 이름 또는 형식');
 if(typeof body.content!=='string'||!body.content.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.content))throw new AppError('파일 데이터 오류');
 const bytes=Buffer.from(body.content,'base64');if(!bytes.length||bytes.length>48*1024*1024)throw new AppError('파일당 최대 48MB입니다.');
 let descriptor;if(ext==='json'){if(!['Material','ModularKit','Recipe','Rule','TrimSheet','Decal','Mask'].includes(kind))throw new AppError('Descriptor 분류를 선택하세요.');try{descriptor=JSON.parse(bytes);}catch{throw new AppError('Descriptor JSON 오류');}}
 const registry=await assetRegistry(store,body.projectId);
 return store.withWriteLock(registry.root,async()=>{
  const conflicts=(await readdir(registry.root)).filter(n=>n.startsWith('library')&&n!== 'library.json'&&!n.endsWith('.bak')&&!n.includes('.tmp'));
  if(conflicts.length)throw new AppError('라이브러리 동기화 충돌 사본을 보존했습니다. 확인 후 갱신하세요.',409);
  const lib=await registry.state(),hash=digest(bytes);let previous=body.assetId?lib.assets.find(a=>a.id===body.assetId):lib.assets.find(a=>a.hash===hash&&a.ext===ext);
  if(body.assetId&&!previous)throw new AppError('갱신 대상 누락',404);
  if(previous&&previous.ext!==ext)throw new AppError('파일 형식을 유지해 주세요.');
  if(body.expectedHash&&previous?.hash!==body.expectedHash)throw new AppError('분석 이후 라이브러리가 변경되었습니다. 다시 확인하세요.',409);
  const inspection=inspectAsset(bytes,ext),now=new Date().toISOString();
  if(body.automatic&&inspection.status==='error')throw new AppError(inspection.reason);
  let sourceFiles=previous?.sourceFiles||[];
  if(body.sourcePath){let size,mtimeMs;try{({size,mtimeMs}=await stat(body.sourcePath));}catch{}sourceFiles=[{path:path.resolve(body.sourcePath),lastHash:hash,size,mtimeMs}];}
  const asset={...previous,id:previous?.id||randomUUID(),createdAt:previous?.createdAt||now,updatedAt:now,name:body.name,ext,hash,size:bytes.length,category:kind,kind,textureRole:body.textureRole||previous?.textureRole||'baseColor',projectId:null,sourceFiles,metadata:{...previous?.metadata,...body.metadata,...(previous?.metadata?.catalog?{catalog:previous.metadata.catalog}:{}),...(descriptor?{descriptor}:{}),inspection},history:[...(previous?.history||[])]};
  const tx=randomUUID(),journal=path.join(registry.root,'.asset-history',asset.id,tx+'.json'),blob=path.join(registry.root,'blobs',hash);
  if(previous&&previous.hash!==hash)asset.history.push({hash:previous.hash,updatedAt:previous.updatedAt,transaction:tx});
  if(body.acceptance)asset.lastAcceptance={...body.acceptance,event:tx,hash};
  const entry={transaction:tx,state:'prepared',at:now,before:previous||null,after:asset,registryHash:digest(Buffer.from(JSON.stringify(lib)))};
  try{const f=await open(blob,'wx');try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}}catch(error){if(error.code!=='EEXIST')throw error;if(digest(await readFile(blob))!==hash)throw new AppError('기존 blob 손상: 덮어쓰지 않았습니다.',409);}
  await store.options.fault?.('asset:blob');await atomicAssetJSON(journal,entry);await store.options.fault?.('asset:prepared');
  const current=JSON.parse(await readFile(path.join(registry.root,'library.json')));if(digest(Buffer.from(JSON.stringify(current)))!==entry.registryHash)throw new AppError('갱신 중 라이브러리 외부 변경을 발견했습니다. 양쪽 변경과 이전 파일을 보존했습니다.',409);
  const at=lib.assets.findIndex(a=>a.id===asset.id);if(at<0)lib.assets.push(asset);else lib.assets[at]=asset;
  await atomicAssetJSON(path.join(registry.root,'library.json'),lib);await store.options.fault?.('asset:metadata');await atomicAssetJSON(journal,{...entry,state:'committed'});
  return {...asset,projectId:body.projectId||null};
 });
}
export async function inspectAssetTransactions(store){
 const issues=[];for(const root of [store.sharedRoot,...store.index.projects.map(p=>path.join(p.path,'assets'))]){
  let lib;try{lib=JSON.parse(await readFile(path.join(root,'library.json')));}catch{continue;}
  for(const a of lib.assets){try{if(digest(await readFile(path.join(root,'blobs',a.hash)))!==a.hash)throw Error('해시 불일치');}catch(e){issues.push({assetId:a.id,name:a.name,error:e.message,root});}}
  for(const id of await readdir(path.join(root,'.asset-history')).catch(()=>[]))for(const file of await readdir(path.join(root,'.asset-history',id)).catch(()=>[])){if(!file.endsWith('.json'))continue;const loc=path.join(root,'.asset-history',id,file);try{const j=JSON.parse(await readFile(loc));if(j.state!=='prepared')continue;const current=lib.assets.find(a=>a.id===id);await atomicAssetJSON(loc,{...j,state:current?.hash===j.after.hash?'committed-recovered':current?.hash===j.before?.hash||!current&&!j.before?'interrupted-preserved':'conflict-preserved'});}catch(e){issues.push({root,error:'에셋 기록 검사: '+e.message});}}
 }return issues;
}
