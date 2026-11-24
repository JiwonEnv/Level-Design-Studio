import {entityIssues} from '../scene-model.js';
import {generationInputSignature} from '../generation.js';
import {referenceScaleConfirmed} from './references.js';
export function designMetrics(entity){
 const points=entity?.geometry?.points;if(!points?.length||points.some(p=>!Array.isArray(p)||!p.every(Number.isFinite)))return null;
 const min=[0,1,2].map(axis=>Math.min(...points.map(p=>p[axis]))),max=[0,1,2].map(axis=>Math.max(...points.map(p=>p[axis]))),closed=entity.geometry.type==='polygon';let length=0,length3D=0,area=0,maxGrade=0;
 for(let i=0;i<points.length-(closed?0:1);i++){const a=points[i],b=points[(i+1)%points.length],xy=Math.hypot(b[0]-a[0],b[1]-a[1]);length+=xy;length3D+=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);if(xy>1e-8)maxGrade=Math.max(maxGrade,Math.abs(b[2]-a[2])/xy);if(closed)area+=(a[0]-points[0][0])*(b[1]-points[0][1])-(b[0]-points[0][0])*(a[1]-points[0][1]);}
 return {width:max[0]-min[0],depth:max[1]-min[1],minZ:min[2]+(entity.parameters?.elevation||0),maxZ:max[2]+(entity.parameters?.elevation||0),length,length3D,area:closed?Math.abs(area)/2:null,maxGrade,buildingHeight:entity.type==='Building'?entity.parameters.floors*entity.parameters.floorHeight:null};
}
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function strictlyInside(point,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
 const a=polygon[j],b=polygon[i];if(Math.abs(cross(a,b,point))<1e-8&&point[0]>=Math.min(a[0],b[0])-1e-8&&point[0]<=Math.max(a[0],b[0])+1e-8&&point[1]>=Math.min(a[1],b[1])-1e-8&&point[1]<=Math.max(a[1],b[1])+1e-8)return false;
 if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside;}
function footprintOverlap(a,b,budget){
 const bounds=points=>[0,1].map(axis=>[Math.min(...points.map(p=>p[axis])),Math.max(...points.map(p=>p[axis]))]);const A=bounds(a),B=bounds(b);
 if(A.some((v,i)=>Math.min(v[1],B[i][1])-Math.max(v[0],B[i][0])<=1e-7))return false;
 for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){
  if(--budget.edges<0)return null;const p=a[i],q=a[(i+1)%a.length],r=b[j],s=b[(j+1)%b.length];if(cross(p,q,r)*cross(p,q,s)<-1e-12&&cross(r,s,p)*cross(r,s,q)<-1e-12)return true;
 }
 if(a.some(p=>strictlyInside(p,b))||b.some(p=>strictlyInside(p,a)))return true;
 // Identical/shared boundary polygons need an interior sample rather than a vertex.
 const epsilon=Math.max(1e-7,Math.min(A[0][1]-A[0][0],A[1][1]-A[1][0])*1e-6);
 for(let i=0;i<a.length;i++){const p=a[i],q=a[(i+1)%a.length],length=Math.hypot(q[0]-p[0],q[1]-p[1]);if(!length)continue;for(const sign of [-1,1]){const point=[(p[0]+q[0])/2-sign*(q[1]-p[1])/length*epsilon,(p[1]+q[1])/2+sign*(q[0]-p[0])/length*epsilon];if(strictlyInside(point,a)&&strictlyInside(point,b))return true;}}
 return false;
}
export function inspectDesign(d,{maxPairs=2000,maxEdges=200000}={}){
 const issues=[],add=(code,severity,message,entityIds=[],extra={})=>issues.push({code,severity,message,entityIds,...extra}),valid=[];
 for(const e of d.entities){const errors=entityIssues(e);if(errors.length){add('INVALID_GEOMETRY','error',`${e.name}: ${errors.join(', ')}`,[e.id]);continue;}valid.push(e);const output=d.objects.find(o=>o.sourceEntityId===e.id);if(output&&output.generation?.sourceSignature!==generationInputSignature(d,e))add('STALE_OUTPUT','info',`${e.name}: 설계가 바뀌었습니다. 기존 3D는 유지되며 생성 미리보기가 필요합니다.`,[e.id]);}
 for(const ref of d.references){const linked=d.entities.filter(e=>e.referenceIds.includes(ref.id));if(linked.length&&!referenceScaleConfirmed(ref))add('UNCONFIRMED_SCALE','warning',`${ref.name||d.assets[ref.assetId]?.name||'이미지'}: 축척 미확정 · 연결 도형 ${linked.length}개는 3D 생성 전 실측 길이를 확정하세요.`,linked.map(e=>e.id),{referenceId:ref.id});}
 const buildings=valid.filter(e=>e.type==='Building'),budget={edges:maxEdges};let pairs=0,limited=false;
 outer:for(let i=0;i<buildings.length;i++)for(let j=i+1;j<buildings.length;j++){
  if(++pairs>maxPairs){limited=true;break outer;}const a=buildings[i],b=buildings[j],overlap=footprintOverlap(a.geometry.points,b.geometry.points,budget);if(overlap===null){limited=true;break outer;}if(overlap)add('FOOTPRINT_OVERLAP','warning',`${a.name} / ${b.name}: 건물 외곽선이 겹칩니다. 의도한 배치인지 확인하세요.`,[a.id,b.id]);
 }
 if(limited)add('INSPECTION_LIMIT','info','현재 검사 한도에 도달해 일부 외곽선 비교를 생략했습니다. 이 결과는 전체 충돌 검사 완료를 뜻하지 않습니다.');
 const rank={error:0,warning:1,info:2};issues.sort((a,b)=>rank[a.severity]-rank[b.severity]);return {issues,limited,checkedPairs:Math.min(pairs,maxPairs),counts:Object.fromEntries(['error','warning','info'].map(s=>[s,issues.filter(i=>i.severity===s).length]))};
}
