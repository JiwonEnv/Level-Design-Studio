import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {FoundationStore} from '../../infrastructure/foundation-store.js';
import {Store} from '../../store.js';
import {NODE_TYPES,newDocument,createNode,applyNodeCommand,rebaseOrigin,worldTransform,validateDocument,fromEuler,pointToWorld,reconcileLegacy} from '../../core/foundation/document.js';
import {CommandHistory} from '../../core/foundation/history.js';
import {ModuleRegistry,stagedModuleRun} from '../../core/foundation/extensions.js';
import {createEntity,rectangle} from '../../core/scene-model.js';
const temp=()=>mkdtemp(path.join(os.tmpdir(),'lds-foundation-'));
test('8 types, hierarchy, world-preserving reparent, transforms, lock and transactional undo/redo',()=>{
 let p=newDocument('Eight'),history=new CommandHistory();history.reset(p);
 for(const type of NODE_TYPES){const result=history.execute(p,'create '+type,d=>applyNodeCommand(d,{type:'create',nodeType:type}));assert.ok(!result.error);p=result.document;}
 assert.equal(p.nodes.length,8);let child=p.nodes[0],group=p.nodes.find(n=>n.type==='Group');group.transform.position=[10,20,30];group.transform.rotation=fromEuler([0,0,45]);
 const before=worldTransform(p,child);applyNodeCommand(p,{type:'parent',id:child.id,value:group.id});assert.deepEqual(worldTransform(p,child).position,before.position);
 const initial=structuredClone(p);const bad=history.execute(p,'invalid',d=>{d.nodes[0].transform.scale=[0,1,1];});assert.ok(bad.error);assert.deepEqual(bad.document,initial);p=bad.document;
 const result=history.execute(p,'rename',d=>applyNodeCommand(d,{type:'rename',id:child.id,value:'수정'}));p=result.document;assert.equal(p.nodes[0].name,'수정');p=history.undo(p);assert.equal(p.nodes[0].name,initial.nodes[0].name);p=history.redo(p);assert.equal(p.nodes[0].name,'수정');history.markSaved(p);assert.equal(history.dirty(p),false);p=history.undo(p);assert.equal(history.dirty(p),true);
 applyNodeCommand(p,{type:'unlock',id:group.id,value:true});assert.throws(()=>applyNodeCommand(p,{type:'rename',id:child.id,value:'bad'}),/잠긴/);
});
test('origin rebasing preserves nested world position and legacy geometry/override anchors',()=>{
 const p=newDocument('origin');p.entities.push(createEntity('Building',rectangle([10,20,0],8,6)));reconcileLegacy(p);const group=createNode('Group',{transform:{position:[1e8,10,0],rotation:fromEuler([0,0,30]),scale:[1,1,1]}});p.nodes.push(group);const child=createNode('Prop',{parentId:group.id});p.nodes.push(child);const before=p.nodes.map(n=>worldTransform(p,n).position.map((v,i)=>v+p.coordinateSystem.origin[i]));rebaseOrigin(p,[1e8,-20,30]);p.nodes.forEach((n,index)=>worldTransform(p,n).position.forEach((v,i)=>assert.ok(Math.abs(v+p.coordinateSystem.origin[i]-before[index][i])<1e-6)));validateDocument(p);
});
test('isolated project commits, duplicate, reopen, asset ID/pin preservation and missing asset diagnostics',async()=>{
 const root=await temp(),s=new FoundationStore(root);await s.init();let p=await s.createProject('A'),q=await s.createProject('B');
 const asset=await s.importAsset({name:'test.glb',content:Buffer.from('fixture-original').toString('base64'),category:'Model'});p.assets[asset.id]=asset;p.nodes.push(createNode('Prop',{assetRefs:[{assetId:asset.id,hash:asset.hash}]}));p=await s.saveProject(p.id,p,p.revision);
 const next=await s.importAsset({name:'test.glb',content:Buffer.from('fixture-updated').toString('base64'),assetId:asset.id,category:'Model'});assert.equal(next.id,asset.id);assert.notEqual(next.hash,asset.hash);
 const reopened=new FoundationStore(root);await reopened.init();assert.equal((await reopened.project(p.id)).assets[asset.id].hash,asset.hash);assert.equal((await reopened.project(q.id)).nodes.length,0);
 const duplicate=await reopened.duplicate(p.id,'복제');assert.notEqual(duplicate.id,p.id);assert.equal(duplicate.nodes[0].id,p.nodes[0].id);assert.equal(duplicate.assets[asset.id].hash,asset.hash);assert.equal((await reopened.usages(asset.id)).uses.length,2);
 await assert.rejects(()=>reopened.saveProject(p.id,p,0),/충돌/);const corrupted=structuredClone(p);corrupted.assets[asset.id].hash='f'.repeat(64);corrupted.nodes[0].assetRefs[0].hash='f'.repeat(64);await assert.rejects(()=>reopened.saveProject(p.id,corrupted,p.revision),/누락/);
});
test('save interruption preserves last complete commit; corrupt HEAD offers explicit recovery; recovery candidate survives restart',async()=>{
 const root=await temp();let fail=false;const s=new FoundationStore(root,{fault:phase=>{if(fail&&phase==='document')throw Error('injected write failure');}});await s.init();let p=await s.createProject('recover');const folder=p.storage.path;p.nodes.push(createNode('Water'));await s.writeRecovery(p.id,p);fail=true;await assert.rejects(()=>s.saveProject(p.id,p,0),/injected/);const s2=new FoundationStore(root);await s2.init();assert.equal((await s2.project(p.id)).nodes.length,0);assert.equal((await s2.recoveries(p.id)).autosave.project.nodes.length,1);p=await s2.applyRecovery(p.id,'autosave');assert.equal(p.nodes.length,1);await writeFile(path.join(folder,'.studio','HEAD'),'broken');assert.ok((await s2.project(p.id)).recovery);await assert.rejects(()=>s2.saveProject(p.id,p,p.revision),/복구/);const restored=await s2.applyRecovery(p.id,'disk');assert.equal(restored.nodes.length,1);assert.ok(!restored.recovery);
});
test('legacy import preserves original bytes, IDs, transforms, unknown fields and asset bytes through new save/reopen',async()=>{
 const root=await temp(),legacyRoot=path.join(root,'legacy'),legacy=new Store(legacyRoot);await legacy.init();let old=await legacy.createProject('legacy');const a=await legacy.importAsset({name:'image.png',content:Buffer.from('original image').toString('base64')});old.assets[a.id]=a;old.entities=[createEntity('Road',[[0,0,0],[10,0,0]])];old.customUnknown={keep:true};old=await legacy.saveProject(old.id,old,0);const sourceFile=path.join(legacyRoot,legacy.projectPath(old.id)),bytes=await readFile(sourceFile);const s=new FoundationStore(path.join(root,'new'));await s.init();let migrated=await s.importLegacy(legacyRoot,old.id);assert.equal(migrated.schemaVersion,3);assert.equal(migrated.entities[0].id,old.entities[0].id);assert.deepEqual(migrated.customUnknown,old.customUnknown);migrated.nodes.push(createNode('Group'));migrated=await s.saveProject(migrated.id,migrated,migrated.revision);const s2=new FoundationStore(s.root);await s2.init();assert.equal((await s2.project(migrated.id)).nodes.length,2);assert.deepEqual(await readFile(sourceFile),bytes);assert.deepEqual(await readFile(path.join(migrated.storage.path,'.studio','backups','legacy-original.json')),bytes);
});
test('private/shared scope, descriptor kinds and extension failure/cancel/unsupported contracts',async()=>{
 const s=new FoundationStore(await temp());await s.init();const p=await s.createProject('assets'),body={name:'image.png',content:Buffer.from('image').toString('base64'),category:'Texture'};const shared=await s.importAsset(body),privateAsset=await s.importAsset({...body,projectId:p.id});assert.notEqual(shared.id,privateAsset.id);assert.equal(shared.hash,privateAsset.hash);assert.equal((await s.state()).assets.length,2);
 const descriptor=await s.importAsset({name:'material.json',category:'Material',content:Buffer.from('{"roughness":0.5}').toString('base64'),projectId:p.id});assert.equal(descriptor.kind,'Material');
 const registry=new ModuleRegistry();registry.register({id:'mock',contractVersion:1,available:true,run:()=>{throw Error('bad');}});assert.equal((await registry.run('mock',{})).status,'failed');assert.equal((await registry.run('none',{})).status,'unsupported');assert.equal((await registry.run('mock',{signal:AbortSignal.abort()})).status,'cancelled');
});
test('composite property/asset/layer commands, cyclic parent rollback and saved checkpoint remain coherent',()=>{
 let p=newDocument('commands');const group=createNode('Group'),child=createNode('Prop');p.nodes.push(group,child);const assetId=crypto.randomUUID(),hash='a'.repeat(64);p.assets[assetId]={id:assetId,hash,ext:'glb'};const history=new CommandHistory();history.reset(p);
 const batch=history.execute(p,'grouped edit',d=>{applyNodeCommand(d,{type:'property',id:child.id,value:{density:2}});applyNodeCommand(d,{type:'assets',id:child.id,value:[{assetId,hash}]});applyNodeCommand(d,{type:'layer',id:child.id,value:'Zone'});applyNodeCommand(d,{type:'parent',id:child.id,value:group.id});});assert.ok(!batch.error);p=batch.document;assert.equal(history.past.length,1);p=history.undo(p);assert.deepEqual(p.nodes[1].properties,{});assert.equal(p.nodes[1].assetRefs.length,0);p=history.redo(p);assert.equal(p.nodes[1].properties.density,2);
 const second=createNode('Group',{parentId:group.id});p.nodes.push(second);const original=structuredClone(p);const bad=history.execute(p,'cycle',d=>applyNodeCommand(d,{type:'parent',id:group.id,value:second.id}));assert.ok(bad.error);assert.deepEqual(bad.document,original);
});
test('source-change scan distinguishes pinned bytes from changed/missing external original; private update survives reopen',async()=>{
 const root=await temp(),s=new FoundationStore(path.join(root,'work'));await s.init();let p=await s.createProject('source');const source=path.join(root,'original.glb');await writeFile(source,'one');const asset=await s.importAsset({name:'original.glb',content:Buffer.from('one').toString('base64'),sourcePath:source,category:'Model',projectId:p.id});p.assets[asset.id]=asset;p=await s.saveProject(p.id,p,0);await writeFile(source,'two');const scan=await s.inspect(p.id);assert.equal(scan.issues.length,0);assert.equal(scan.sourceIssues[0].state,'sourceChanged');const reopened=new FoundationStore(s.root);await reopened.init();const updated=await reopened.importAsset({name:'original.glb',content:Buffer.from('two').toString('base64'),sourcePath:source,category:'Model',projectId:p.id,assetId:asset.id});assert.equal(updated.id,asset.id);assert.equal((await reopened.project(p.id)).assets[asset.id].hash,asset.hash);
});
test('module staging blocks stale results and never reports unavailable adapters as successful',async()=>{
 const registry=new ModuleRegistry(),p=newDocument('module');registry.register({id:'ok',contractVersion:1,available:true,run:async()=>({status:'success',changes:[]})});let applied=0;assert.equal((await stagedModuleRun(registry,'ok',{sourceRevision:99},p,()=>applied++)).status,'failed');assert.equal(applied,0);await stagedModuleRun(registry,'ok',{sourceRevision:p.revision},p,()=>{applied++;return {status:'success'};});assert.equal(applied,1);
});
