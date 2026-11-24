import {effective,worldTransform,pointToLocal,pointToWorld,reconcileLegacy,validateDocument} from './document.js';
import {generationInputSignature} from '../generation.js';
import {newTerrainDefinition} from './terrain-definition.js';
import {terrainPointInside} from './terrain-pipeline.js';
import {prepareTerrainConstraints} from './terrain-constraints.js';
export function terrainAuthoringSource(d,id){
 const entity=d.entities.find(e=>e.id===id),node=d.nodes.find(n=>n.id===id);if(entity?.type!=='Terrain'||!node?.geometry)throw Error('높이를 편집할 지형을 먼저 선택하세요.');if(effective(d,node,'locked'))throw Error('잠긴 지형은 편집할 수 없습니다.');const frame=worldTransform(d,node);if(Math.abs(frame.rotation[0])+Math.abs(frame.rotation[1])>1e-7)throw Error('기울어진 지형은 2D 높이 편집을 지원하지 않습니다. 지면에 평행한 상태에서 편집하세요.');return {entityId:id,frame,signature:generationInputSignature(d,entity)};
}
export const terrainLocalPoint=(source,world)=>pointToLocal(source.frame,[world[0],world[1],source.frame.position[2]]).slice(0,2);
function sourceEntity(d,source){const current=terrainAuthoringSource(d,source.entityId);if(current.signature!==source.signature)throw Error('입력 중 지형이 변경됐습니다. 다시 입력하세요.');return d.entities.find(e=>e.id===source.entityId);}
function commitCopy(d,next){reconcileLegacy(next,d);validateDocument(next);Object.assign(d,next);}
export function addTerrainStroke(d,source,{points,radius,height,falloff=radius,mode='raise'}){
 sourceEntity(d,source);if(!Array.isArray(points)||points.length<1||points.length>256||points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))||!Number.isFinite(radius)||radius<=0||!Number.isFinite(height)||!Number.isFinite(falloff)||falloff<0||!['raise','lower','flatten'].includes(mode))throw Error('브러시 경로·반경·높이를 확인하세요. 한 번에 최대 256개 경로 점을 지원합니다.');
 const next=structuredClone(d),entity=next.entities.find(e=>e.id===source.entityId),t=entity.parameters.terrain??=newTerrainDefinition(),profile={id:crypto.randomUUID(),name:mode==='flatten'?'브러시 평탄화':mode==='lower'?'브러시 내리기':'브러시 올리기',shape:'stroke',kind:mode==='flatten'?'level':'offset',mode:'absolute',center:[...points[0]],points:structuredClone(points),radius,height:mode==='flatten'?height:(mode==='lower'?-1:1)*Math.abs(height)},modifier={id:crypto.randomUUID(),profileId:profile.id,enabled:true,strength:1,falloff};t.profiles.push(profile);t.modifiers.push(modifier);commitCopy(d,next);return {profileId:profile.id,modifierId:modifier.id};
}
export function setTerrainControl(d,source,point,height){
 sourceEntity(d,source);if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||!Number.isFinite(height))throw Error('높이 점의 좌표·높이를 확인하세요.');
 const next=structuredClone(d),entity=next.entities.find(e=>e.id===source.entityId),node=next.nodes.find(n=>n.id===entity.id),t=entity.parameters.terrain??=newTerrainDefinition(),boundary=node.geometry.points;t.baseMode='idw';let result;
 const vertex=boundary.findIndex(p=>Math.hypot(p[0]-point[0],p[1]-point[1])<1e-6);
 if(vertex>=0){entity.geometry.points[vertex]=pointToWorld(source.frame,[boundary[vertex][0],boundary[vertex][1],height]);result={kind:'boundary',id:entity.geometry.vertexIds[vertex]};}
 else{
  let edge=-1,projected;
  for(let i=0;i<boundary.length;i++){const a=boundary[i],b=boundary[(i+1)%boundary.length],dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;if(!length2)continue;const along=((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length2,p=[a[0]+along*dx,a[1]+along*dy];if(along>0&&along<1&&Math.hypot(point[0]-p[0],point[1]-p[1])<1e-6){edge=i;projected=p;break;}}
  if(edge>=0){const id=crypto.randomUUID();entity.geometry.points.splice(edge+1,0,pointToWorld(source.frame,[...projected,height]));entity.geometry.vertexIds.splice(edge+1,0,id);result={kind:'boundary',id};}
  else{if(!terrainPointInside(point,boundary))throw Error('높이 점은 선택한 지형 안에 배치하세요.');let control=t.controlPoints.find(c=>Math.hypot(c.position[0]-point[0],c.position[1]-point[1])<1e-6);if(control)control.position[2]=height;else{control={id:crypto.randomUUID(),position:[...point,height]};t.controlPoints.push(control);}result={kind:'control',id:control.id};}
 }
 reconcileLegacy(next,d);prepareTerrainConstraints({...next.entities.find(e=>e.id===source.entityId),geometry:next.nodes.find(n=>n.id===source.entityId).geometry});commitCopy(d,next);return result;
}
export function moveTerrainControl(d,source,id,point){
 sourceEntity(d,source);const next=structuredClone(d),entity=next.entities.find(e=>e.id===source.entityId),node=next.nodes.find(n=>n.id===entity.id),control=entity.parameters.terrain?.controlPoints.find(c=>c.id===id);
 if(!control||!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||!terrainPointInside(point,node.geometry.points))throw Error('높이 제어점은 지형 안쪽으로 이동하세요.');if(entity.parameters.terrain.controlPoints.some(c=>c.id!==id&&Math.hypot(c.position[0]-point[0],c.position[1]-point[1])<1e-6))throw Error('다른 높이 제어점과 겹칩니다.');control.position=[...point,control.position[2]];prepareTerrainConstraints({...entity,geometry:node.geometry});commitCopy(d,next);return id;
}
export function addTerrainContour(d,source,{points,height,closed=false}){
 sourceEntity(d,source);if(!Array.isArray(points)||points.length<2||points.length>128||points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))||!Number.isFinite(height))throw Error('등고선은 2~128개 좌표와 높이가 필요합니다.');const path=structuredClone(points);if(path.length>2&&Math.hypot(path[0][0]-path.at(-1)[0],path[0][1]-path.at(-1)[1])<1e-6){path.pop();closed=true;}
 const next=structuredClone(d),entity=next.entities.find(e=>e.id===source.entityId),node=next.nodes.find(n=>n.id===entity.id),t=entity.parameters.terrain??=newTerrainDefinition(),contour={id:crypto.randomUUID(),points:path,vertexIds:path.map(()=>crypto.randomUUID()),height,closed};t.baseMode='idw';t.contours??=[];t.contours.push(contour);const prepared=prepareTerrainConstraints({...entity,geometry:node.geometry});commitCopy(d,next);return {id:contour.id,clippedSegments:prepared.segments.length};
}
export function moveTerrainContourVertex(d,source,contourId,vertexId,point){
 sourceEntity(d,source);const next=structuredClone(d),entity=next.entities.find(e=>e.id===source.entityId),node=next.nodes.find(n=>n.id===entity.id),contour=entity.parameters.terrain?.contours?.find(c=>c.id===contourId),index=contour?.vertexIds.indexOf(vertexId);
 if(!contour||index<0||!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite))throw Error('등고선 정점을 확인하세요.');contour.points[index]=[...point];prepareTerrainConstraints({...entity,geometry:node.geometry});commitCopy(d,next);return vertexId;
}
