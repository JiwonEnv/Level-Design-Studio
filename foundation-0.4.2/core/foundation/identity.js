// Read-only diagnostics. IDs shared by a node and its legacy projection are
// intentional aliases; generated outputs are separate identities.
export function identityIssues(document) {
  const issues = [];
  const report = (code, path, id) => issues.push({code, path, id});
  const nodes = new Map((document.nodes || []).map(node => [node.id, node]));
  const outputs = new Map();
  for (const [index, object] of (document.objects || []).entries()) {
    if (outputs.has(object.id)) report('DUPLICATE_OUTPUT_ID', `objects[${index}].id`, object.id);
    outputs.set(object.id, object);
    if (object.sourceEntityId && nodes.has(object.id)) {
      report('OUTPUT_NODE_ID_COLLISION', `objects[${index}].id`, object.id);
    }
  }
  for (const [index, node] of (document.nodes || []).entries()) {
    for (const [refIndex, id] of (node.referenceIds || []).entries()) {
      if (nodes.get(id)?.type !== 'Reference') {
        report('MISSING_REFERENCE_NODE', `nodes[${index}].referenceIds[${refIndex}]`, id);
      }
    }
  }
  for (const [index, entity] of (document.entities || []).entries()) {
    if (nodes.has(entity.outputId)) {
      report('RESERVED_OUTPUT_NODE_ID_COLLISION', `entities[${index}].outputId`, entity.outputId);
    }
  }
  return issues;
}
