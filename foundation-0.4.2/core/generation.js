import {effective,worldTransform,pointToWorld} from './foundation/document.js';
import { entityIssues, inputSignature } from './scene-model.js';
import {affectedBy} from './foundation/dependencies.js';
import {referenceScaleIssues} from './foundation/references.js';
import {resolveTerrain,TERRAIN_ALGORITHM} from './foundation/terrain-pipeline.js';

export const GENERATOR_VERSION='level-basic-1';
export function generationInputSignature(project,entity){const node=project.nodes?.find(n=>n.id===entity.id);return entity.parameters.terrain&&node?JSON.stringify({source:inputSignature(entity),algorithm:TERRAIN_ALGORITHM,geometry:node.geometry,frame:worldTransform(project,node)}):inputSignature(entity);}
export function planGenerationForChanges(project,changedIds){
  const impact=affectedBy(project,changedIds);
  if(impact.diagnostics.length)return {updates:[],conflicts:[],sourceRevision:project.revision,diagnostics:impact.diagnostics.map(issue=>({...issue,message:issue.code})),impact};
  return {...planGeneration(project,impact.entityIds),impact};
}
// Pure planning: it never changes the source project or renderer state.
export function planGeneration(project,ids=project.entities.map(e=>e.id)){
  const plan={updates:[],diagnostics:[],conflicts:[],sourceRevision:project.revision};
  for(const entity of project.entities.filter(e=>ids.includes(e.id))){
    const issues=[...entityIssues(entity),...referenceScaleIssues(project,entity)];if(issues.length){plan.diagnostics.push({entityId:entity.id,message:issues.join(', ')});continue;}
    const old=project.objects.find(o=>o.sourceEntityId===entity.id);
    const node=project.nodes?.find(n=>n.id===entity.id);if(node&&effective(project,node,'locked')||old?.locked||project.layers.find(l=>l.id===entity.layerId)?.locked){plan.conflicts.push({entityId:entity.id,message:'잠긴 레이어 또는 생성 결과를 유지합니다.'});continue;}
    const sourceSignature=generationInputSignature(project,entity),version=entity.parameters.terrain?GENERATOR_VERSION+'/'+TERRAIN_ALGORITHM:GENERATOR_VERSION;
    const unchanged=old?.generation?.sourceSignature===sourceSignature&&old.generation.version===version;
    if(unchanged)continue;
    const params=entity.parameters,geometry=structuredClone(entity.geometry);
    const anchor=[0,1].map(axis=>(Math.min(...geometry.points.map(p=>p[axis]))+Math.max(...geometry.points.map(p=>p[axis])))/2);anchor.push(Math.min(...geometry.points.map(p=>p[2])));
    const position=old?.ownership==='User Override'?[...old.position]:[...anchor];
    const output={id:entity.outputId,kind:'generated',sourceEntityId:entity.id,name:entity.name,entityType:entity.type,anchor,position,rotation:[...(old?.rotation||[0,0,0])],scale:[...(old?.scale||[1,1,1])],locked:false,ownership:old?.ownership==='User Override'?'User Override':'Generated',...(old?.overrides?{overrides:structuredClone(old.overrides)}:{}),geometry,parameters:structuredClone(params),generation:{generator:entity.type,version,seed:0,sourceSignature}};
    if(entity.type==='Terrain'&&params.terrain){try{const resolved=resolveTerrain({...entity,geometry:node?.geometry||entity.geometry}),frame=node?worldTransform(project,node):null;output.terrainMesh={...resolved,coordinateSpace:'world',positions:resolved.positions.map(pt=>frame?pointToWorld(frame,pt):pt)};const heights=output.terrainMesh.positions.map(p=>p[2]);output.terrainMesh.stats={...resolved.stats,localMinHeight:resolved.stats.minHeight,localMaxHeight:resolved.stats.maxHeight,minHeight:Math.min(...heights),maxHeight:Math.max(...heights)};}catch(error){plan.diagnostics.push({entityId:entity.id,message:error.message,severity:'error'});continue;}}
    // A placed asset used by a Prop remains an actual asset reference.
    if(entity.type==='Prop'&&params.assetId){output.assetId=params.assetId;output.unitScale=project.assets[params.assetId]?.ext==='fbx'?0.01:1;}
    plan.updates.push(output);
    if(entity.type==='Road')plan.diagnostics.push({entityId:entity.id,message:'기본 도로 리본: 교차로 접합·지형 추종은 후속 구현입니다.',severity:'info'});
    if(entity.type==='Terrain')plan.diagnostics.push({entityId:entity.id,message:output.terrainMesh?`지형 높이 계산: ${output.terrainMesh.stats.vertexCount}개 정점 / 높이 ${output.terrainMesh.stats.minHeight.toFixed(2)}~${output.terrainMesh.stats.maxHeight.toFixed(2)}m. 경계 방식은 설계 설정을 따르며 이웃 지형 자동 접합은 후속입니다.`:'기본 지형: STEP 2에서 높이 계산을 켜면 브러시·높이점·등고선·경계 방식을 설정할 수 있습니다.',severity:'info'});
  }
  return plan;
}
export function applyGeneration(project,plan){
  if(plan.sourceRevision!==project.revision)throw Error('미리보기 후 프로젝트가 변경되었습니다. 다시 미리보기하세요.');
  for(const update of plan.updates){
    const entity=project.entities.find(e=>e.id===update.sourceEntityId);
    if(!entity||generationInputSignature(project,entity)!==update.generation.sourceSignature)throw Error('생성 입력이 변경되었습니다. 다시 미리보기하세요.');
    if(referenceScaleIssues(project,entity).length)throw Error('참조 이미지의 실제 축척을 먼저 확정하세요.');
  }
  for(const update of plan.updates){const at=project.objects.findIndex(o=>o.id===update.id);if(at<0)project.objects.push(structuredClone(update));else project.objects[at]=structuredClone(update);}
}
