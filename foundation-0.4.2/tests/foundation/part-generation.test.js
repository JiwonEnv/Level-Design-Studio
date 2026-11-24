import test from 'node:test';
import assert from 'node:assert/strict';
import {newDocument,createNode} from '../../core/foundation/document.js';
import {createProductionIdentity as create,ensureProductionSlot as slot,setProductionPart as part,setProductionOverride,effectiveProductionData} from '../../core/foundation/production-identity.js';
import {planPartGeneration,applyPartGeneration} from '../../core/foundation/part-generation.js';
import {CommandHistory} from '../../core/foundation/history.js';
function fixture(){const d=newDocument('Parts'),node=createNode('Building');d.nodes.push(node);const recipe=create(d,'Recipe'),instance=create(d,'Instance',{recipeId:recipe.id,nodeId:node.id}),left=slot(d,instance.id,'wall:left'),right=slot(d,instance.id,'wall:right');return {d,left,right};}
test('part preview/cancel is read-only; selected regeneration preserves manual properties and unrelated parts',()=>{
 const {d,left,right}=fixture(),a=part(d,left.id,undefined,{width:4,material:'stone'}),b=part(d,right.id,undefined,{width:5});setProductionOverride(d,a.id,'material','brick');
 const before=structuredClone(d),plan=planPartGeneration(d,[{slotId:left.id,data:{width:8,material:'concrete'}}]);assert.deepEqual(d,before);assert.deepEqual(plan.changes[0].preservedOverrideFields,['material']);
 const applied=applyPartGeneration(d,plan);assert.equal(applied[0].id,a.id);assert.deepEqual(effectiveProductionData(applied[0]),{width:8,material:'brick'});assert.deepEqual(d.extensions.productionIdentity.records.find(r=>r.id===b.id),b);
});
test('removed override targets, missing slots, duplicate requests and stale plans never partially apply',()=>{
 const {d,left,right}=fixture(),a=part(d,left.id,undefined,{material:'stone'});setProductionOverride(d,a.id,'material','brick');const before=structuredClone(d);
 const plan=planPartGeneration(d,[{slotId:right.id,data:{width:4}},{slotId:left.id,data:{width:8}}]);assert.ok(plan.conflicts.some(c=>c.code==='ORPHAN_OVERRIDE'));assert.throws(()=>applyPartGeneration(d,plan),/ORPHAN_OVERRIDE/);assert.deepEqual(d,before);
 assert.ok(planPartGeneration(d,[{slotId:'missing',data:{}}]).conflicts.length);
 assert.ok(planPartGeneration(d,[{slotId:left.id,data:{}},{slotId:left.id,data:{}}]).conflicts.some(c=>c.code==='INVALID_OR_DUPLICATE_SLOT'));
 const stale=planPartGeneration(d,[{slotId:right.id,data:{width:8}}]);d.nodes[0].name='Changed';assert.throws(()=>applyPartGeneration(d,stale),/変更|변경/);
});
test('a regeneration batch applies as one undoable edit and stale override edits force a new preview',()=>{
 const {d,left,right}=fixture(),history=new CommandHistory();part(d,left.id,undefined,{width:1});part(d,right.id,undefined,{width:2});history.reset(d);
 const before=structuredClone(d),plan=planPartGeneration(d,[{slotId:left.id,data:{width:10}},{slotId:right.id,data:{width:20}}]);
 const applied=history.execute(d,'regenerate two walls',p=>applyPartGeneration(p,plan));assert.ok(!applied.error);assert.equal(history.past.length,1);const after=structuredClone(applied.document);
 const undone=history.undo(applied.document);assert.deepEqual(undone.extensions.productionIdentity,before.extensions.productionIdentity);assert.deepEqual(history.redo(undone).extensions.productionIdentity,after.extensions.productionIdentity);
 const stale=planPartGeneration(after,[{slotId:left.id,data:{width:30}}]);setProductionOverride(after,after.extensions.productionIdentity.records.find(r=>r.kind==='Part').id,'width',7);assert.throws(()=>applyPartGeneration(after,stale),/변경/);
});
