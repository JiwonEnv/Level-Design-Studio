import test from 'node:test';
import assert from 'node:assert/strict';
import {newDocument,reconcileLegacy,applyNodeCommand,pointToWorld} from '../../core/foundation/document.js';
import {createEntity,rectangle} from '../../core/scene-model.js';
import {terrainAuthoringSource,terrainLocalPoint,addTerrainStroke,setTerrainControl} from '../../core/foundation/terrain-authoring.js';
import {resolveTerrain} from '../../core/foundation/terrain-pipeline.js';
import {planGeneration,applyGeneration} from '../../core/generation.js';
import {CommandHistory} from '../../core/foundation/history.js';
function fixture(){const d=newDocument('Brush'),e=createEntity('Terrain',rectangle([20,20,0],40,40));d.entities.push(e);reconcileLegacy(d);return {d,id:e.id};}
test('one brush stroke contributes height once at crossings; repeated strokes are independent undoable modifiers',()=>{
 const {d,id}=fixture();applyGeneration(d,planGeneration(d));const old=structuredClone(d.objects),history=new CommandHistory(),source=terrainAuthoringSource(d,id),stroke={points:[[10,20],[30,20],[10,20]],radius:3,height:2,falloff:2};const result=history.execute(d,'stroke',p=>addTerrainStroke(p,source,stroke));assert.equal(result.error,undefined);assert.deepEqual(d.objects,old);let mesh=resolveTerrain(d.entities[0]);assert.equal(mesh.positions.find(p=>p[0]===20&&p[1]===20)[2],2);const profileId=d.entities[0].parameters.terrain.profiles[0].id;
 const second=history.execute(d,'second stroke',p=>addTerrainStroke(p,terrainAuthoringSource(p,id),stroke));assert.equal(second.error,undefined);mesh=resolveTerrain(d.entities[0]);assert.equal(mesh.positions.find(p=>p[0]===20&&p[1]===20)[2],4);assert.equal(d.entities[0].parameters.terrain.profiles[0].id,profileId);const undone=history.undo(d);assert.equal(undone.entities[0].parameters.terrain.profiles.length,1);assert.equal(resolveTerrain(undone.entities[0]).positions.find(p=>p[0]===20&&p[1]===20)[2],2);const redone=history.redo(undone);assert.deepEqual(redone.entities,d.entities);
});
test('control placement uses the canonical frame, preserves existing boundary IDs and includes an off-grid peak in the actual mesh',()=>{
 const {d,id}=fixture();applyNodeCommand(d,{type:'transform',id,value:{position:[100,200,10],rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2],scale:[2,3,2]}});let source=terrainAuthoringSource(d,id);const world=pointToWorld(source.frame,[12.3,17.7,0]),local=terrainLocalPoint(source,world);assert.ok(Math.hypot(local[0]-12.3,local[1]-17.7)<1e-8);const control=setTerrainControl(d,source,local,6),node=d.nodes.find(n=>n.id===id),mesh=resolveTerrain({...d.entities[0],geometry:node.geometry});assert.ok(mesh.vertexKeys.includes('control:'+control.id));assert.equal(mesh.positions[mesh.vertexKeys.indexOf('control:'+control.id)][2],6);
 const beforeIds=[...d.entities[0].geometry.vertexIds];source=terrainAuthoringSource(d,id);const boundary=setTerrainControl(d,source,[20,0],3);assert.equal(boundary.kind,'boundary');assert.equal(d.entities[0].geometry.vertexIds.length,beforeIds.length+1);assert.ok(beforeIds.every(id=>d.entities[0].geometry.vertexIds.includes(id)));source=terrainAuthoringSource(d,id);assert.equal(setTerrainControl(d,source,[20,0],4).id,boundary.id);
});
test('stale/locked input and oversized brush data preserve the complete document',()=>{
 const {d,id}=fixture(),source=terrainAuthoringSource(d,id),before=structuredClone(d);assert.throws(()=>addTerrainStroke(d,source,{points:Array.from({length:257},()=>[20,20]),radius:2,height:1}),/256/);assert.deepEqual(d,before);setTerrainControl(d,source,[20,20],2);const changed=structuredClone(d);assert.throws(()=>addTerrainStroke(d,source,{points:[[20,20]],radius:2,height:1}),/변경/);assert.deepEqual(d,changed);d.nodes.find(n=>n.id===id).locked=true;const locked=structuredClone(d);assert.throws(()=>terrainAuthoringSource(d,id),/잠긴/);assert.deepEqual(d,locked);
});
