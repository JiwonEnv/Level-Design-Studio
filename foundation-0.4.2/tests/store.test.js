import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../store.js';
import { createApp } from '../server.js';
async function fixture(t){const root=await mkdtemp(path.join(os.tmpdir(),'lds-test-'));assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'lds-test-'));t.after(()=>rm(root,{recursive:true,force:true}));const store=new Store(root);await store.init();return {store,root};}
const upload=(name,bytes,extra={})=>({name,content:Buffer.from(bytes).toString('base64'),...extra});
test('same asset update keeps ID and old project bytes; identical imports deduplicate',async t=>{
 const {store,root}=await fixture(t);const a=await store.importAsset(upload('wall.glb','original'));
 const same=await store.importAsset(upload('renamed.glb','original'));assert.equal(same.id,a.id);
 const p=await store.createProject('A'),q=await store.createProject('B');p.assets[a.id]=a;q.assets[a.id]=a;
 await store.saveProject(p.id,p,0);await store.saveProject(q.id,q,0);
 const next=await store.importAsset(upload('wall.glb','updated',{assetId:a.id}));assert.equal(next.id,a.id);assert.notEqual(next.hash,a.hash);
 assert.equal((await store.state()).assets.length,1);assert.equal((await store.project(p.id)).assets[a.id].hash,a.hash);
 assert.equal(await readFile(path.join(root,'blobs',a.hash),'utf8'),'original');
 const project=await store.project(p.id);project.assets[a.id]=next;await store.saveProject(p.id,project,project.revision);
 assert.equal((await store.project(q.id)).assets[a.id].hash,a.hash);
 assert.equal((await store.project(p.id)).assets[a.id].hash,next.hash);
 assert.equal((await readdir(path.join(root,'blobs'))).length,2);
});
test('project reopen restores Z-up transforms and rejects stale writes without overwriting',async t=>{
 const {store,root}=await fixture(t);const p=await store.createProject('배치 테스트');p.objects=[{id:randomUUID(),kind:'blockout',name:'집',position:[2,3,4],rotation:[0,0,90],scale:[1,2,1],dimensions:[4,6,3]}];
 await store.saveProject(p.id,p,0);await assert.rejects(()=>store.saveProject(p.id,{...p,objects:[]},0),{status:409});
 const reopened=new Store(root);await reopened.init();const saved=await reopened.project(p.id);assert.deepEqual(saved.objects[0].position,[2,3,4]);assert.equal(saved.coordinateSystem.up,'Z');
 const backup=JSON.parse(await readFile(path.join(root,'projects',p.id+'.json.bak'),'utf8'));assert.equal(backup.revision,0);
});
test('private assets isolated; invalid transforms, missing references, and unsupported formats rejected',async t=>{
 const {store}=await fixture(t);const p=await store.createProject('Private');const common=await store.importAsset(upload('x.png','same'));const own=await store.importAsset(upload('x.png','same',{projectId:p.id}));assert.notEqual(common.id,own.id);assert.equal(common.hash,own.hash);
 await assert.rejects(()=>store.importAsset(upload('run.exe','bad')),{status:400});
 p.objects=[{id:randomUUID(),kind:'asset',assetId:randomUUID(),position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}];await assert.rejects(()=>store.saveProject(p.id,p,0),/참조 누락/);
 p.objects[0].position=[NaN,0,0];await assert.rejects(()=>store.saveProject(p.id,p,0),/좌표/);
});
test('HTTP APIs reject cross-origin writes and survive malformed inputs',async t=>{
 const {root}=await fixture(t);const {server}=await createApp({root,dev:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await fetch(base+'/api/projects',{method:'POST',headers:{origin:'https://unrelated.example','Content-Type':'application/json'},body:'{"name":"bad"}'})).status,403);
 assert.equal((await fetch(base+'/api/projects',{method:'POST',body:'broken'})).status,400);
 const response=await fetch(base+'/api/projects',{method:'POST',body:JSON.stringify({name:'API Project'})});assert.equal(response.status,201);
 assert.equal((await (await fetch(base+'/api/state')).json()).projects.length,1);
 assert.equal((await fetch(base+'/api/files/'+'a'.repeat(64))).status,404);
});
