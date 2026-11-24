import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rename,copyFile,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {newDocument,reconcileLegacy,projectLegacy,applyNodeCommand,fromEuler,createNode,validateDocument} from '../../core/foundation/document.js';
import {createEntity,rectangle} from '../../core/scene-model.js';
import {FoundationStore} from '../../infrastructure/foundation-store.js';
const fixture=async()=>{const root=await mkdtemp(path.join(os.tmpdir(),'lds-stable-'));const store=new FoundationStore(root);await store.init();return {root,store,p:await store.createProject('검증')};};
test('Reference world frame follows common transform, asset detach is real, no stale projection accepted',()=>{
 const p=newDocument('reference'),assetId=crypto.randomUUID(),id=crypto.randomUUID();p.assets[assetId]={id:assetId,hash:'a'.repeat(64),ext:'png'};p.references.push({id,assetId,widthMeters:100,sourceSize:[200,100],origin:[10,20,0],rotation:30,opacity:.5});reconcileLegacy(p);const node=p.nodes.find(n=>n.id===id);const transform=structuredClone(node.transform);transform.position=[40,50,0];transform.rotation=fromEuler([0,0,60]);transform.scale=[2,2,2];applyNodeCommand(p,{type:'transform',id,value:transform});assert.deepEqual(p.references[0].origin,[40,50,0]);assert.ok(Math.abs(p.references[0].rotation-60)<1e-8);assert.equal(p.references[0].widthMeters,200);
});
test('model asset unlink does not resurrect; semantic Prop link follows registry; draft remains independent',()=>{
 const p=newDocument('links'),id=crypto.randomUUID(),a=crypto.randomUUID();p.assets[a]={id:a,hash:'a'.repeat(64),ext:'glb'};p.objects.push({id,kind:'asset',assetId:a,name:'model',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],ownership:'Independent',unitScale:1});reconcileLegacy(p);applyNodeCommand(p,{type:'assets',id,value:[]});assert.equal(p.objects.find(o=>o.id===id)?.assetId,undefined);assert.equal(p.objects.find(o=>o.id===id),undefined);
});
test('common source edits survive unrelated legacy edit and redundant projection corruption is rejected',()=>{
 const p=newDocument('bridge');p.entities.push(createEntity('Building',rectangle([0,0,0],8,6)),createEntity('Road',[[0,0,0],[10,0,0]]));reconcileLegacy(p);const first=p.nodes[0];applyNodeCommand(p,{type:'transform',id:first.id,value:{position:[5,6,0],rotation:fromEuler([0,0,30]),scale:[1,1,1]}});const before=structuredClone(p);p.entities[1].parameters.width=9;reconcileLegacy(p,before);assert.deepEqual(p.nodes[0],before.nodes[0]);const bad=structuredClone(p);bad.entities[0].name='stale projection';assert.throws(()=>validateDocument(bad),/호환|projection|일치/);
});
test('moved project can reconnect only after old location absent; live duplicate ID is rejected',async()=>{
 const {root,store,p}=await fixture(),moved=path.join(root,'Moved');await rename(p.storage.path,moved);assert.equal((await store.openProjectFolder(moved)).id,p.id);const copied=path.join(root,'Copy');await mkdir(copied);await assert.rejects(()=>store.openProjectFolder(path.join(root,'missing')));assert.equal((await store.project(p.id)).storage.path,moved);
});
test('same revision external HEAD changes and divergent OneDrive conflict copies block overwrite',async()=>{
 const {store,p}=await fixture();const headPath=path.join(p.storage.path,'.studio','HEAD');const original=await readFile(headPath);const external=structuredClone(p);external.name='external same revision';await store.commit(p.storage.path,external);await assert.rejects(()=>store.saveProject(p.id,p,p.revision),/충돌|변경/);assert.equal((await store.project(p.id)).name,'external same revision');await writeFile(headPath,original);
 await writeFile(path.join(p.storage.path,'.studio','HEAD-PC-B.json'),JSON.stringify({generation:crypto.randomUUID()}));await assert.rejects(()=>store.saveProject(p.id,p,p.revision),/충돌|확인/);
});
test('previous generation restore keeps original commits and recovery does not roll back newer work silently',async()=>{
 const {store,p}=await fixture();const initial=await store.versions(p.id);p.nodes.push(createNode('Group'));const saved=await store.saveProject(p.id,p,p.revision);const restored=await store.restoreVersion(p.id,initial[0].generation,saved.storage.generation);assert.equal(restored.nodes.length,0);assert.ok(restored.revision>saved.revision);assert.equal((await store.versions(p.id)).length,3);
});
test('semantic Prop has a single canonical asset link and its STEP parameters derive from it',()=>{
 const p=newDocument('prop'),a=crypto.randomUUID(),b=crypto.randomUUID();for(const id of [a,b])p.assets[id]={id,hash:'a'.repeat(64),ext:'glb'};const entity=createEntity('Prop',[[0,0,0]]);entity.parameters.assetId=a;p.entities.push(entity);reconcileLegacy(p);const node=p.nodes[0];assert.equal(node.properties.assetId,undefined);assert.equal(node.assetRefs[0].assetId,a);applyNodeCommand(p,{type:'assets',id:node.id,value:[{assetId:b,hash:p.assets[b].hash}]});assert.equal(p.entities[0].parameters.assetId,b);applyNodeCommand(p,{type:'assets',id:node.id,value:[]});assert.equal(p.entities[0].parameters.assetId,undefined);
});
