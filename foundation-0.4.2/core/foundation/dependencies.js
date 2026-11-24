// Dependency direction is source -> consumer. Containment alone is not an
// instruction to regenerate meshes; consumers choose their supported outputs.
export function dependencyGraph(d){
  const vertices=new Map(),edges=[],diagnostics=[];
  const add=(id,kind)=>{if(id)vertices.set(id,{id,kind});};
  const edge=(from,to,kind)=>edges.push({from,to,kind});
  for(const id of Object.keys(d.assets||{}))add(id,'Asset');
  for(const n of d.nodes||[])add(n.id,n.type);
  for(const e of d.entities||[])add(e.outputId,'Output');
  for(const o of d.objects||[])if(o.sourceEntityId)add(o.id,'Output');
  const production=d.extensions?.productionIdentity?.records?.filter(r=>r.state==='active')||[];
  for(const r of production)add(r.id,r.kind);
  for(const s of d.extensions?.sockets||[]){add(s.id,'Socket');edge(s.ownerId,s.id,'socket');}
  for(const n of d.nodes||[]){
    if(n.parentId)edge(n.parentId,n.id,'parent');
    for(const id of n.referenceIds||[])edge(id,n.id,'reference');
    for(const a of n.assetRefs||[])edge(a.assetId,n.id,'asset');
  }
  for(const e of d.entities||[])edge(e.id,e.outputId,'generation');
  for(const entity of d.entities||[]){const t=entity.parameters?.terrain;if(!t)continue;const base=entity.id+':terrain-base';add(base,'BaseTerrain');edge(entity.id,base,'base-definition');edge(base,entity.outputId,'resolved-terrain');
    for(const c of t.controlPoints||[]){const id=entity.id+':terrain-control:'+c.id;add(id,'HeightControl');edge(entity.id,id,'height-input');edge(id,base,'base-height');}
    for(const c of t.contours||[]){const id=entity.id+':terrain-contour:'+c.id;add(id,'HeightContour');edge(entity.id,id,'contour-input');edge(id,base,'contour-height');}
    for(const p of t.profiles||[]){const id=entity.id+':terrain-profile:'+p.id;add(id,'HeightProfile');edge(base,id,'base-profile');}
    for(const m of t.modifiers||[]){const id=entity.id+':terrain-modifier:'+m.id;add(id,'TerrainModifier');edge(entity.id+':terrain-profile:'+m.profileId,id,'profile-modifier');if(m.enabled!==false)edge(id,entity.outputId,'resolved-modifier');}
  }
  for(const batch of d.extensions?.referenceAnalysis||[]){
    add(batch.id,'ReferenceAnalysis');edge(batch.sourceReferenceId,batch.id,'analysis-source');edge(batch.maskAssetId,batch.id,'analysis-mask');
    for(const candidate of batch.candidates.filter(c=>c.status!=='rejected')){add(candidate.id,'AnalysisCandidate');edge(batch.id,candidate.id,'candidate');if(candidate.entityId&&d.nodes.some(n=>n.id===candidate.entityId&&n.referenceIds.includes(batch.sourceReferenceId)))edge(candidate.id,candidate.entityId,'approved-design');}
  }
  for(const r of production){
    for(const field of ['recipeId','variantId','nodeId','instanceId','slotId','assetId'])if(r[field])edge(r[field],r.id,field);
  }
  for(const e of edges)for(const key of ['from','to'])if(!vertices.has(e[key]))diagnostics.push({code:'MISSING_DEPENDENCY',id:e[key],edge:e});
  // Kahn traversal is bounded even for corrupted cyclic documents.
  const degree=new Map([...vertices.keys()].map(id=>[id,0])),out=new Map();
  for(const e of edges)if(vertices.has(e.from)&&vertices.has(e.to)){degree.set(e.to,degree.get(e.to)+1);if(!out.has(e.from))out.set(e.from,[]);out.get(e.from).push(e.to);}
  const queue=[...degree].filter(([,n])=>n===0).map(([id])=>id);let visited=0;
  for(let i=0;i<queue.length;i++){visited++;for(const id of out.get(queue[i])||[]){degree.set(id,degree.get(id)-1);if(degree.get(id)===0)queue.push(id);}}
  if(visited!==vertices.size)diagnostics.push({code:'CYCLIC_DEPENDENCY',ids:[...degree].filter(([,n])=>n>0).map(([id])=>id)});
  return {vertices:[...vertices.values()],edges,diagnostics};
}
export function affectedBy(d,changedIds){
  const graph=dependencyGraph(d),known=new Set(graph.vertices.map(n=>n.id)),seen=new Set(),queue=[],diagnostics=[...graph.diagnostics];
  for(const id of new Set(changedIds)){if(!known.has(id)){diagnostics.push({code:'UNKNOWN_CHANGED_ID',id});continue;}seen.add(id);queue.push(id);}
  const out=new Map();for(const edge of graph.edges){if(!out.has(edge.from))out.set(edge.from,[]);out.get(edge.from).push(edge.to);}
  for(let i=0;i<queue.length;i++)for(const id of out.get(queue[i])||[])if(known.has(id)&&!seen.has(id)){seen.add(id);queue.push(id);}
  return {ids:queue,entityIds:(d.entities||[]).filter(e=>seen.has(e.id)||seen.has(e.outputId)).map(e=>e.id),outputIds:graph.vertices.filter(n=>n.kind==='Output'&&seen.has(n.id)).map(n=>n.id),diagnostics};
}
