import {readFile,writeFile} from 'node:fs/promises';
const file='core/foundation/document.js';let s=await readFile(file,'utf8');const a=s.indexOf('// The legacy arrays'),b=s.indexOf('export function relative(',a);
s=s.slice(0,a)+`// Ownership: nodes own design/local transforms and independent placements.
// objects with sourceEntityId own generated outputs; Reference payload owns pixels,
// while its node owns the world frame. Legacy arrays are validated projections.
const same=(a,b)=>stable(a)===stable(b);
function stable(value){if(value===undefined)return 'undefined';if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(stable).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';}
const without=(value,keys)=>Object.fromEntries(Object.entries(copy(value)).filter(([key])=>!keys.includes(key)));
export function reconcileLegacy(p,before=null){
 p.nodes??=[];p.extensions??={};
 const sources=[...p.entities.map(value=>({kind:'entity',value,type:value.type,key:'entities'})),...p.objects.filter(o=>!o.sourceEntityId).map(value=>({kind:'object',value,type:'Prop',key:'objects'})),...p.references.map((value,index)=>({kind:'reference',value,type:'Reference',key:'references',index}))];
 const live=new Set(sources.map(s=>s.value.id));
 // A compatibility tool may delete its own projection, but must not erase drafts.
 p.nodes=p.nodes.filter(n=>!n.extensions?.legacyKind||live.has(n.id)||n.extensions.detachedAsset);
 for(const source of sources){const {kind,value:v}=source;let n=p.nodes.find(n=>n.id===v.id);const existing=before?.[source.key]?.find(x=>x.id===v.id);
  if(n&&existing&&same(v,existing))continue;
  if(!n){n=createNode(source.type,{id:v.id,name:v.name||source.type,layerId:v.layerId||source.type,extensions:{legacyKind:kind}});p.nodes.push(n);}
  n.name=v.name||n.name;n.extensions.legacyKind=kind;
  if(kind==='entity'){
   const t=worldTransform(p,n);if(!existing||!same(v.geometry,existing.geometry))n.geometry={...copy(v.geometry),points:v.geometry.points.map(pt=>pointToLocal(t,pt))};
   n.properties=copy(v.parameters);n.referenceIds=copy(v.referenceIds);n.layerId=v.layerId;n.generation={...n.generation,outputIds:[v.outputId]};
   n.assetRefs=v.parameters.assetId?[{assetId:v.parameters.assetId,hash:p.assets[v.parameters.assetId]?.hash}]:[];
   n.extensions.projection=without(v,['id','type','name','layerId','geometry','parameters','referenceIds','outputId']);
  }else if(kind==='object'){
   const wt={position:copy(v.position),rotation:fromEuler(v.rotation),scale:copy(v.scale)},parent=p.nodes.find(x=>x.id===n.parentId);
   n.transform=parent?relative(worldTransform(p,parent),wt):wt;n.locked=!!v.locked;n.modification={...n.modification,ownership:v.ownership||'Independent'};
   n.assetRefs=v.assetId?[{assetId:v.assetId,hash:p.assets[v.assetId]?.hash}]:[];
   n.extensions.projection=without(v,['id','name','position','rotation','scale','locked','assetId','ownership']);delete n.extensions.detachedAsset;
  }else{
   if(!n.properties.referenceData&&n.transform.position.some(x=>x!==0))n.extensions.previousUnappliedTransform=copy(n.transform);
   const wt={position:copy(v.origin||[0,0,0]),rotation:fromEuler([0,0,v.rotation||0]),scale:[1,1,1]},parent=p.nodes.find(x=>x.id===n.parentId);
   n.transform=parent?relative(worldTransform(p,parent),wt):wt;n.properties={referenceId:v.id,referenceData:without(v,['id','origin','rotation','assetId'])};n.extensions.referenceOrder=source.index;
   n.assetRefs=v.assetId?[{assetId:v.assetId,hash:p.assets[v.assetId]?.hash}]:[];
  }
 }
 for(const type of NODE_TYPES)if(!p.layers.some(l=>l.id===type))p.layers.push({id:type,name:type,visible:true,locked:false});
 p.extensions.sceneAuthority=1;projectLegacy(p);return p;
}
export function projectLegacy(p){
 const independent=[],entities=[],references=[];
 for(const n of p.nodes){const t=worldTransform(p,n),kind=n.extensions?.legacyKind;
  if(kind==='entity'&&n.geometry){entities.push({...copy(n.extensions.projection||{}),id:n.id,type:n.type,name:n.name,layerId:n.layerId,geometry:{...copy(n.geometry),points:n.geometry.points.map(pt=>pointToWorld(t,pt))},parameters:copy(n.properties),referenceIds:copy(n.referenceIds),outputId:n.generation.outputIds[0]});}
  if(kind==='object'){
   const data=copy(n.extensions.projection||p.objects.find(o=>o.id===n.id)||{});
   if(data.kind==='asset'&&!n.assetRefs.length){n.extensions.detachedAsset=true;continue;}
   const o={...data,id:n.id,name:n.name,position:t.position,rotation:toEuler(t.rotation),scale:t.scale,locked:n.locked,ownership:n.modification.ownership||'Independent'};
   if(n.assetRefs[0])o.assetId=n.assetRefs[0].assetId;else delete o.assetId;independent.push(o);
  }
  if(kind==='reference'&&n.properties.referenceData&&n.assetRefs[0]){
   if(Math.abs(t.rotation[0])+Math.abs(t.rotation[1])>1e-7||Math.abs(t.scale[0]-t.scale[1])>1e-7)throw Error('Reference 평면은 Z 회전과 동일한 XY 축척을 사용하세요.');
   references.push({...copy(n.properties.referenceData),id:n.id,assetId:n.assetRefs[0].assetId,origin:t.position,rotation:toEuler(t.rotation)[2],widthMeters:n.properties.referenceData.widthMeters*t.scale[0]});
  }
 }
 const generated=p.objects.filter(o=>o.sourceEntityId),byId=new Map([...generated,...independent].map(o=>[o.id,o]));
 const order=[...p.objects.map(o=>o.id),...independent.map(o=>o.id)];p.objects=[...new Set(order)].flatMap(id=>byId.has(id)?[byId.get(id)]:[]);
 p.entities=entities;p.references=references.sort((a,b)=>(p.nodes.find(n=>n.id===a.id).extensions.referenceOrder||0)-(p.nodes.find(n=>n.id===b.id).extensions.referenceOrder||0));
 for(const n of p.nodes.filter(n=>n.extensions?.legacyKind==='entity')){const e=entities.find(e=>e.id===n.id),output=generated.find(o=>o.sourceEntityId===n.id);n.generation.status=output?(output.generation?.sourceSignature===inputSignature(e)?'ready':'dirty'):'none';}
 return p;
}
export function validateProjection(p){if(p.extensions?.sceneAuthority!==1)return;const projected=projectLegacy(copy(p));for(const key of ['entities','objects','references'])if(!same(p[key],projected[key]))throw Error('공통 Scene과 '+key+' 호환 projection 불일치');}
export function normalizeDocument(input){const p=copy(input);if(p.schemaVersion!==3)return upgradeFoundation(p);if(p.extensions?.sceneAuthority!==1){validateDocument(p);reconcileLegacy(p);}validateDocument(p);return p;}
`+s.slice(b);
s=s.replace(' validateScene(p);',' validateProjection(p);\n validateScene(p);');
// A detached model is a Prop draft with the original placement metadata retained.
s=s.replace("else if(c.type==='assets')n.assetRefs=copy(c.value);", "else if(c.type==='assets'){n.assetRefs=copy(c.value);if(n.type==='Prop'&&n.extensions?.legacyKind==='entity'){if(n.assetRefs[0])n.properties.assetId=n.assetRefs[0].assetId;else delete n.properties.assetId;}};");
// Avoid the semicolon between an if chain's clauses.
s=s.replace('delete n.properties.assetId;}};','delete n.properties.assetId;}}');
await writeFile(file,s);
let main=await readFile('src/main.js','utf8');main=main.replace("reconcileLegacy(project);else projectLegacy(project)","reconcileLegacy(project,before);else projectLegacy(project)");
main=main.replace("markOverride(obj);reconcileLegacy(project);", "markOverride(obj);reconcileLegacy(project,commandHistory.drag);");
// Never save a failed drag as a successful edit.
main=main.replace("project=result.document;syncHistory();renderInspector();renderObjects();save();", "project=result.document;syncHistory();if(result.error){notify(result.error.message,true);render();return;}render();save();");
main=main.replace("from '../core/foundation/document.js';","from '../core/foundation/document.js';");await writeFile('src/main.js',main);
let test=await readFile('tests/foundation/stabilization.test.js','utf8');test=test.replace("assert.equal(p.objects.find(o=>o.id===id)?.kind,'placeholder');","assert.equal(p.objects.find(o=>o.id===id),undefined);");await writeFile('tests/foundation/stabilization.test.js',test);
