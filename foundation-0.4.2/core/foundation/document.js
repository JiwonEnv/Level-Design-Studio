import {upgradeProject, validateScene, inputSignature, entityIssues} from '../scene-model.js';
import {identityIssues} from './identity.js';
import {productionIdentityIssues} from './production-identity.js';
import {socketIssues} from './sockets.js';
import {analysisCandidateIssues} from './analysis-candidates.js';

export const NODE_TYPES=['Terrain','Road','Building','Water','Zone','Prop','Reference','Group'];
export const ASSET_KINDS=['Model','Material','Texture','TrimSheet','Decal','Mask','ModularKit','Recipe','Rule'];
const copy=x=>structuredClone(x), uuid=()=>crypto.randomUUID();
export const identity=()=>({position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]});
const add=(a,b)=>a.map((v,i)=>v+b[i]), mul=(a,b)=>a.map((v,i)=>v*b[i]);
export function qmul(a,b){const [x,y,z,w]=a,[X,Y,Z,W]=b;return [w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z];}
export const qinv=q=>[-q[0],-q[1],-q[2],q[3]];
export function rotate(v,q){return qmul(qmul(q,[...v,0]),qinv(q)).slice(0,3);}
export function fromEuler(v){const [x,y,z]=v.map(n=>n*Math.PI/360),a=Math.cos(x),b=Math.cos(y),c=Math.cos(z),s=Math.sin(x),t=Math.sin(y),u=Math.sin(z);return [s*b*c+a*t*u,a*t*c-s*b*u,a*b*u+s*t*c,a*b*c-s*t*u];}
export function toEuler(q){const [x,y,z,w]=q,m13=2*(x*z+w*y),m23=2*(y*z-w*x),m33=1-2*(x*x+y*y),m12=2*(x*y-w*z),m11=1-2*(y*y+z*z);const singular=Math.abs(m13)>=0.9999999;return [singular?Math.atan2(2*(y*z+w*x),1-2*(x*x+z*z)):Math.atan2(-m23,m33),Math.asin(Math.max(-1,Math.min(1,m13))),singular?0:Math.atan2(-m12,m11)].map(n=>n*180/Math.PI);}
function basisLengths(scale,rotation){const basis=[[1,0,0],[0,1,0],[0,0,1]].map(v=>mul(rotate(v,rotation),scale));for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)if(Math.abs(basis[i].reduce((sum,v,k)=>sum+v*basis[j][k],0))>1e-8*Math.hypot(...basis[i])*Math.hypot(...basis[j]))throw Error('비균일 축척과 이 회전의 조합은 기울어진 축을 만듭니다. 균일 축척 Group을 사용하세요.');return basis.map(v=>Math.hypot(...v));}
export function compose(a,b){return {position:add(a.position,rotate(mul(b.position,a.scale),a.rotation)),rotation:qmul(a.rotation,b.rotation),scale:mul(basisLengths(a.scale,b.rotation),b.scale)};}
export const pointToWorld=(t,p)=>add(t.position,rotate(mul(p,t.scale),t.rotation));
export const pointToLocal=(t,p)=>rotate(p.map((v,i)=>v-t.position[i]),qinv(t.rotation)).map((v,i)=>v/t.scale[i]);
export function worldTransform(p,node,seen=new Set()){if(seen.has(node.id))throw Error('순환 계층');seen.add(node.id);const parent=p.nodes.find(n=>n.id===node.parentId);return parent?compose(worldTransform(p,parent,seen),node.transform):copy(node.transform);}
export function effective(p,node,key){const layer=p.layers.find(l=>l.id===node.layerId);const value=key==='visible'?node.visible!==false&&layer?.visible!==false:!!node.locked||!!layer?.locked;const parent=p.nodes.find(n=>n.id===node.parentId);return parent?(key==='visible'?value&&effective(p,parent,key):value||effective(p,parent,key)):value;}
export function createNode(type,extra={}){if(!NODE_TYPES.includes(type))throw Error('지원하지 않는 객체 유형');return {id:uuid(),type,name:type,transform:identity(),parentId:null,layerId:type,visible:true,locked:false,properties:{},assetRefs:[],referenceIds:[],generation:{status:'none',outputIds:[]},modification:{ownership:'Independent',patches:[]},extensions:{},...extra};}

// Ownership: nodes own design/local transforms and independent placements.
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
  if(n&&existing&&same(v,existing)){if(kind==='reference')n.extensions.referenceOrder=source.index;continue;}
  if(!n){n=createNode(source.type,{id:v.id,name:v.name||(kind==='reference'?p.assets[v.assetId]?.name:null)||source.type,layerId:v.layerId||source.type,extensions:{legacyKind:kind}});p.nodes.push(n);}
  n.name=v.name||n.name;n.extensions.legacyKind=kind;
  if(kind==='entity'){
   const t=worldTransform(p,n);if(!existing||!same(v.geometry,existing.geometry))n.geometry={...copy(v.geometry),points:v.geometry.points.map(pt=>pointToLocal(t,pt))};
   n.properties=n.type==='Prop'?without(v.parameters,['assetId']):copy(v.parameters);n.referenceIds=copy(v.referenceIds);n.layerId=v.layerId;n.generation={...n.generation,outputIds:[v.outputId]};
   n.assetRefs=v.parameters.assetId?[{assetId:v.parameters.assetId,hash:p.assets[v.parameters.assetId]?.hash}]:[];
   n.extensions.projection=without(v,['id','type','name','layerId','geometry','parameters','referenceIds','outputId']);
  }else if(kind==='object'){
   const wt={position:copy(v.position),rotation:fromEuler(v.rotation),scale:copy(v.scale)},parent=p.nodes.find(x=>x.id===n.parentId);
   n.transform=parent?relative(worldTransform(p,parent),wt):wt;n.locked=!!v.locked;n.modification={...n.modification,ownership:v.ownership||'Independent'};
   n.assetRefs=v.assetId?[{assetId:v.assetId,hash:p.assets[v.assetId]?.hash}]:[];
   n.extensions.projection=without(v,['id','name','position','rotation','scale','locked','assetId','ownership']);delete n.extensions.detachedAsset;
  }else{
   if(!n.properties.referenceData&&n.transform.position.some(x=>x!==0))n.extensions.previousUnappliedTransform=copy(n.transform);
   const baseWidth=n.properties.referenceData?.widthMeters||v.widthMeters;const frameChanged=!existing||!same(v.origin,existing.origin)||v.rotation!==existing.rotation||v.widthMeters!==existing.widthMeters;if(frameChanged){const scale=v.widthMeters/baseWidth,wt={position:copy(v.origin||[0,0,0]),rotation:fromEuler([0,0,v.rotation||0]),scale:[scale,scale,scale]},parent=p.nodes.find(x=>x.id===n.parentId);n.transform=parent?relative(worldTransform(p,parent),wt):wt;}n.properties={referenceId:v.id,referenceData:{...without(v,['id','origin','rotation','assetId']),widthMeters:baseWidth}};n.extensions.referenceOrder=source.index;
   n.assetRefs=v.assetId?[{assetId:v.assetId,hash:p.assets[v.assetId]?.hash}]:[];
   if(v.derived?.sourceReferenceId)n.referenceIds=[...new Set([...n.referenceIds,v.derived.sourceReferenceId])];
  }
 }
 for(const type of NODE_TYPES)if(!p.layers.some(l=>l.id===type))p.layers.push({id:type,name:type,visible:true,locked:false});
 p.extensions.sceneAuthority=1;projectLegacy(p);return p;
}
export function projectLegacy(p){
 const independent=[],entities=[],references=[];
 for(const n of p.nodes){const t=worldTransform(p,n),kind=n.extensions?.legacyKind;
  if(kind==='entity'&&n.geometry){const parameters=copy(n.properties);if(n.type==='Prop'){if(n.assetRefs[0])parameters.assetId=n.assetRefs[0].assetId;else delete parameters.assetId;}entities.push({...copy(n.extensions.projection||{}),id:n.id,type:n.type,name:n.name,layerId:n.layerId,geometry:{...copy(n.geometry),points:n.geometry.points.map(pt=>pointToWorld(t,pt))},parameters,referenceIds:copy(n.referenceIds),outputId:n.generation.outputIds[0]});}
  if(kind==='object'){
   const data=copy(n.extensions.projection||p.objects.find(o=>o.id===n.id)||{});
   if(data.kind==='asset'&&!n.assetRefs.length){n.extensions.detachedAsset=true;continue;}
   delete n.extensions.detachedAsset;const o={...data,id:n.id,name:n.name,position:t.position,rotation:toEuler(t.rotation),scale:t.scale,locked:n.locked,ownership:n.modification.ownership||'Independent'};
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
export function relative(parent,world){const rotation=qmul(qinv(parent.rotation),world.rotation),lengths=basisLengths(parent.scale,rotation);return {position:pointToLocal(parent,world.position),rotation,scale:world.scale.map((v,i)=>v/lengths[i])};}
export function upgradeFoundation(input){
 if(input.schemaVersion===3){validateDocument(input);return copy(input);}
 const p=upgradeProject(input);validateScene(p);p.schemaVersion=3;p.createdAt??=new Date().toISOString();p.updatedAt??=p.createdAt;p.metadata??={description:'',tags:[]};p.coordinateSystem={...p.coordinateSystem,origin:[0,0,0],originMode:'auto',frameVersion:1};p.nodes=[];p.sync={project:{state:'unconfigured'},shared:{state:'unconfigured'}};p.extensions??={};return reconcileLegacy(p);
}
export function newDocument(name){return upgradeFoundation({schemaVersion:2,id:uuid(),name,revision:0,coordinateSystem:{unit:'meter',up:'Z',handedness:'right'},assets:{},entities:[],objects:[],references:[],footprints:[],recipes:[],layers:NODE_TYPES.map(type=>({id:type,name:type,visible:true,locked:false}))});}
const finite=(a,len)=>Array.isArray(a)&&a.length===len&&a.every(Number.isFinite);
export function validateDocument(p){
 if(p.schemaVersion!==3||!Array.isArray(p.nodes)||p.nodes.length>10000||!Array.isArray(p.layers))throw Error('Foundation 문서 형식 오류');
 if(!/^[0-9a-f-]{36}$/.test(p.id)||!Number.isInteger(p.revision)||p.revision<0)throw Error('프로젝트 ID 또는 revision 오류');
 if(typeof p.name!=='string'||!p.name.trim()||p.name.length>100)throw Error('프로젝트 이름은 1~100자로 입력하세요.');
 if(!p.assets||typeof p.assets!=='object'||Array.isArray(p.assets))throw Error('에셋 목록 형식 오류');
 for(const [id,a]of Object.entries(p.assets))if(!/^[0-9a-f-]{36}$/.test(id)||!a||a.id!==id||!/^[0-9a-f]{64}$/.test(a.hash))throw Error('에셋 식별 또는 고정 파일 해시 오류');
 for(const n of p.nodes){if(!n.properties||typeof n.properties!=='object'||Array.isArray(n.properties)||!Array.isArray(n.assetRefs)||!Array.isArray(n.referenceIds)||!n.generation||!n.modification)throw Error('공통 객체 필수 필드 오류');}
 for(const r of p.references||[])if(!p.assets[r.assetId]||!Number.isFinite(r.widthMeters)||r.widthMeters<=0||!finite(r.origin,3)||!Number.isFinite(r.rotation)||r.sourceSize&&(!Array.isArray(r.sourceSize)||r.sourceSize.length!==2||r.sourceSize.some(n=>!Number.isFinite(n)||n<=0)))throw Error('Reference 좌표·축척·파일 연결 오류');
 if(p.coordinateSystem.unit!=='meter'||p.coordinateSystem.up!=='Z'||p.coordinateSystem.handedness!=='right'||!finite(p.coordinateSystem.origin,3))throw Error('지원하지 않는 좌표계');
 const ids=new Set();for(const n of p.nodes){if(!/^[0-9a-f-]{36}$/.test(n.id)||ids.has(n.id)||!NODE_TYPES.includes(n.type))throw Error('객체 ID/유형 오류');ids.add(n.id);const t=n.transform;if(!t||!finite(t.position,3)||!finite(t.rotation,4)||!finite(t.scale,3)||t.scale.some(v=>v<=0)||Math.abs(Math.hypot(...t.rotation)-1)>1e-6)throw Error('객체 Transform 오류');if(!p.layers.some(l=>l.id===n.layerId))throw Error('레이어 누락');for(const r of n.assetRefs||[])if(!p.assets[r.assetId]||p.assets[r.assetId].hash!==r.hash)throw Error('에셋 참조 누락 또는 고정 해시 불일치');}
 for(const n of p.nodes){if(n.parentId&&!p.nodes.some(g=>g.id===n.parentId&&g.type==='Group'))throw Error('부모 Group 누락');worldTransform(p,n);}
 const identityErrors=[...identityIssues(p),...productionIdentityIssues(p),...socketIssues(p)];if(identityErrors.length)throw Error('ID 참조 무결성 오류: '+identityErrors.map(issue=>`${issue.code} ${issue.path} (${issue.id||''})`).join('; '));
 const analysisErrors=analysisCandidateIssues(p);if(analysisErrors.length)throw Error(analysisErrors.join('; '));
 validateProjection(p);
 validateScene(p);
 for(const o of p.objects){if(!finite(o.position,3)||!finite(o.rotation,3)||!finite(o.scale,3)||o.scale.some(v=>v<=0))throw Error('출력 Transform 오류');if(o.assetId&&!p.assets[o.assetId])throw Error('출력 에셋 누락');if(o.kind==='generated'&&entityIssues({type:o.entityType,geometry:o.geometry,parameters:o.parameters}).length)throw Error('생성 출력 기하 오류');}
 return true;
}
export function rebaseOrigin(p,origin){if(!finite(origin,3))throw Error('올바른 원점이 필요합니다.');const old=p.coordinateSystem.origin,delta=old.map((v,i)=>v-origin[i]);for(const n of p.nodes)if(!n.parentId)n.transform.position=add(n.transform.position,delta);for(const r of p.references)r.origin=add(r.origin||[0,0,0],delta);for(const o of p.objects.filter(o=>o.sourceEntityId)){o.position=add(o.position,delta);if(o.anchor)o.anchor=add(o.anchor,delta);if(o.geometry)o.geometry.points=o.geometry.points.map(pt=>add(pt,delta));if(o.overrides?.position)o.overrides.position=add(o.overrides.position,delta);}p.coordinateSystem.origin=[...origin];p.coordinateSystem.originMode='user';p.coordinateSystem.frameVersion++;projectLegacy(p);}

export function applyNodeCommand(p,c){
 const n=p.nodes.find(n=>n.id===c.id);if(c.type!=='create'&&!n)throw Error('객체를 찾을 수 없습니다.');
 if(n&&c.type!=='unlock'&&effective(p,n,'locked'))throw Error('잠긴 객체 또는 레이어입니다.');
 if(c.type==='create')p.nodes.push(createNode(c.nodeType,c.extra));
 else if(c.type==='delete'){const removed=new Set([n.id]);let count;do{count=removed.size;for(const child of p.nodes)if(removed.has(child.parentId))removed.add(child.id);}while(count!==removed.size);if(p.nodes.some(child=>removed.has(child.id)&&child.id!==n.id&&effective(p,child,'locked')))throw Error('잠긴 하위 객체가 있습니다. 먼저 잠금을 해제하세요.');p.nodes=p.nodes.filter(a=>!removed.has(a.id));const detached=p.objects.filter(o=>removed.has(o.sourceEntityId));for(const o of detached){delete o.sourceEntityId;delete o.recipeId;o.ownership='Independent';}p.entities=p.entities.filter(e=>!removed.has(e.id));p.objects=p.objects.filter(o=>!removed.has(o.id));p.references=p.references.filter(r=>!removed.has(r.id));for(const e of p.entities)e.referenceIds=e.referenceIds.filter(id=>!removed.has(id));for(const node of p.nodes)node.referenceIds=node.referenceIds.filter(id=>!removed.has(id));reconcileLegacy(p);}
 else if(c.type==='rename'){if(!String(c.value).trim())throw Error('객체 이름이 필요합니다.');n.name=String(c.value).slice(0,100);}
 else if(c.type==='transform'){n.transform=copy(c.value);n.modification={...n.modification,ownership:'User Override',patches:[...(n.modification.patches||[]),{path:'transform',value:copy(c.value),baseRevision:p.revision}]};}
 else if(c.type==='property'){if(n.type==='Prop'&&n.extensions?.legacyKind==='entity'&&Object.hasOwn(c.value,'assetId'))throw Error('모델은 에셋 연결 선택으로 지정하세요.');n.properties=copy(c.value);}
 else if(c.type==='parent'){const wt=worldTransform(p,n);n.parentId=c.value||null;const parent=p.nodes.find(a=>a.id===n.parentId);n.transform=parent?relative(worldTransform(p,parent),wt):wt;}
 else if(c.type==='assets'){n.assetRefs=copy(c.value);if(n.type==='Prop'&&n.extensions?.legacyKind==='entity'){delete n.properties.assetId;}}
 else if(c.type==='visible')n.visible=!!c.value;
 else if(c.type==='unlock')n.locked=!!c.value;
 else if(c.type==='layer')n.layerId=c.value;
 else throw Error('지원하지 않는 명령');
 projectLegacy(p);validateDocument(p);
}
