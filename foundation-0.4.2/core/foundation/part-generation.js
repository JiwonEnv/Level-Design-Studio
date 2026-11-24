import {setProductionPart} from './production-identity.js';

// The review snapshot deliberately includes source identities, pins and scene
// transforms. No hash of renderer state is used as generation authority.
const snapshot=d=>JSON.stringify({nodes:d.nodes,assets:d.assets,extensions:d.extensions});
export function planPartGeneration(d,requests){
  const plan={revision:d.revision,snapshot:snapshot(d),requests:structuredClone(requests),changes:[],conflicts:[]};
  const records=d.extensions?.productionIdentity?.records||[],seen=new Set();
  for(const request of requests){
    const slot=records.find(r=>r.id===request.slotId&&r.kind==='Slot'&&r.state==='active');
    if(!slot||seen.has(request.slotId)){plan.conflicts.push({code:'INVALID_OR_DUPLICATE_SLOT',slotId:request.slotId});continue;}seen.add(request.slotId);
    if(request.assetId&&!d.assets[request.assetId]){plan.conflicts.push({code:'MISSING_ASSET',slotId:request.slotId});continue;}
    if(!request.data||typeof request.data!=='object'||Array.isArray(request.data)){plan.conflicts.push({code:'INVALID_DATA',slotId:request.slotId});continue;}
    const old=records.find(r=>r.kind==='Part'&&r.slotId===slot.id&&r.state==='active');
    for(const key of Object.keys(old?.overrides||{}))if(!Object.hasOwn(request.data,key))plan.conflicts.push({code:'ORPHAN_OVERRIDE',partId:old.id,field:key,slotId:slot.id});
    plan.changes.push({kind:old?'update':'add',slotId:slot.id,partId:old?.id||null,preservedOverrideFields:Object.keys(old?.overrides||{}),before:old?structuredClone(old):null,after:structuredClone(request)});
  }
  return plan;
}
export function applyPartGeneration(d,plan){
  if(plan.revision!==d.revision||plan.snapshot!==snapshot(d))throw Error('부품 미리보기 이후 문서가 변경되었습니다. 다시 미리보기하세요.');
  // Re-evaluate input rather than trusting a modified changes/conflicts array.
  const checked=planPartGeneration(d,plan.requests);if(checked.conflicts.length)throw Error('부품 생성 충돌: '+checked.conflicts.map(c=>c.code).join(', '));
  const next=structuredClone(d),result=[];
  for(const r of checked.requests)result.push(setProductionPart(next,r.slotId,r.assetId,r.data));
  d.extensions=next.extensions;return result;
}
