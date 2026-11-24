import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rename,cp,mkdir,readdir,stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {FoundationStore} from '../../infrastructure/foundation-store.js';
import {newDocument,createNode,reconcileLegacy,applyNodeCommand,fromEuler,toEuler,worldTransform,compose,normalizeDocument} from '../../core/foundation/document.js';
import {CommandHistory} from '../../core/foundation/history.js';
const fixture=async options=>{const root=await mkdtemp(path.join(os.tmpdir(),'lds-matrix-')),store=new FoundationStore(root,options);await store.init();return {root,store,p:await store.createProject('장애 시험')};};
test('Undo-create and delete-Undo-Redo are committed exactly and survive repository reopen',async()=>{
 const {root,store}=await fixture();let p=await store.createProject('undo');const h=new CommandHistory();h.reset(p);p=h.execute(p,'create',d=>applyNodeCommand(d,{type:'create',nodeType:'Water'})).document;p=h.undo(p);p=await store.saveProject(p.id,p,p.revision);assert.equal((await store.project(p.id)).nodes.length,0);
 p=h.redo(p);p=await store.saveProject(p.id,p,p.revision);const id=p.nodes[0].id;p=h.execute(p,'delete',d=>applyNodeCommand(d,{type:'delete',id})).document;p=h.undo(p);assert.equal(p.nodes[0].id,id);p=h.redo(p);p=await store.saveProject(p.id,p,p.revision);const s=new FoundationStore(root);await s.init();assert.equal((await s.project(p.id)).nodes.length,0);
});
test('faults before/after completion and HEAD preserve either previous or fully verified new generation',async()=>{
 for(const stage of ['document','complete','head']){let fail=false;const {root,store,p}=await fixture({fault:phase=>{if(fail&&phase===stage)throw Error('injected '+stage);}});p.nodes.push(createNode('Group'));fail=true;await assert.rejects(()=>store.saveProject(p.id,p,p.revision),/injected/);const reopened=new FoundationStore(root);await reopened.init();const after=await reopened.project(p.id);assert.equal(after.nodes.length,stage==='head'?1:0);}
});
test('corrupt active document and locator never overwrite historical bytes; latest valid snapshot needs explicit recovery',async()=>{
 const {store,p}=await fixture();const old=await store.versions(p.id);p.nodes.push(createNode('Zone'));const latest=await store.saveProject(p.id,p,p.revision),file=path.join(p.storage.path,'.studio','commits',latest.storage.generation,'document.json');await writeFile(file,'corrupt');await writeFile(path.join(p.storage.path,'project.lds.json'),'bad locator');const candidate=await store.project(p.id);assert.ok(candidate.recovery);assert.equal(candidate.nodes.length,0);assert.equal(await readFile(file,'utf8'),'corrupt');const recovered=await store.applyRecovery(p.id,'disk',candidate.storage.generation);assert.equal(recovered.nodes.length,0);assert.equal(await readFile(file,'utf8'),'corrupt');
});
test('missing pinned file blocks save; local recovery candidate still retains edited scene and reference',async()=>{
 const {store,p}=await fixture();const a=await store.importAsset({name:'model.glb',category:'Model',content:Buffer.from('fixture').toString('base64')});p.assets[a.id]=a;p.nodes.push(createNode('Prop',{assetRefs:[{assetId:a.id,hash:a.hash}]}));let saved=await store.saveProject(p.id,p,p.revision);const file=await store.findBlob(a.hash);await rename(file,file+'.preserved');saved.nodes[0].name='cannot-save';await store.writeRecovery(p.id,saved);await assert.rejects(()=>store.saveProject(p.id,saved,saved.revision),/누락/);assert.equal((await store.recoveries(p.id)).autosave.project.nodes[0].name,'cannot-save');assert.equal((await store.project(p.id)).nodes[0].name,'Prop');
});
test('same live ID at a second path is rejected; relocation after original path disappears is allowed',async()=>{
 const {root,store,p}=await fixture();const copy=path.join(root,'other');await cp(p.storage.path,copy,{recursive:true});await assert.rejects(()=>store.openProjectFolder(copy),/같은 ID/);const moved=path.join(root,'relocated');await rename(p.storage.path,moved);assert.equal((await store.openProjectFolder(moved)).id,p.id);
});
test('a competing process lease rejects a second writer without changing HEAD',async()=>{
 const {store,p}=await fixture();const before=await readFile(path.join(p.storage.path,'.studio','HEAD'),'utf8');await writeFile(path.join(p.storage.path,'.studio','write.lock'),JSON.stringify({pid:process.pid,token:'another-writer'}));await assert.rejects(()=>store.saveProject(p.id,p,p.revision),/다른 프로세스/);assert.equal(await readFile(path.join(p.storage.path,'.studio','HEAD'),'utf8'),before);
});
test('quaternion singularities roundtrip; unsupported shear and deleting a locked descendant rollback',()=>{
 for(const angles of [[20,90,30],[-15,-90,70],[30,20,40]]){const q=fromEuler(angles),back=fromEuler(toEuler(q));assert.ok(Math.abs(Math.abs(q.reduce((sum,v,i)=>sum+v*back[i],0))-1)<1e-7);}
 const p=newDocument('hierarchy'),g=createNode('Group'),child=createNode('Prop',{parentId:g.id,locked:true});p.nodes.push(g,child);const h=new CommandHistory();h.reset(p);const deleted=h.execute(p,'delete locked child',d=>applyNodeCommand(d,{type:'delete',id:g.id}));assert.ok(deleted.error);assert.equal(deleted.document.nodes.length,2);
 assert.throws(()=>compose({position:[0,0,0],rotation:[0,0,0,1],scale:[2,1,1]},{position:[0,0,0],rotation:fromEuler([0,0,45]),scale:[1,1,1]}),/비균일/);
});
test('corrupt recent index is backed up and rebuilt without changing project commits',async()=>{
 const {root,store,p}=await fixture();const head=await readFile(path.join(p.storage.path,'.studio','HEAD'));await writeFile(path.join(root,'foundation-index.json'),'broken-index');const reopened=new FoundationStore(root);await reopened.init();assert.equal((await reopened.project(p.id)).id,p.id);assert.equal((await readdir(path.join(root,'.index-backups'))).length,1);assert.deepEqual(await readFile(path.join(p.storage.path,'.studio','HEAD')),head);
});
test('Reference opacity-only legacy edit preserves canonical frame exactly',()=>{
 const p=newDocument('reference-frame'),a=crypto.randomUUID(),id=crypto.randomUUID();p.assets[a]={id:a,hash:'a'.repeat(64),ext:'png'};p.references.push({id,assetId:a,widthMeters:100,sourceSize:[100,100],origin:[0,0,0],rotation:0,opacity:.5});reconcileLegacy(p);applyNodeCommand(p,{type:'transform',id,value:{position:[1,2,0],rotation:fromEuler([0,0,20]),scale:[2,2,2]}});const before=structuredClone(p);p.references[0].opacity=.1;reconcileLegacy(p,before);assert.deepEqual(p.nodes[0].transform,before.nodes[0].transform);assert.equal(p.references[0].widthMeters,200);assert.equal(p.references[0].opacity,.1);
});
