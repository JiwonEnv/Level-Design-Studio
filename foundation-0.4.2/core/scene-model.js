import {terrainDefinitionIssues} from './foundation/terrain-definition.js';
export const ENTITY_TYPES = ['Terrain','Road','Building','Water','Zone','Prop'];
export const SCHEMA_VERSION = 2;
const id = () => globalThis.crypto.randomUUID();
const validId = value => typeof value==='string' && /^[0-9a-f-]{36}$/.test(value);
const vector = p => Array.isArray(p) && p.length===3 && p.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e12);
export const rectangle = (center,width,depth) => [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>[center[0]+x*width/2,center[1]+y*depth/2,center[2]||0]);
export function createEntity(type,points,extra={}) {
  const defaults={Building:{floors:2,floorHeight:3},Road:{width:6,elevation:0.06},Terrain:{elevation:0},Water:{elevation:0.02,depth:0.3},Zone:{elevation:0.1},Prop:{elevation:0,size:1}};
  return {id:id(),outputId:id(),name:type, type, layerId:type, geometry:{type:type==='Road'?'polyline':type==='Prop'?'point':'polygon',points:structuredClone(points),vertexIds:points.map(()=>id())},parameters:{...defaults[type]},referenceIds:[],...extra};
}
export function upgradeProject(input) {
  const p=structuredClone(input);
  if(p.schemaVersion===2)return p;
  if(p.schemaVersion!==1)throw Error('지원하지 않는 프로젝트 버전입니다. 원본을 보존합니다.');
  p.schemaVersion=2;p.sceneVersion=1;p.entities=[];p.layers=ENTITY_TYPES.map(type=>({id:type,name:type,visible:true,locked:false}));
  p.migration={fromVersion:1,policy:'preserve-original-on-first-save'};
  for(const ref of p.references||[]){ref.origin??=[0,0,0];ref.rotation??=0;if(!ref.sourceSize){ref.sourceSize=[1,1];ref.sourceSizeInferred=true;}}
  for(const fp of p.footprints||[]){
    const recipe=p.recipes?.find(r=>r.footprintId===fp.id);
    const result=recipe&&p.objects?.find(o=>o.recipeId===recipe.id);
    const entity=createEntity('Building',rectangle(fp.position,fp.width,fp.depth),{id:fp.id,name:fp.name||'Building',legacyFootprintId:fp.id,...(result?{outputId:result.id}:{}),parameters:{floors:recipe?.floors||2,floorHeight:recipe?.floorHeight||3}});
    p.entities.push(entity);
    if(result){result.sourceEntityId=entity.id;const edited=result.position.some((n,i)=>n!==fp.position[i])||result.rotation.some(n=>n!==0)||result.scale.some(n=>n!==1);result.ownership??=edited?'User Override':'Generated';result.generation={generator:'legacy-box',version:1,legacyBasePosition:[...fp.position]};}
  }
  for(const obj of p.objects||[])obj.ownership??='Independent';
  return p;
}
export function newSceneFields(){return {schemaVersion:2,sceneVersion:1,entities:[],layers:ENTITY_TYPES.map(type=>({id:type,name:type,visible:true,locked:false}))};}
export function inputSignature(entity){return JSON.stringify({type:entity.type,geometry:entity.geometry,parameters:entity.parameters});}
export function entityIssues(entity){
  const out=[],g=entity.geometry,points=g?.points;
  if(!ENTITY_TYPES.includes(entity.type))out.push('알 수 없는 객체 유형');
  if(!Array.isArray(points)||points.some(p=>!vector(p)))return [...out,'올바르지 않은 좌표'];
  const minimum=entity.type==='Prop'?1:entity.type==='Road'?2:3;
  if(points.length<minimum||points.length>2000)out.push(`정점은 ${minimum}~2000개 필요`);
  const expected=entity.type==='Road'?'polyline':entity.type==='Prop'?'point':'polygon';
  if(g.type!==expected)out.push('객체와 도형 유형 불일치');
  if(!Array.isArray(g.vertexIds)||g.vertexIds.length!==points.length||g.vertexIds.some(v=>!validId(v))||new Set(g.vertexIds).size!==points.length)out.push('정점 ID 누락 또는 중복');
  for(let i=1;i<points.length;i++)if(Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1])<1e-6)out.push('중복 또는 너무 짧은 구간');
  if(expected==='polygon'&&points.length>=3){
    if(['Building','Water'].includes(entity.type)&&points.some(p=>Math.abs(p[2]-points[0][2])>1e-6))out.push('건물 외곽과 수면은 동일한 기준 높이가 필요');
    const origin=points[0];
    const area=points.reduce((a,p,i)=>{const q=points[(i+1)%points.length];return a+(p[0]-origin[0])*(q[1]-origin[1])-(q[0]-origin[0])*(p[1]-origin[1]);},0)/2;
    if(Math.abs(area)<1e-6)out.push('면적이 없는 폴리곤');
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const intersects=(a,b,c,d)=>{
      const x=cross(a,b,c),y=cross(a,b,d),u=cross(c,d,a),v=cross(c,d,b),eps=1e-8;
      const on=(p,q,r)=>Math.abs(cross(p,q,r))<eps&&r[0]>=Math.min(p[0],q[0])-eps&&r[0]<=Math.max(p[0],q[0])+eps&&r[1]>=Math.min(p[1],q[1])-eps&&r[1]<=Math.max(p[1],q[1])+eps;
      return (x*y<0&&u*v<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
    };
    for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)if(j!==i+1&&!(i===0&&j===points.length-1)&&intersects(points[i],points[(i+1)%points.length],points[j],points[(j+1)%points.length]))out.push('자기 교차 경계');
  }
  const params=entity.parameters||{};
  if(Object.values(params).some(v=>typeof v==='number'&&(!Number.isFinite(v)||Math.abs(v)>1e7)))out.push('속성 수치 오류');
  if(entity.type==='Road'&&!(params.width>0&&params.width<=1000))out.push('도로 폭은 0 초과 1000m 이하');
  if(entity.type==='Building'&&(!Number.isInteger(params.floors)||params.floors<1||params.floors>100||!(params.floorHeight>0&&params.floorHeight<=100)))out.push('층수·층고 범위 오류');
  if(entity.type==='Prop'&&!(params.size>0&&params.size<=1000))out.push('프랍 크기 범위 오류');
  if(entity.type==='Water'&&!(params.depth>0&&params.depth<=1000))out.push('수역 깊이 범위 오류');
  out.push(...terrainDefinitionIssues(entity));
  return [...new Set(out)];
}
export function validateScene(p){
  if(!Array.isArray(p.entities)||p.entities.length>10000||!Array.isArray(p.layers))throw Error('공통 Scene 형식 오류');
  const entityIds=new Set(),outputIds=new Set(),refs=new Set(p.references.map(r=>r.id)),layers=new Set(p.layers.map(l=>l.id));
  if(p.references.some(r=>!validId(r.id))||refs.size!==p.references.length)throw Error('참조 이미지 ID 오류');
  for(const entity of p.entities){
    if(!validId(entity.id)||entityIds.has(entity.id)||!validId(entity.outputId)||outputIds.has(entity.outputId))throw Error('객체 ID 또는 출력 ID 중복');
    entityIds.add(entity.id);outputIds.add(entity.outputId);
    const errors=entityIssues(entity);if(errors.length)throw Error(`${entity.name||entity.id}: ${errors.join(', ')}`);
    if(!layers.has(entity.layerId))throw Error(`${entity.name}: 레이어 누락`);
    if(!Array.isArray(entity.referenceIds)||entity.referenceIds.some(r=>!refs.has(r)))throw Error(`${entity.name}: 참조 이미지 누락`);
    if(entity.parameters.assetId&&!p.assets[entity.parameters.assetId])throw Error(`${entity.name}: 에셋 누락`);
  }
  for(const object of p.objects){
    if(object.sourceEntityId&&!entityIds.has(object.sourceEntityId))throw Error('생성 결과의 원본 객체 누락');
    if(object.sourceEntityId&&p.entities.find(e=>e.id===object.sourceEntityId).outputId!==object.id)throw Error('생성 결과 ID 대응 오류');
    if(object.recipeId&&!p.recipes.some(r=>r.id===object.recipeId))throw Error('생성 결과의 Recipe 누락');
    if(!['Generated','User Override','Independent'].includes(object.ownership))throw Error('편집 소유권 오류');
  }
  for(const recipe of p.recipes)if(!p.footprints.some(f=>f.id===recipe.footprintId))throw Error('Recipe 외곽선 참조 누락');
  if(new Set(p.recipes.map(r=>r.id)).size!==p.recipes.length)throw Error('Recipe ID 중복');
}
export function markOverride(object){
  if(!object.sourceEntityId)return;
  object.ownership='User Override';object.overrides={...object.overrides,position:[...object.position],rotation:[...object.rotation],scale:[...object.scale]};
}
export function referenceToWorld(ref,pixel){
  const scale=ref.widthMeters/ref.sourceSize[0],angle=(ref.rotation||0)*Math.PI/180,x=pixel[0]*scale,y=(ref.sourceSize[1]-pixel[1])*scale;
  return [ref.origin[0]+x*Math.cos(angle)-y*Math.sin(angle),ref.origin[1]+x*Math.sin(angle)+y*Math.cos(angle),ref.origin[2]||0];
}
export function worldToReference(ref,point){
  const x=point[0]-ref.origin[0],y=point[1]-ref.origin[1],a=-(ref.rotation||0)*Math.PI/180,s=ref.widthMeters/ref.sourceSize[0];
  return [(x*Math.cos(a)-y*Math.sin(a))/s,ref.sourceSize[1]-(x*Math.sin(a)+y*Math.cos(a))/s];
}
export function dependencyEdges(p){return p.entities.flatMap(e=>[...e.referenceIds.map(id=>({from:id,to:e.id,type:'reference'})),{from:e.id,to:e.outputId,type:'generation'},...(e.parameters.assetId?[{from:e.parameters.assetId,to:e.id,type:'asset'}]:[])]);}
