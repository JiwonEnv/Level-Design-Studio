import test from 'node:test';
import assert from 'node:assert/strict';
import {newDocument,reconcileLegacy} from '../../core/foundation/document.js';
import {createEntity,rectangle} from '../../core/scene-model.js';
import {terrainAuthoringSource,addTerrainContour,setTerrainControl,moveTerrainContourVertex} from '../../core/foundation/terrain-authoring.js';
import {resolveTerrain} from '../../core/foundation/terrain-pipeline.js';
import {affectedBy} from '../../core/foundation/dependencies.js';
function fixture(){const d=newDocument('Contour'),e=createEntity('Terrain',rectangle([20,20,0],40,40));d.entities.push(e);reconcileLegacy(d);return {d,id:e.id};}
test('cross-boundary contours are clipped, insert boundary samples and reproduce exact contour heights without editing original vertices',()=>{
 const {d,id}=fixture(),before=structuredClone(d.entities[0].geometry),contour=addTerrainContour(d,terrainAuthoringSource(d,id),{points:[[-5,20],[45,20]],height:3});assert.deepEqual(d.entities[0].geometry,before);const mesh=resolveTerrain(d.entities[0]);assert.equal(mesh.stats.contourSegments,1);assert.equal(mesh.stats.boundaryVertexCount,6);for(const [i,key] of mesh.vertexKeys.entries())if(key.startsWith('contour'))assert.ok(Math.abs(mesh.positions[i][2]-3)<1e-8);assert.ok(mesh.positions.some(p=>p[0]===0&&p[1]===20&&p[2]===3));assert.ok(mesh.positions.some(p=>p[0]===40&&p[1]===20&&p[2]===3));assert.deepEqual(mesh,resolveTerrain(d.entities[0]));assert.deepEqual(affectedBy(d,[id+':terrain-contour:'+contour.id]).outputIds,[d.entities[0].outputId]);
});
test('conflicting heights at curve crossings and explicit controls are rejected atomically',()=>{
 const {d,id}=fixture();addTerrainContour(d,terrainAuthoringSource(d,id),{points:[[5,20],[35,20]],height:3});let before=structuredClone(d);assert.throws(()=>addTerrainContour(d,terrainAuthoringSource(d,id),{points:[[20,5],[20,35]],height:6}),/교차/);assert.deepEqual(d,before);
 // A later explicit point on the contour is invalid at a different height.
 assert.throws(()=>setTerrainControl(d,terrainAuthoringSource(d,id),[20,20],6),/충돌|다릅니다/);assert.deepEqual(d,before);
 setTerrainControl(d,terrainAuthoringSource(d,id),[20,20],3);before=structuredClone(d);assert.throws(()=>addTerrainContour(d,terrainAuthoringSource(d,id),{points:[[20,10],[20,30]],height:2}),/교차|충돌/);assert.deepEqual(d,before);
});
test('oblique and closed contours constrain the actual triangle surface between samples without cracks',()=>{
 const {d,id}=fixture();addTerrainContour(d,terrainAuthoringSource(d,id),{points:[[-5,6],[43,33]],height:3});addTerrainContour(d,terrainAuthoringSource(d,id),{points:[[7,7],[31,8],[18,30]],height:3,closed:true});const mesh=resolveTerrain(d.entities[0]),edges=new Map();for(let i=0;i<mesh.indices.length;i+=3){const v=mesh.indices.slice(i,i+3);for(let j=0;j<3;j++){const key=[v[j],v[(j+1)%3]].sort((a,b)=>a-b).join('/');edges.set(key,(edges.get(key)||0)+1);}}
 for(const [key,count] of edges){assert(count<=2);if(count===1){const [a,b]=key.split('/').map(Number).map(i=>mesh.positions[i]);assert(a[0]===0&&b[0]===0||a[0]===40&&b[0]===40||a[1]===0&&b[1]===0||a[1]===40&&b[1]===40,'internal crack');}}
 function sample(x,y){for(let i=0;i<mesh.indices.length;i+=3){const [a,b,c]=mesh.indices.slice(i,i+3).map(i=>mesh.positions[i]),den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]),u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den;if(u>=-1e-8&&v>=-1e-8&&u+v<=1+1e-8)return u*a[2]+v*b[2]+(1-u-v)*c[2];}throw Error('missing triangle');}
 for(const line of d.entities[0].parameters.terrain.contours){const count=line.points.length-(line.closed?0:1);for(let i=0;i<count;i++)for(let j=1;j<50;j++){const a=line.points[i],b=line.points[(i+1)%line.points.length],t=j/50,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;if(x>0&&x<40&&y>0&&y<40)assert(Math.abs(sample(x,y)-3)<1e-6);}}
});
test('editing contour coordinates preserves contour/vertex identities and concave clipping creates separate valid pieces',()=>{
 const {d,id}=fixture();const added=addTerrainContour(d,terrainAuthoringSource(d,id),{points:[[5,10],[35,10]],height:2}),contour=d.entities[0].parameters.terrain.contours[0],ids=[...contour.vertexIds];moveTerrainContourVertex(d,terrainAuthoringSource(d,id),added.id,ids[0],[6,11]);assert.equal(d.entities[0].parameters.terrain.contours[0].id,added.id);assert.deepEqual(d.entities[0].parameters.terrain.contours[0].vertexIds,ids);assert.deepEqual(d.entities[0].parameters.terrain.contours[0].points[0],[6,11]);
 const e=createEntity('Terrain',[[0,0,0],[40,0,0],[40,10,0],[10,10,0],[10,40,0],[0,40,0]]),project=newDocument('L');project.entities.push(e);reconcileLegacy(project);addTerrainContour(project,terrainAuthoringSource(project,e.id),{points:[[0,25],[25,0]],height:4});const mesh=resolveTerrain(project.entities[0]);assert.equal(mesh.stats.contourSegments,2);
});
