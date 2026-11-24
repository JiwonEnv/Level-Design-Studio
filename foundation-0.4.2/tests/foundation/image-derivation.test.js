import test from 'node:test';
import assert from 'node:assert/strict';
import {imageOperation,derivedReferenceFrame} from '../../core/foundation/image-derivation.js';
import {referenceToWorld} from '../../core/scene-model.js';
const ref={id:crypto.randomUUID(),assetId:crypto.randomUUID(),sourceSize:[100,50],origin:[10,20,0],rotation:30,widthMeters:100,opacity:.5,scaleConfirmed:true},asset={hash:'a'.repeat(64)};
test('derived crop preserves rotated source pixel positions, confirmed scale and immutable provenance',()=>{
 const before=structuredClone(ref),op=imageOperation(ref,{type:'crop',x:20,y:10,width:40,height:30}),frame=derivedReferenceFrame(ref,asset,op);assert.deepEqual(ref,before);assert.equal(frame.scaleConfirmed,true);assert.equal(frame.widthMeters,40);assert.deepEqual(frame.sourceSize,[40,30]);assert.deepEqual(frame.derived.sourceFrame,ref);assert.equal(frame.derived.sourceHash,asset.hash);
 for(const pt of [[0,0],[40,30],[15,12]]){const a=referenceToWorld(frame,pt),b=referenceToWorld(ref,[pt[0]+20,pt[1]+10]);assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-10);}
});
test('perspective transformation requires new metric calibration and rejects invalid or oversized input',()=>{
 const op=imageOperation(ref,{type:'perspective',corners:[[10,5],[90,8],[85,45],[12,40]],width:80,height:40}),frame=derivedReferenceFrame(ref,asset,op);assert.equal(frame.scaleConfirmed,false);assert.equal(frame.geo,undefined);assert.deepEqual(frame.derived.operation.params.corners,op.params.corners);assert.throws(()=>imageOperation(ref,{type:'crop',x:90,y:0,width:20,height:10}),/범위/);assert.throws(()=>imageOperation(ref,{type:'perspective',corners:[[0,0],[100,50],[100,0],[0,50]],width:100,height:50}),/시계 방향/);assert.throws(()=>imageOperation(ref,{type:'perspective',corners:op.params.corners,width:4097,height:50}),/4096/);assert.throws(()=>imageOperation(ref,{type:'arbitrary-command'}),/지원하지/);
});
