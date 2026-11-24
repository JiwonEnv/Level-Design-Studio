import {effective,reconcileLegacy,validateDocument,worldTransform,pointToLocal,pointToWorld} from './document.js';
import {reprojectTerrainXY} from './terrain-definition.js';
import {referenceScaleConfirmed} from './references.js';
import {worldToReference,referenceToWorld,entityIssues} from '../scene-model.js';
const copy=x=>structuredClone(x);
function inputs(d,referenceId){const ref=d.references.find(r=>r.id===referenceId),entities=d.entities.filter(e=>e.referenceIds.includes(referenceId));return JSON.stringify({ref,sourceHash:d.assets[ref?.assetId]?.hash,entities,locks:entities.map(e=>{const n=d.nodes.find(n=>n.id===e.id);return [e.id,n?effective(d,n,'locked'):d.layers.find(l=>l.id===e.layerId)?.locked];}),referenceLocked:(()=>{const n=d.nodes.find(n=>n.id===referenceId);return n&&effective(d,n,'locked');})(),outputs:d.objects.filter(o=>entities.some(e=>e.id===o.sourceEntityId))});}
export function planReferenceCalibration(d,referenceId,width,calibration){
 const ref=d.references.find(r=>r.id===referenceId),node=d.nodes.find(n=>n.id===referenceId);
 if(!ref||!Number.isFinite(width)||width<=0)throw Error('이미지의 실제 가로 길이를 확인하세요.');
 if(node&&effective(d,node,'locked'))throw Error('잠긴 이미지의 축척은 변경할 수 없습니다.');
 if(calibration){const pixels=calibration.pixels,metres=calibration.distanceMeters;if(!Array.isArray(pixels)||pixels.length!==2||pixels.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))||!Number.isFinite(metres)||metres<=0)throw Error('실측 두 점과 거리를 확인하세요.');const distance=Math.hypot(pixels[1][0]-pixels[0][0],pixels[1][1]-pixels[0][1]);if(distance<1e-6||Math.abs(width-metres/distance*ref.sourceSize[0])>Math.max(width,1)*1e-8)throw Error('실측 거리와 보정 축척이 일치하지 않습니다.');}
 const next={...copy(ref),widthMeters:width,scaleConfirmed:true};if(calibration)next.calibration=copy(calibration);else delete next.calibration;
 const candidates=d.entities.filter(e=>e.referenceIds.includes(referenceId)).map(entity=>{
  const n=d.nodes.find(n=>n.id===entity.id),hasOutput=d.objects.some(o=>o.sourceEntityId===entity.id),locked=n?effective(d,n,'locked'):d.layers.find(l=>l.id===entity.layerId)?.locked;
  let reason=locked?'잠긴 도형은 유지합니다.':entity.referenceIds.length>1?'여러 이미지에 연결된 도형은 유지합니다.':null;
  const geometry={...copy(entity.geometry),points:entity.geometry.points.map(pt=>{if(width===ref.widthMeters)return [...pt];const world=referenceToWorld(next,worldToReference(ref,pt));return [world[0],world[1],pt[2]];})};
  let parameters=copy(entity.parameters);const spatial=entity.type==='Terrain'&&!!parameters.terrain;
  if(spatial){const frame=n?worldTransform(d,n):{position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]};if(Math.abs(frame.rotation[0])+Math.abs(frame.rotation[1])>1e-7)reason??='기울어진 지형 높이 데이터는 2D 축척 보정에서 유지합니다.';else parameters=reprojectTerrainXY(parameters,xy=>{const world=pointToWorld(frame,[xy[0],xy[1],0]),projected=referenceToWorld(next,worldToReference(ref,world));return pointToLocal(frame,[projected[0],projected[1],frame.position[2]]).slice(0,2);},width/ref.widthMeters);}
  const issues=entityIssues({...entity,geometry,parameters});if(issues.length&&!reason)reason='보정 범위 오류: '+issues.join(', ');
  return {id:entity.id,name:entity.name,type:entity.type,before:copy(entity.geometry),geometry,parameters,spatial,reason,hasOutput,defaultSelected:!reason&&!hasOutput&&!referenceScaleConfirmed(ref)};
 });
 return {referenceId,width,oldWidth:ref.widthMeters,calibration:copy(calibration),fingerprint:inputs(d,referenceId),candidates,selectedIds:candidates.filter(c=>c.defaultSelected).map(c=>c.id)};
}
export function applyReferenceCalibration(d,plan,selectedIds=plan.selectedIds){
 if(inputs(d,plan.referenceId)!==plan.fingerprint)throw Error('미리보기 후 이미지·연결 도형이 변경됐습니다. 다시 미리보기하세요.');
 const fresh=planReferenceCalibration(d,plan.referenceId,plan.width,plan.calibration);
 if(!Array.isArray(selectedIds)||new Set(selectedIds).size!==selectedIds.length||selectedIds.some(id=>!fresh.candidates.some(c=>c.id===id&&!c.reason)))throw Error('보정할 수 없는 도형이 선택됐습니다.');
 const next=copy(d),ref=next.references.find(r=>r.id===plan.referenceId);ref.widthMeters=plan.width;ref.scaleConfirmed=true;if(plan.calibration)ref.calibration=copy(plan.calibration);else delete ref.calibration;
 for(const c of fresh.candidates.filter(c=>selectedIds.includes(c.id))){const entity=next.entities.find(e=>e.id===c.id);entity.geometry=copy(c.geometry);entity.parameters=copy(c.parameters);}
 next.extensions.calibrationEvents??=[];next.extensions.calibrationEvents.push({at:new Date().toISOString(),referenceId:ref.id,fromWidth:fresh.oldWidth,toWidth:plan.width,entityIds:[...selectedIds],policy:'explicit-selected-xy-height-and-outputs-preserved'});
 reconcileLegacy(next,d);validateDocument(next);Object.assign(d,next);return selectedIds;
}
