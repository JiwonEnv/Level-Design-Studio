import test from 'node:test';
import assert from 'node:assert/strict';
import {newDocument} from '../../core/foundation/document.js';
import {createEntity,rectangle} from '../../core/scene-model.js';
import {designMetrics,inspectDesign} from '../../core/foundation/design-inspection.js';
test('design measurements use local metres, stable area at large origins and actual Z grade',()=>{
 const e=createEntity('Building',rectangle([1e9,-1e9,7],8,6));const m=designMetrics(e);assert.equal(m.area,48);assert.equal(m.length,28);assert.equal(m.width,8);assert.equal(m.depth,6);assert.equal(m.minZ,7);assert.equal(m.buildingHeight,6);const road=createEntity('Road',[[0,0,0],[3,4,1]]);assert.equal(designMetrics(road).length,5);assert.equal(designMetrics(road).maxGrade,.2);
});
test('footprint warnings detect crossing/containment/identical polygons but allow shared boundaries and preserve the document',()=>{
 const d=newDocument('Check');const a=createEntity('Building',rectangle([0,0,0],8,6)),b=createEntity('Building',rectangle([8,0,0],8,6));d.entities=[a,b];assert.equal(inspectDesign(d).issues.length,0);b.geometry.points=rectangle([4,0,0],8,6);assert.equal(inspectDesign(d).issues[0].code,'FOOTPRINT_OVERLAP');b.geometry.points=rectangle([0,0,0],2,2);assert.equal(inspectDesign(d).issues[0].code,'FOOTPRINT_OVERLAP');b.geometry.points=structuredClone(a.geometry.points);const before=structuredClone(d);assert.equal(inspectDesign(d).issues[0].code,'FOOTPRINT_OVERLAP');assert.deepEqual(d,before);
});
test('unconfirmed scale, outdated output and bounded incomplete checks are explicit',()=>{
 const d=newDocument('Limit'),ref={id:crypto.randomUUID(),assetId:crypto.randomUUID(),widthMeters:100};d.references.push(ref);d.entities=[createEntity('Building',rectangle([0,0,0],8,6),{referenceIds:[ref.id]}),createEntity('Building',rectangle([0,0,0],8,6))];d.objects.push({sourceEntityId:d.entities[0].id,generation:{sourceSignature:'old'}});const inspected=inspectDesign(d,{maxEdges:0});assert.equal(inspected.limited,true);assert.ok(inspected.issues.some(i=>i.code==='UNCONFIRMED_SCALE'&&i.referenceId===ref.id));assert.ok(inspected.issues.some(i=>i.code==='STALE_OUTPUT'));assert.ok(inspected.issues.some(i=>i.code==='INSPECTION_LIMIT'));
});
