import test from 'node:test';
import assert from 'node:assert/strict';
import {newDocument,reconcileLegacy,validateDocument} from '../../core/foundation/document.js';
import {visibleReferenceLayers,moveReferenceLayer} from '../../core/foundation/references.js';
import {createEntity,rectangle} from '../../core/scene-model.js';
import {planGeneration,applyGeneration} from '../../core/generation.js';
test('multiple reference layers preserve independent frames and canonical stacking order',()=>{
  const d=newDocument('Images');for(let i=0;i<2;i++){const id=crypto.randomUUID(),assetId=crypto.randomUUID();d.assets[assetId]={id:assetId,hash:String(i).repeat(64)};d.references.push({id,assetId,widthMeters:10+i,sourceSize:[100,50],origin:[i*20,0,0],rotation:i*30,opacity:.5});}reconcileLegacy(d);
  const before=structuredClone(d.references),ids=before.map(r=>r.id);assert.deepEqual(visibleReferenceLayers(d).map(r=>r.id),[...ids].reverse());
  moveReferenceLayer(d,ids[0],1);assert.deepEqual(d.references.map(r=>r.id),[...ids].reverse());assert.deepEqual([...d.references].reverse(),before);validateDocument(d);
  d.nodes.find(n=>n.id===ids[0]).visible=false;assert.deepEqual(visibleReferenceLayers(d).map(r=>r.id),[ids[1]]);
  d.nodes.find(n=>n.id===ids[0]).locked=true;const snapshot=structuredClone(d);assert.throws(()=>moveReferenceLayer(d,ids[0],-1),/잠긴/);assert.deepEqual(d,snapshot);
});
test('adding a new top reference updates unchanged old reference order without changing their frames',()=>{
  const d=newDocument('Import');const assetId=crypto.randomUUID();d.assets[assetId]={id:assetId,name:'source.png',hash:'a'.repeat(64)};
  const first={id:crypto.randomUUID(),assetId,widthMeters:10,sourceSize:[100,50],origin:[1,2,0],rotation:20,opacity:.3};d.references=[first];reconcileLegacy(d);const before=structuredClone(d),frame=structuredClone(d.nodes[0].transform);
  const next={...structuredClone(first),id:crypto.randomUUID(),name:'New',origin:[30,0,0]};d.references.unshift(next);reconcileLegacy(d,before);
  assert.deepEqual(d.references.map(r=>r.id),[next.id,first.id]);assert.deepEqual(d.nodes.find(n=>n.id===first.id).transform,frame);assert.equal(d.nodes.find(n=>n.id===next.id).name,'New');validateDocument(d);
});
test('unconfirmed image scale blocks only linked generation and is rechecked before apply',()=>{
 const d=newDocument('Scale'),ref={id:crypto.randomUUID(),assetId:crypto.randomUUID(),name:'Drawing',widthMeters:100,sourceSize:[100,50],origin:[0,0,0],rotation:0};d.references.push(ref);
 const linked=createEntity('Building',rectangle([0,0,0],8,6),{referenceIds:[ref.id]}),independent=createEntity('Building',rectangle([30,0,0],8,6));d.entities.push(linked,independent);
 const before=structuredClone(d),blocked=planGeneration(d);assert.equal(blocked.updates.length,1);assert.equal(blocked.updates[0].sourceEntityId,independent.id);assert.match(blocked.diagnostics[0].message,/축척/);assert.deepEqual(d,before);
 ref.scaleConfirmed=true;const ready=planGeneration(d);assert.equal(ready.updates.length,2);ref.scaleConfirmed=false;assert.throws(()=>applyGeneration(d,ready),/축척/);assert.deepEqual(d.objects,[]);
 delete ref.scaleConfirmed;ref.calibration={pixels:[[0,0],[100,0]],distanceMeters:100};assert.equal(planGeneration(d).updates.length,2);
});
