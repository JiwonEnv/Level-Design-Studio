import {readFile,stat,readdir} from 'node:fs/promises';
import {watch} from 'node:fs';
import path from 'node:path';
import {inspectAsset,classifyChange,digest} from '../infrastructure/asset-inspection.js';
import {atomicAssetJSON,inspectAssetTransactions} from '../infrastructure/asset-transactions.js';
import {AppError} from '../store.js';
export const assetKey=a=>(a.projectId||'shared')+':'+a.id;
export class AssetMonitor{
 constructor(store,options={}){this.store=store;this.options={interval:1200,stableMs:900,...options};this.rows={};this.observed=new Map();this.watchers=new Map();this.activeProjectId=null;this.busy=null;this.stopped=false;this.file=path.join(store.root,'.asset-monitor','state.json');}
 async start(){try{const saved=JSON.parse(await readFile(this.file));this.rows=saved.rows||{};}catch(e){if(e.code!=='ENOENT')this.warning='변경 감지 상태를 읽지 못했습니다. 원본과 라이브러리 파일을 다시 비교합니다.';}this.integrity=await inspectAssetTransactions(this.store);await this.scan();this.timer=setInterval(()=>{void this.scan();},this.options.interval);this.timer.unref?.();return this;}
 async stop(){this.stopped=true;clearInterval(this.timer);for(const w of this.watchers.values())w.close();await this.busy;}
 snapshot(){return {rows:Object.values(this.rows),integrity:this.integrity||[],warning:this.warning,activeProjectId:this.activeProjectId};}
 async persist(){await atomicAssetJSON(this.file,{version:1,rows:this.rows});}
 async scan(){if(this.stopped)return;if(this.busy)return this.busy;this.busy=this.run().catch(e=>{this.warning=e.message;}).finally(()=>{this.busy=null;});return this.busy;}
 async run(){const state=await this.store.state(),keys=new Set();for(const asset of state.assets){const key=assetKey(asset);keys.add(key);const source=asset.sourceFiles?.[0];if(!source?.path)continue;
  const row=this.rows[key]||{key,assetId:asset.id,projectId:asset.projectId||null};Object.assign(row,{name:asset.name,path:row.candidate&&row.manualPath?row.manualPath:source.path,libraryHash:asset.hash});this.rows[key]=row;
  const sourcePath=row.path;const dir=path.dirname(sourcePath);if(!this.watchers.has(dir)){try{const w=watch(dir,()=>{clearTimeout(this.hint);this.hint=setTimeout(()=>{void this.scan();},150);});w.on('error',()=>{w.close();this.watchers.delete(dir);});this.watchers.set(dir,w);}catch{}}
  try{const before=await stat(sourcePath);if(before.size>48*1024*1024)throw Error('파일당 최대 48MB입니다.');const bytes=await readFile(sourcePath),after=await stat(sourcePath);if(before.size!==after.size||before.mtimeMs!==after.mtimeMs){row.status='detected';row.reason='파일 저장이 끝날 때까지 기다립니다.';this.observed.delete(key);continue;}
   const hash=digest(bytes),fingerprint=[hash,after.size,after.mtimeMs].join(':');row.observedSize=after.size;row.observedMtime=after.mtimeMs;row.observedHash=hash;
   if(hash===asset.hash){row.status='latest';row.reason='최신 파일';delete row.candidate;this.observed.delete(key);continue;}
   if(row.candidate?.hash===hash&&['review','deferred','cancelled'].includes(row.status))continue;
   const seen=this.observed.get(key);if(!seen||seen.fingerprint!==fingerprint){this.observed.set(key,{fingerprint,since:Date.now()});row.status='detected';row.reason='변경 감지 · 안정화 확인 중';continue;}
   if(Date.now()-seen.since<this.options.stableMs)continue;
   const oldInspection=inspectAsset(await readFile(await this.store.findBlob(asset.hash)),asset.ext),inspection=inspectAsset(bytes,asset.ext),classification=classifyChange(oldInspection,inspection);
   if(classification.invalid){row.status='error';row.reason=classification.reasons.join(' · ');row.lastFailure={hash,at:new Date().toISOString(),reason:row.reason};continue;}
   const usage=await this.store.usages(asset.id);row.candidate={hash,baseHash:asset.hash,reasons:classification.reasons,safe:classification.safe,projectCount:new Set(usage.uses.map(u=>u.projectId)).size,placementCount:usage.uses.filter(u=>!u.referenceOnly).length,unscanned:usage.unscanned};
   row.status=classification.safe?'updating':'review';row.reason=classification.reasons.join(' · ');
   await this.persist();if(classification.safe)await this.accept(row,asset,bytes,'automatic');
  }catch(e){if(e.code==='ENOENT'){row.status='missing';row.reason='원본 파일 누락 · 라이브러리 사본과 배치 보존';const suggestions=[];for(const name of (await readdir(dir).catch(()=>[])).slice(0,100)){const f=path.join(dir,name);if(path.extname(name).toLowerCase()!=='.'+asset.ext)continue;try{const s=await stat(f);if(s.isFile()&&s.size===asset.size&&digest(await readFile(f))===asset.hash)suggestions.push(f);}catch{}}row.suggestions=suggestions;if(suggestions.length){row.status='moved';row.reason='이동한 것으로 보이는 파일이 있습니다. 경로 연결을 확인하세요.';}}else{row.status='error';row.reason=e.message;row.lastFailure={at:new Date().toISOString(),reason:e.message};}}
 }
 for(const key of Object.keys(this.rows))if(!keys.has(key))delete this.rows[key];await this.persist();
 }
 async accept(row,asset,bytes,decision){
  const candidate=row.candidate;if(!candidate||digest(bytes)!==candidate.hash)throw new AppError('확인 이후 파일이 바뀌었습니다. 다시 검사하세요.',409);
  const next=await this.store.serial(()=>this.store.importAsset({name:asset.name,content:bytes.toString('base64'),projectId:asset.projectId,assetId:asset.id,expectedHash:candidate.baseHash,kind:asset.kind||asset.category,metadata:asset.metadata,sourcePath:row.path,automatic:true,acceptance:{decision,reasons:candidate.reasons}}));
  row.status='latest';row.reason='갱신 완료';row.accepted={hash:next.hash,event:next.lastAcceptance.event,decision,at:new Date().toISOString()};delete row.candidate;
  // Each project is a separate commit. Old pinned blobs remain valid if one project cannot save.
  row.projects=[];for(const item of this.store.index.projects){if(item.id===this.activeProjectId)continue;try{await this.store.serial(async()=>{const p=await this.store.project(item.id),old=p.assets[asset.id];if(!old||asset.projectId&&asset.projectId!==p.id||(old.projectId||null)!==(next.projectId||null)||old.updatePolicy==='pinned'||old.hash===next.hash)return;const recover=await this.store.recoveries(p.id);if(recover.disk||recover.autosave)throw Error('미해결 복구 후보 보존 · 자동 프로젝트 저장 보류');p.assets[asset.id]={...next,updatePolicy:old.updatePolicy};for(const n of p.nodes)for(const ref of n.assetRefs)if(ref.assetId===asset.id)ref.hash=next.hash;p.assetAutoEvents={...p.assetAutoEvents,[row.key]:next.lastAcceptance.event};await this.store.writeRecovery(p.id,p);await this.store.saveProject(p.id,p,p.revision);row.projects.push({projectId:p.id,status:'updated'});});}catch(e){row.projects.push({projectId:item.id,status:'deferred',reason:e.message});}}
  await this.persist();return next;
 }
 async decide({key,action,hash}){await this.busy;const row=this.rows[key];if(!row)throw new AppError('변경 항목이 없습니다.',404);if(action==='defer'||action==='cancel'){if(row.candidate?.hash!==hash)throw new AppError('변경 후보가 달라졌습니다.',409);row.status=action==='defer'?'deferred':'cancelled';await this.persist();return this.snapshot();}if(action!=='apply')throw new AppError('알 수 없는 작업');const asset=(await this.store.state()).assets.find(a=>assetKey(a)===key);if(!asset||row.candidate?.hash!==hash)throw new AppError('변경 후보가 달라졌습니다.',409);await this.accept(row,asset,await readFile(row.path),'approved');return this.snapshot();}
 async relink({key,sourcePath}){await this.busy;const asset=(await this.store.state()).assets.find(a=>assetKey(a)===key);if(!asset)throw new AppError('에셋 없음',404);if(path.extname(sourcePath).toLowerCase()!=='.'+asset.ext)throw new AppError('같은 파일 형식을 선택하세요.');const bytes=await readFile(sourcePath);if(digest(bytes)!==asset.hash)throw new AppError('원래 파일과 내용이 다릅니다. 먼저 같은 파일을 연결한 후 파일 업데이트로 변경하세요.');await this.store.serial(()=>this.store.importAsset({name:asset.name,content:bytes.toString('base64'),projectId:asset.projectId,assetId:asset.id,expectedHash:asset.hash,sourcePath,kind:asset.kind||asset.category,metadata:asset.metadata}));this.observed.delete(key);await this.scan();return this.snapshot();}
 async requestImport(body){if(!body.assetId)return this.store.serial(()=>this.store.importAsset(body));await this.busy;const asset=(await this.store.state()).assets.find(a=>a.id===body.assetId&&(a.projectId||null)===(body.projectId||null));if(!asset)throw new AppError('갱신 대상 없음',404);const bytes=Buffer.from(body.content||'','base64');if(digest(bytes)===asset.hash)return this.store.serial(()=>this.store.importAsset(body));const inspection=inspectAsset(bytes,asset.ext),classification=classifyChange(inspectAsset(await readFile(await this.store.findBlob(asset.hash)),asset.ext),inspection);if(classification.invalid)throw new AppError(classification.reasons.join(' · '));
  // A selected file has a real native path in desktop mode. Browser-only updates cannot be re-read for approval.
  if(!body.sourcePath){if(!classification.safe)throw new AppError('변경 검증을 위해 데스크톱에서 원본 파일을 선택하세요.');return this.store.serial(()=>this.store.importAsset({...body,expectedHash:asset.hash,automatic:true,acceptance:{decision:'automatic',reasons:classification.reasons}}));}
  const key=assetKey(asset),usage=await this.store.usages(asset.id),row={key,assetId:asset.id,projectId:asset.projectId||null,name:asset.name,path:body.sourcePath,status:classification.safe?'updating':'review',candidate:{hash:digest(bytes),baseHash:asset.hash,reasons:classification.reasons,safe:classification.safe,projectCount:new Set(usage.uses.map(u=>u.projectId)).size,placementCount:usage.uses.filter(u=>!u.referenceOnly).length,unscanned:usage.unscanned}};
  row.manualPath=body.sourcePath;this.rows[key]=row;await this.persist();if(classification.safe)return this.accept(row,asset,bytes,'automatic');return {...asset,updatePending:true};
 }
}


