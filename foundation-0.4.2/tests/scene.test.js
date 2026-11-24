import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store} from '../store.js';
import {createEntity,rectangle,entityIssues,referenceToWorld,worldToReference,markOverride,dependencyEdges} from '../core/scene-model.js';
import {planGeneration,applyGeneration} from '../core/generation.js';

async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),'lds-scene-'));const store=new Store(root);await store.init();return {root,store,p:await store.createProject('레벨')};}
test('v1 read is non-destructive; first v2 save preserves exact original and 3D placement',async()=>{
 const {root,store,p}=await fixture();const fp={id:randomUUID(),name:'이전 건물',width:8,depth:6,position:[10,20,0]},recipe={id:randomUUID(),footprintId:fp.id,floors:2,floorHeight:3},object={id:randomUUID(),kind:'blockout',recipeId:recipe.id,name:'수정된 건물',position:[12,23,0],rotation:[0,0,30],scale:[1,2,1],dimensions:[8,6,6],locked:false};
 const legacy={...p,schemaVersion:1,footprints:[fp],recipes:[recipe],objects:[object]};delete legacy.entities;delete legacy.layers;const file=store.projectPath(p.id);await store.atomic(file,legacy);const bytes=await readFile(path.join(root,file),'utf8');
 const loaded=await store.project(p.id);assert.equal(loaded.schemaVersion,2);assert.equal(loaded.entities[0].id,fp.id);assert.equal(loaded.entities[0].outputId,object.id);assert.deepEqual(loaded.objects[0].position,object.position);assert.equal(await readFile(path.join(root,file),'utf8'),bytes);
 const plan=planGeneration(loaded);assert.deepEqual(plan.updates[0].position,[12,23,0]);assert.deepEqual(plan.updates[0].rotation,[0,0,30]);assert.equal(plan.updates[0].ownership,'User Override');assert.equal(Math.min(...plan.updates[0].geometry.points.map(p=>p[0]))-plan.updates[0].anchor[0]+plan.updates[0].position[0],8);
 applyGeneration(loaded,plan);const saved=await store.saveProject(p.id,loaded,0);assert.equal(await readFile(path.join(root,file+'.v1-original.json'),'utf8'),bytes);await store.saveProject(p.id,saved,1);assert.equal(await readFile(path.join(root,file+'.v1-original.json'),'utf8'),bytes);
});
test('six semantic types survive disk round trip; referential and geometry validation rejects corruption',async()=>{
 const {store,p}=await fixture();p.entities=['Terrain','Road','Building','Water','Zone','Prop'].map(type=>createEntity(type,type==='Road'?[[0,0,0],[10,0,1]]:type==='Prop'?[[4,4,0]]:rectangle([0,0,0],8,6)));
 const saved=await store.saveProject(p.id,p,0);const reopened=await store.project(p.id);assert.deepEqual(reopened.entities,saved.entities);
 const bad=structuredClone(reopened);bad.entities[0].referenceIds=[randomUUID()];await assert.rejects(()=>store.saveProject(p.id,bad,1),/참조 이미지 누락/);
 const crossing=createEntity('Building',[[0,0,0],[10,10,0],[0,10,0],[10,0,0]]);assert.ok(entityIssues(crossing).some(x=>x.includes('교차')));
 const dangling=structuredClone(reopened);dangling.recipes=[{id:randomUUID(),footprintId:randomUUID(),floors:2,floorHeight:3}];await assert.rejects(()=>store.saveProject(p.id,dangling,1),/외곽선 참조 누락/);
});
test('generation preview is pure, selected changes preserve overrides and independent/other results',async()=>{
 const {p}=await fixture();const building=createEntity('Building',rectangle([10,20,0],8,6)),road=createEntity('Road',[[0,0,0],[20,0,0]]);p.entities=[building,road];
 const initial=JSON.stringify(p),preview=planGeneration(p);assert.equal(JSON.stringify(p),initial);applyGeneration(p,preview);
 const b=p.objects.find(o=>o.sourceEntityId===building.id);b.position[0]=3;b.rotation[2]=20;markOverride(b);const r=structuredClone(p.objects.find(o=>o.sourceEntityId===road.id));
 const independent={id:randomUUID(),kind:'blockout',name:'사용자 프랍',position:[100,100,0],rotation:[0,0,0],scale:[1,1,1],dimensions:[1,1,1],ownership:'Independent'};p.objects.push(independent);building.parameters.floors=4;
 const next=planGeneration(p,[building.id]);assert.equal(next.updates.length,1);applyGeneration(p,next);assert.equal(p.objects[0].id,b.id);assert.equal(p.objects[0].position[0],3);assert.equal(p.objects[0].rotation[2],20);assert.equal(p.objects[0].ownership,'User Override');assert.deepEqual(p.objects.find(o=>o.id===r.id),r);assert.deepEqual(p.objects.at(-1),independent);assert.equal(planGeneration(p).updates.length,0);
 const changed=planGeneration(p);p.revision++;assert.throws(()=>applyGeneration(p,changed),/변경/);
 building.parameters.floors=5;p.layers.find(l=>l.id==='Building').locked=true;const locked=planGeneration(p,[building.id]);assert.equal(locked.updates.length,0);assert.equal(locked.conflicts.length,1);
});
test('Reference Adapter converts pixels and rotated local metres reversibly',()=>{
 const ref={id:randomUUID(),widthMeters:100,sourceSize:[200,100],origin:[10,20,0],rotation:30};const pixel=[80,60],world=referenceToWorld(ref,pixel),back=worldToReference(ref,world);assert.ok(Math.abs(back[0]-pixel[0])<1e-9);assert.ok(Math.abs(back[1]-pixel[1])<1e-9);
 const entity=createEntity('Road',[[0,0,0],[10,0,0]],{referenceIds:[ref.id]});assert.deepEqual(dependencyEdges({entities:[entity]}).map(e=>e.type),['reference','generation']);
});
