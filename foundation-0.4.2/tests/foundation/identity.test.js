import test from 'node:test';
import assert from 'node:assert/strict';
import {newDocument, createNode, reconcileLegacy, validateDocument} from '../../core/foundation/document.js';
import {identityIssues} from '../../core/foundation/identity.js';
import {createEntity, rectangle} from '../../core/scene-model.js';
import {planGeneration, applyGeneration} from '../../core/generation.js';
import {CommandHistory} from '../../core/foundation/history.js';

function fixture() {
  const p = newDocument('Identity');
  p.entities.push(createEntity('Building', rectangle([0,0,0], 8,6)));
  reconcileLegacy(p);
  applyGeneration(p, planGeneration(p));
  reconcileLegacy(p);
  return p;
}

test('node/projection aliases and reserved outputs are valid; identity checks never mutate', () => {
  const p = fixture(), before = structuredClone(p);
  assert.equal(p.nodes[0].id, p.entities[0].id);
  assert.equal(validateDocument(p), true);
  assert.deepEqual(identityIssues(p), []);
  assert.deepEqual(p, before);
  p.objects = [];
  reconcileLegacy(p);
  assert.equal(validateDocument(p), true);
});

test('duplicate generated output IDs and reserved design ID collisions identify exact paths', () => {
  const p = fixture();
  p.objects.push(structuredClone(p.objects[0]));
  assert.ok(identityIssues(p).some(i => i.code === 'DUPLICATE_OUTPUT_ID' && i.path === 'objects[1].id'));
  assert.throws(() => validateDocument(p), /DUPLICATE_OUTPUT_ID/);
  const q = fixture();
  q.entities[0].outputId = q.nodes[0].id;
  assert.ok(identityIssues(q).some(i => i.code === 'RESERVED_OUTPUT_NODE_ID_COLLISION'));
});

test('reference must target a Reference node; invalid edit rolls back the entire transaction', () => {
  const p = fixture(), ref = createNode('Reference');
  p.nodes.push(ref);
  p.nodes[0].referenceIds = [ref.id];
  // Draft node links are checked independently from legacy image payloads.
  assert.deepEqual(identityIssues(p), []);
  p.nodes[0].referenceIds = [];
  const history = new CommandHistory(); history.reset(p);
  const before = structuredClone(p);
  const result = history.execute(p, 'bad reference', d => {
    d.nodes[0].referenceIds = [d.nodes[0].id];
  });
  assert.match(result.error.message, /MISSING_REFERENCE_NODE.*nodes\[0\]/);
  assert.deepEqual(result.document, before);
});
