import test from 'node:test';
import assert from 'node:assert/strict';
import {newDocument,createNode,reconcileLegacy} from '../../core/foundation/document.js';
import {createEntity,rectangle} from '../../core/scene-model.js';
import {dependencyGraph,affectedBy} from '../../core/foundation/dependencies.js';
import {planGenerationForChanges} from '../../core/generation.js';
test('reference and parent changes reach only dependent entities and reserved outputs',()=>{
  const p=newDocument('graph'),ref=createNode('Reference'),group=createNode('Group');p.nodes.push(ref,group);
  const a=createEntity('Building',rectangle([0,0,0],8,6),{referenceIds:[ref.id]}),b=createEntity('Road',[[0,0,0],[10,0,0]]);p.entities.push(a,b);reconcileLegacy(p);p.nodes.find(n=>n.id===a.id).parentId=group.id;
  const before=structuredClone(p),fromRef=affectedBy(p,[ref.id,ref.id]);assert.deepEqual(fromRef.entityIds,[a.id]);assert.deepEqual(fromRef.outputIds,[a.outputId]);assert.equal(new Set(fromRef.ids).size,fromRef.ids.length);
  assert.deepEqual(affectedBy(p,[group.id]).entityIds,[a.id]);assert.deepEqual(p,before);
  assert.deepEqual(dependencyGraph(p).diagnostics,[]);
  const plan=planGenerationForChanges(p,[ref.id]);assert.equal(plan.updates.length,1);assert.equal(plan.updates[0].sourceEntityId,a.id);
});
test('missing references and cycles are diagnosed without looping or silently ignoring unknown changes',()=>{
  const p=newDocument('bad'),a=createNode('Group'),b=createNode('Group',{parentId:a.id});a.parentId=b.id;p.nodes.push(a,b);a.referenceIds=[crypto.randomUUID()];
  const g=dependencyGraph(p);assert.ok(g.diagnostics.some(i=>i.code==='CYCLIC_DEPENDENCY'));assert.ok(g.diagnostics.some(i=>i.code==='MISSING_DEPENDENCY'));
  assert.equal(affectedBy(p,[a.id]).ids.length,2);assert.ok(affectedBy(p,['unknown']).diagnostics.some(i=>i.code==='UNKNOWN_CHANGED_ID'));
  assert.deepEqual(planGenerationForChanges(p,[a.id]).updates,[]);
});
