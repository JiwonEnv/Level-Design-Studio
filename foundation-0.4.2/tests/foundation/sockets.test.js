import test from 'node:test';
import assert from 'node:assert/strict';
import {newDocument,createNode,identity,validateDocument} from '../../core/foundation/document.js';
import {defineSocket,socketWorldPose,inspectSocketConnection} from '../../core/foundation/sockets.js';
import {affectedBy} from '../../core/foundation/dependencies.js';
test('socket local pose, stable semantic key and dependencies use canonical owner frame',()=>{
  const d=newDocument('Sockets'),node=createNode('Building');node.transform.position=[10,20,0];d.nodes.push(node);
  const desc={ownerType:'node',ownerId:node.id,key:'entrance',type:'door',accepts:['path'],pose:{...identity(),position:[2,0,0]}};
  const s=defineSocket(d,desc);assert.deepEqual(socketWorldPose(d,s).position,[12,20,0]);
  assert.equal(defineSocket(d,{...desc,accepts:['path','stairs']}).id,s.id);
  assert.ok(affectedBy(d,[node.id]).ids.includes(s.id));assert.equal(validateDocument(d),true);
  const before=structuredClone(d);assert.throws(()=>defineSocket(d,{...desc,pose:{...identity(),rotation:[0,0,0,0]}}),/SOCKET_POSE/);assert.deepEqual(d,before);
  d.nodes=[];assert.throws(()=>validateDocument(d),/SOCKET_OWNER/);
});
test('asset sockets require a matching placement to produce a world pose',()=>{
  const d=newDocument('Asset socket'),assetId=crypto.randomUUID(),node=createNode('Prop');d.assets[assetId]={id:assetId,hash:'a'.repeat(64)};node.assetRefs=[{assetId,hash:'a'.repeat(64)}];d.nodes.push(node);
  const s=defineSocket(d,{ownerType:'asset',ownerId:assetId,key:'end',type:'wall',accepts:['wall'],pose:identity()});
  assert.throws(()=>socketWorldPose(d,s),/객체/);assert.deepEqual(socketWorldPose(d,s,node.id),identity());
  node.assetRefs=[];assert.throws(()=>socketWorldPose(d,s,node.id),/일치/);
});
test('connection rules require mutual types, opposing normals and explicit metre/angular tolerances',()=>{
  const d=newDocument('Join'),a=createNode('Building'),b=createNode('Building');b.transform.position=[2,0,0];d.nodes.push(a,b);
  const s=defineSocket(d,{ownerType:'node',ownerId:a.id,key:'end',type:'wall',accepts:['wall'],pose:{...identity(),position:[1,0,0]}});
  const t=defineSocket(d,{ownerType:'node',ownerId:b.id,key:'end',type:'wall',accepts:['wall'],pose:{...identity(),position:[-1,0,0],rotation:[0,0,1,0]}}),tolerance={distanceMetres:.01,angleRadians:.01};
  assert.equal(inspectSocketConnection(d,s,t,tolerance).compatible,true);
  b.transform.position[0]+=1;assert.ok(inspectSocketConnection(d,s,t,tolerance).reasons.includes('DISTANCE'));
  b.transform.position[0]-=1;t.pose.rotation=[0,0,0,1];assert.ok(inspectSocketConnection(d,s,t,tolerance).reasons.includes('DIRECTION'));
  t.accepts=[];assert.ok(inspectSocketConnection(d,s,t,tolerance).reasons.includes('INCOMPATIBLE_TYPES'));
  assert.throws(()=>inspectSocketConnection(d,s,t,{}),/허용 오차/);
});
