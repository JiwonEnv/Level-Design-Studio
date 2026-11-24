import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {FoundationStore} from '../../infrastructure/foundation-store.js';
import {newDocument,createNode,validateDocument} from '../../core/foundation/document.js';
import {CommandHistory} from '../../core/foundation/history.js';
import {defineSocket} from '../../core/foundation/sockets.js';
import {affectedBy} from '../../core/foundation/dependencies.js';
import {createProductionIdentity as create,updateProductionData as update,retireProductionIdentity as retire,ensureProductionSlot as slot,setProductionPart as part,productionIdentityIssues} from '../../core/foundation/production-identity.js';

function fixture(p=newDocument('Production'),assets=null){
  const node=createNode('Building');p.nodes.push(node);
  const recipe=create(p,'Recipe',{data:{floors:2}});
  const variant=create(p,'Variant',{recipeId:recipe.id,data:{style:'A'}});
  const instance=create(p,'Instance',{recipeId:recipe.id,variantId:variant.id,nodeId:node.id});
  const s=slot(p,instance.id,'floor:ground/facade:front/bay:entry');
  const a=assets?.[0].id||crypto.randomUUID(),b=assets?.[1].id||crypto.randomUUID();
  p.assets[a]=assets?.[0]||{id:a,hash:'a'.repeat(64)};p.assets[b]=assets?.[1]||{id:b,hash:'b'.repeat(64)};
  const piece=create(p,'Part',{slotId:s.id,assetId:a,overrides:{offset:0.2},data:{style:'A'}});
  return {p,node,recipe,variant,instance,s,piece,a,b};
}
test('old documents need no migration; contract edits are atomic and identities survive source/data changes',()=>{
  const old=newDocument('old'),before=structuredClone(old);assert.deepEqual(productionIdentityIssues(old),[]);assert.deepEqual(old,before);
  const {p,recipe,instance,s,piece,b}=fixture();
  update(p,recipe.id,{floors:3});
  assert.equal(slot(p,instance.id,s.semanticKey).id,s.id);
  const next=part(p,s.id,b,{style:'B'});assert.equal(next.id,piece.id);assert.deepEqual(next.overrides,{offset:0.2});
  assert.equal(validateDocument(p),true);
  const snapshot=structuredClone(p);
  assert.throws(()=>create(p,'Instance',{recipeId:crypto.randomUUID(),nodeId:p.nodes[0].id}),/INVALID_RECIPEID/);
  assert.deepEqual(p,snapshot);
  assert.throws(()=>retire(p,recipe.id),/INVALID_RECIPEID/);assert.deepEqual(p,snapshot);
});
test('semantic slots are scoped per instance; retirement retains history and never silently reuses a slot',()=>{
  const {p,recipe,instance,s,piece}=fixture();
  const another=create(p,'Instance',{recipeId:recipe.id,nodeId:p.nodes[0].id});
  assert.notEqual(slot(p,another.id,s.semanticKey).id,s.id);
  retire(p,piece.id);retire(p,s.id);
  assert.throws(()=>slot(p,instance.id,s.semanticKey),/재사용/);
  const saved=p.extensions.productionIdentity.records;assert.equal(saved.find(r=>r.id===piece.id).state,'retired');
  assert.equal(validateDocument(p),true);
});
test('cross-recipe variants, duplicate identities and external ID collisions are rejected',()=>{
  const {p,variant,node}=fixture();const other=create(p,'Recipe');
  assert.throws(()=>create(p,'Instance',{recipeId:other.id,variantId:variant.id,nodeId:node.id}),/VARIANT_RECIPE_MISMATCH/);
  const broken=structuredClone(p);broken.extensions.productionIdentity.records[0].id=node.id;
  assert.ok(productionIdentityIssues(broken).some(i=>i.code==='IDENTITY_COLLISION'));
});
test('undo/redo and repository restart preserve Recipe/Variant/Instance/Slot/Part IDs',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'lds-production-')),store=new FoundationStore(root);await store.init();
  let p=await store.createProject('Persistent identities');const base=structuredClone(p),h=new CommandHistory();h.reset(p);
  const assets=[];for(const value of ['one','two'])assets.push(await store.importAsset({name:value+'.png',category:'Texture',content:Buffer.from(value).toString('base64')}));
  const changed=h.execute(p,'production identities',d=>fixture(d,assets));assert.ok(!changed.error);p=changed.document;
  const expected=structuredClone(p.extensions.productionIdentity);
  p=h.undo(p);assert.deepEqual(p.nodes,base.nodes);assert.equal(p.extensions.productionIdentity,undefined);
  p=h.redo(p);assert.deepEqual(p.extensions.productionIdentity,expected);
  const socket=defineSocket(p,{ownerType:'node',ownerId:p.nodes[0].id,key:'door',type:'door',accepts:['path'],pose:{position:[1,0,0],rotation:[0,0,0,1],scale:[1,1,1]}});
  const socketExpected=structuredClone(p.extensions.sockets);
  // Socket is independent of the preceding production-identity history entry.
  h.reset(p);const renamed=h.execute(p,'rename',d=>{d.nodes[0].name='changed';});p=renamed.document;
  p=h.undo(p);assert.notEqual(p.nodes[0].name,'changed');
  p=h.redo(p);assert.deepEqual(p.extensions.productionIdentity,expected);
  p=await store.saveProject(p.id,p,p.revision);
  const reopened=new FoundationStore(root);await reopened.init();const restored=await reopened.project(p.id);assert.deepEqual(restored.extensions.productionIdentity,expected);assert.deepEqual(restored.extensions.sockets,socketExpected);assert.ok(affectedBy(restored,[restored.nodes[0].id]).ids.includes(socket.id));
});
