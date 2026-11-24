import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createEntity,rectangle} from '../../core/scene-model.js';
import {newDocument,reconcileLegacy,applyNodeCommand} from '../../core/foundation/document.js';
import {newTerrainDefinition} from '../../core/foundation/terrain-definition.js';
import {resolveTerrain,terrainPointInside} from '../../core/foundation/terrain-pipeline.js';
import {planGeneration,applyGeneration} from '../../core/generation.js';
import {generatedMesh} from '../../src/generated-view.js';
import {affectedBy,dependencyGraph} from '../../core/foundation/dependencies.js';
function fixture(){const e=createEntity('Terrain',rectangle([0,0,0],20,20));e.parameters.terrain={...newTerrainDefinition(),cellSize:2};const level={id:crypto.randomUUID(),kind:'level',mode:'base',center:[0,0],radius:5,height:5},offset={...level,id:crypto.randomUUID(),kind:'offset',height:2};e.parameters.terrain.profiles=[level,offset];e.parameters.terrain.modifiers=[level,offset].map(p=>({id:crypto.randomUUID(),profileId:p.id,strength:1,falloff:2,enabled:true}));return e;}
const centre=mesh=>mesh.positions.find(p=>Math.hypot(p[0],p[1])<1e-8)[2];
test('terrain stages are deterministic, base-only profiles do not feed back and modifier order/impact is explicit',()=>{
 const e=fixture(),before=structuredClone(e),a=resolveTerrain(e),b=resolveTerrain(e);assert.deepEqual(a,b);assert.deepEqual(e,before);assert.equal(centre(a),7);assert.equal(a.profiles[0].targetHeight,5);assert.ok(a.stats.modifiers[0].affectedVertices>0);assert.equal(a.stats.modifiers[1].maxDelta,2);assert.equal(a.positions[0][2],0);
 e.parameters.terrain.modifiers.reverse();assert.equal(centre(resolveTerrain(e)),5);e.parameters.terrain.modifiers[0].enabled=false;assert.equal(centre(resolveTerrain(e)),5);
});
test('concave boundaries and collinear source heights stay covered by a conforming mesh',()=>{
 const e=fixture();e.geometry.points=[[0,0,0],[10,0,0],[20,0,0],[20,8,0],[8,8,0],[8,20,0],[0,20,0]];e.geometry.vertexIds=e.geometry.points.map(()=>crypto.randomUUID());e.parameters.terrain.profiles[0].center=[4,4];e.parameters.terrain.profiles[1].center=[4,4];const mesh=resolveTerrain(e),edges=new Map();let area=0;
 for(let i=0;i<mesh.indices.length;i+=3){const ids=mesh.indices.slice(i,i+3),pts=ids.map(id=>mesh.positions[id]),centroid=[0,1].map(axis=>pts.reduce((sum,p)=>sum+p[axis],0)/3);assert.ok(terrainPointInside(centroid,e.geometry.points));area+=Math.abs((pts[1][0]-pts[0][0])*(pts[2][1]-pts[0][1])-(pts[1][1]-pts[0][1])*(pts[2][0]-pts[0][0]))/2;for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],key=a<b?`${a}/${b}`:`${b}/${a}`;edges.set(key,(edges.get(key)||0)+1);}}
 assert.ok(Math.abs(area-256)<1e-6);assert.ok([...edges.values()].every(n=>n===1||n===2));assert.equal(mesh.indices.length/3,2*mesh.positions.length-e.geometry.points.length-2);assert.ok(e.geometry.vertexIds.every(id=>mesh.vertexKeys.includes('boundary:'+id)));
});
test('node-local terrain heights follow canonical rotation/scale once and actual Three geometry has the measured world bounds',()=>{
 const d=newDocument('Terrain'),e=fixture();e.parameters.terrain.modifiers.pop();d.entities.push(e);reconcileLegacy(d);applyNodeCommand(d,{type:'transform',id:e.id,value:{position:[100,200,10],rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2],scale:[2,2,2]}});
 const before=structuredClone(d),plan=planGeneration(d);assert.deepEqual(d,before);assert.equal(plan.updates.length,1);const output=plan.updates[0];assert.ok(Math.abs(output.terrainMesh.stats.minHeight-10)<1e-8);assert.ok(Math.abs(output.terrainMesh.stats.maxHeight-20)<1e-8);const mesh=generatedMesh(output);mesh.position.fromArray(output.position);mesh.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(mesh);assert.ok(Math.abs(box.min.z-10)<1e-5);assert.ok(Math.abs(box.max.z-20)<1e-5);assert.ok(Math.abs(box.getSize(new THREE.Vector3()).x-40)<1e-4);mesh.traverse(m=>m.geometry?.dispose());applyGeneration(d,plan);assert.equal(planGeneration(d).updates.length,0);
 assert.deepEqual(dependencyGraph(d).diagnostics,[]);const modifierId=e.parameters.terrain.modifiers[0].id;assert.deepEqual(affectedBy(d,[e.id+':terrain-modifier:'+modifierId]).outputIds,[e.outputId]);assert.deepEqual(affectedBy(d,[e.id+':terrain-modifier:'+modifierId]).entityIds,[e.id]);
});
test('oversized or invalid terrain never overwrites its old output while independent valid generation remains available',()=>{
 const d=newDocument('Budget'),e=fixture(),building=createEntity('Building',rectangle([40,0,0],8,6));d.entities.push(e,building);reconcileLegacy(d);applyGeneration(d,planGeneration(d));const old=structuredClone(d.objects.find(o=>o.sourceEntityId===e.id));d.entities[0].parameters.terrain.cellSize=.1;d.entities[1].parameters.floors=3;reconcileLegacy(d);const plan=planGeneration(d);assert.equal(plan.updates.length,1);assert.equal(plan.updates[0].sourceEntityId,building.id);assert.ok(plan.diagnostics.some(d=>d.severity==='error'&&/한도|계산점/.test(d.message)));applyGeneration(d,plan);assert.deepEqual(d.objects.find(o=>o.id===old.id),old);
});
