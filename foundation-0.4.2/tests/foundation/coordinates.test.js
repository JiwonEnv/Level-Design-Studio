import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {assetFrame,assetPointToStudio,studioPointToAsset,localToAbsolute,absoluteToLocal,studioToEngine,engineToStudio,studioPoseToEngine} from '../../core/foundation/coordinates.js';
import {newDocument,createNode,worldTransform,pointToWorld,fromEuler,rebaseOrigin,validateDocument} from '../../core/foundation/document.js';
const near=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-6,`${a} != ${b}`));

test('10m asset frame matches the actual Three renderer matrix and preserves off-centre pivot',()=>{
  for(const [format,scale,point] of [['glb',1,[2,10,-3]],['fbx',.01,[200,1000,-300]],['fbx',2,[1,5,-1.5]]]){
    const frame=assetFrame(format,scale),group=new THREE.Group();group.rotation.x=frame.rotationX;group.scale.setScalar(frame.scale);group.updateMatrixWorld(true);
    const expected=new THREE.Vector3(...point).applyMatrix4(group.matrixWorld).toArray();
    near(assetPointToStudio(point,format,scale),expected);
    near(studioPointToAsset(expected,format,scale),point);
    near(assetPointToStudio([0,0,0],format,scale),[0,0,0]);
  }
  assert.equal(assetPointToStudio([0,10,0],'glb')[2],10);
  assert.equal(assetPointToStudio([1000,0,0],'fbx')[0],10);
  assert.throws(()=>assetFrame('fbx',0),/배율/);
  assert.throws(()=>assetFrame('obj'),/지원하지/);
});

test('origin rebasing preserves absolute asset geometry including nested rotation, scale and pivot offset',()=>{
  const p=newDocument('frame'),group=createNode('Group',{transform:{position:[100,20,3],rotation:fromEuler([0,0,35]),scale:[2,2,2]}}),child=createNode('Prop',{parentId:group.id,transform:{position:[2,4,6],rotation:fromEuler([20,0,10]),scale:[1,1,1]}});
  p.nodes.push(group,child);const assetPoint=assetPointToStudio([2,10,-3],'glb');
  const absolute=()=>localToAbsolute(pointToWorld(worldTransform(p,child),assetPoint),p.coordinateSystem.origin);
  const before=absolute();rebaseOrigin(p,[1e8,-100,200]);near(absolute(),before);validateDocument(p);
  near(absoluteToLocal(localToAbsolute([10,20,30],p.coordinateSystem.origin),p.coordinateSystem.origin),[10,20,30]);
});
test('engine profiles match measured asymmetric FBX centres and preserve rotated vectors',()=>{
  near(studioToEngine([7,3,1.5],'unreal-5.8'),[700,-300,150]);
  near(studioToEngine([7,3,1.5],'unity-6'),[-7,1.5,-3]);
  for(const engine of ['unreal-5.8','unity-6']){
    const p=[2,3,4],pose={position:[10,20,30],rotation:fromEuler([20,30,40]),scale:[2,3,4]};
    near(engineToStudio(studioToEngine(p,engine),engine),p);
    const source=pointToWorld(pose,p),converted=studioPoseToEngine(pose,engine);
    // Transform basis only, excluding engine length units from local vertex scale.
    const vertex=studioToEngine(p,engine);
    near(pointToWorld(converted,vertex),studioToEngine(source,engine));
  }
  assert.throws(()=>studioToEngine([1,2,3],'unverified'),/검증되지/);
});
