// Optional schema-3 extension: old documents remain byte-for-byte unchanged
// until a production identity is explicitly created.
const KEY='productionIdentity';
const kinds=['Recipe','Variant','Instance','Slot','Part'];
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const catalog=d=>d.extensions?.[KEY];
const records=d=>catalog(d)?.records||[];
const fail=message=>{throw Error('제작 ID 계약 오류: '+message);};

export function productionIdentityIssues(d){
  const c=catalog(d);if(c===undefined)return [];
  if(c?.version!==1||!Array.isArray(c.records))return [{code:'CATALOG_FORMAT',path:'extensions.'+KEY}];
  const issues=[],byId=new Map(),reserved=new Set([d.id,...(d.nodes||[]).map(n=>n.id),...(d.objects||[]).map(o=>o.id),...(d.entities||[]).map(e=>e.outputId),...Object.keys(d.assets||{}),...(d.recipes||[]).map(r=>r.id)]);
  const report=(code,index)=>issues.push({code,path:`extensions.${KEY}.records[${index}]`});
  c.records.forEach((r,i)=>{
    if(!r||!uuid(r.id)||!kinds.includes(r.kind)||!['active','retired'].includes(r.state)||!r.data||typeof r.data!=='object'||Array.isArray(r.data)){report('RECORD_FORMAT',i);return;}
    if(r.overrides!==undefined&&(!r.overrides||typeof r.overrides!=='object'||Array.isArray(r.overrides)))report('OVERRIDE_FORMAT',i);
    if(byId.has(r.id)||reserved.has(r.id))report('IDENTITY_COLLISION',i);
    byId.set(r.id,r);
  });
  c.records.forEach((r,i)=>{
    if(!r||!kinds.includes(r.kind))return;
    const target=(field,kind)=>{const t=byId.get(r[field]);if(!t||t.kind!==kind||(r.state==='active'&&t.state!=='active'))report('INVALID_'+field.toUpperCase(),i);return t;};
    if(r.kind==='Variant')target('recipeId','Recipe');
    if(r.kind==='Instance'){
      const recipe=target('recipeId','Recipe');
      if(r.variantId){const variant=target('variantId','Variant');if(variant?.recipeId!==recipe?.id)report('VARIANT_RECIPE_MISMATCH',i);}
      if(r.state==='active'&&!(d.nodes||[]).some(n=>n.id===r.nodeId))report('MISSING_INSTANCE_NODE',i);
    }
    if(r.kind==='Slot'){
      target('instanceId','Instance');
      if(typeof r.semanticKey!=='string'||!r.semanticKey.trim())report('INVALID_SLOT_KEY',i);
      if(c.records.some((s,j)=>j<i&&s?.kind==='Slot'&&s.instanceId===r.instanceId&&s.semanticKey===r.semanticKey))report('DUPLICATE_SLOT_KEY',i);
    }
    if(r.kind==='Part'){
      target('slotId','Slot');
      if(c.records.some((s,j)=>j<i&&s?.kind==='Part'&&s.state==='active'&&r.state==='active'&&s.slotId===r.slotId))report('DUPLICATE_SLOT_PART',i);
      if(r.state==='active'&&r.assetId&&!d.assets?.[r.assetId])report('MISSING_PART_ASSET',i);
    }
  });
  return issues;
}

// Copy/validate/commit makes a failed operation atomic even outside UI history.
function transact(d,operation){
  const next=structuredClone(d);next.extensions??={};next.extensions[KEY]??={version:1,records:[]};
  const result=operation(next.extensions[KEY].records);
  const issues=productionIdentityIssues(next);if(issues.length)fail(issues.map(i=>i.code+' '+i.path).join('; '));
  d.extensions=next.extensions;return structuredClone(result);
}
export function createProductionIdentity(d,kind,fields={}){
  if(!kinds.includes(kind))fail('알 수 없는 종류');
  return transact(d,list=>{const record={...structuredClone(fields),id:crypto.randomUUID(),kind,state:'active',data:structuredClone(fields.data||{})};list.push(record);return record;});
}
export function updateProductionData(d,id,data){
  return transact(d,list=>{const r=list.find(r=>r.id===id&&r.state==='active');if(!r)fail('활성 ID를 찾을 수 없습니다.');r.data=structuredClone(data);return r;});
}
export function retireProductionIdentity(d,id){
  return transact(d,list=>{const r=list.find(r=>r.id===id);if(!r)fail('ID를 찾을 수 없습니다.');r.state='retired';return r;});
}
export function ensureProductionSlot(d,instanceId,semanticKey){
  const old=records(d).find(r=>r.kind==='Slot'&&r.instanceId===instanceId&&r.semanticKey===semanticKey);
  if(old){if(old.state!=='active')fail('폐기한 슬롯은 자동 재사용하지 않습니다.');return structuredClone(old);}
  return createProductionIdentity(d,'Slot',{instanceId,semanticKey});
}
// Replacing a part's source asset changes content, never its stable identity.
export function setProductionPart(d,slotId,assetId,data={}){
  const old=records(d).find(r=>r.kind==='Part'&&r.slotId===slotId&&r.state==='active');
  if(!old)return createProductionIdentity(d,'Part',{slotId,assetId,data});
  return transact(d,list=>{const part=list.find(r=>r.id===old.id);part.assetId=assetId;part.data=structuredClone(data);return part;});
}
export function setProductionOverride(d,id,field,value){
  if(typeof field!=='string'||!field.trim()||['__proto__','prototype','constructor'].includes(field))fail('올바른 속성 이름이 필요합니다.');
  return transact(d,list=>{const r=list.find(r=>r.id===id&&r.state==='active');if(!r)fail('활성 ID를 찾을 수 없습니다.');r.overrides={...r.overrides,[field]:structuredClone(value)};return r;});
}
export function clearProductionOverride(d,id,field){
  return transact(d,list=>{const r=list.find(r=>r.id===id&&r.state==='active');if(!r)fail('활성 ID를 찾을 수 없습니다.');delete r.overrides?.[field];return r;});
}
export function effectiveProductionData(record){return {...structuredClone(record.data),...structuredClone(record.overrides||{})};}
