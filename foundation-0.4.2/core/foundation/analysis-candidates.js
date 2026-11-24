import {createEntity,entityIssues,referenceToWorld} from '../scene-model.js';
import {referenceFrameSignature} from './image-derivation.js';
const id=()=>crypto.randomUUID();
export const analysisPixelsCurrent=(batch,reference,hash)=>!!reference&&reference.assetId===batch.sourceAssetId&&hash===batch.sourceHash&&JSON.stringify(reference.sourceSize)===JSON.stringify(batch.sourceFrame.sourceSize);
export function addAnalysisBatch(d,{referenceId,sourceHash,signature,maskAssetId,result}){
 const ref=d.references.find(r=>r.id===referenceId);
 if(!ref||d.assets[ref.assetId]?.hash!==sourceHash||referenceFrameSignature(ref)!==signature)throw Error('분석 후 원본이 변경됐습니다. 다시 분석하세요.');
 if(!d.assets[maskAssetId]||!Array.isArray(result.candidates)||result.candidates.length>100)throw Error('분석 마스크·후보가 올바르지 않습니다.');
 const batch={id:id(),createdAt:new Date().toISOString(),sourceReferenceId:ref.id,sourceAssetId:ref.assetId,sourceHash,sourceFrame:structuredClone(ref),signature,maskAssetId,engine:structuredClone(result.engine),parameters:structuredClone(result.parameters),visible:true,candidates:result.candidates.map(c=>({id:id(),type:c.type||(result.parameters.mode==='lines'?'Road':'Building'),points:structuredClone(c.points),confidence:null,evidence:structuredClone(c.evidence),status:'pending'}))};
 for(const candidate of batch.candidates)candidateEntity(batch,candidate,candidate);
 d.extensions.referenceAnalysis??=[];d.extensions.referenceAnalysis.push(batch);return batch;
}
function candidateEntity(batch,candidate,request,frame=batch.sourceFrame){
 const types=batch.parameters.mode==='lines'?['Road']:['Building','Water','Zone'];
 if(!types.includes(request.type)||!Array.isArray(request.points)||request.points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<0||p[0]>batch.sourceFrame.sourceSize[0]||p[1]<0||p[1]>batch.sourceFrame.sourceSize[1]))throw Error('후보 유형과 원본 픽셀 좌표를 확인하세요.');
 const entity=createEntity(request.type,request.points.map(pt=>referenceToWorld(frame,pt)),{name:`${request.type} 후보 승인`,referenceIds:[batch.sourceReferenceId],analysisOrigin:{batchId:batch.id,candidateId:candidate.id,sourceHash:batch.sourceHash,approvedFrame:structuredClone(frame)}}),issues=entityIssues(entity);if(issues.length)throw Error(issues.join(', '));return entity;
}
export function approveAnalysisCandidates(d,batchId,requests){
 const batch=d.extensions.referenceAnalysis?.find(b=>b.id===batchId),ref=batch&&d.references.find(r=>r.id===batch.sourceReferenceId);
 if(!batch||!analysisPixelsCurrent(batch,ref,d.assets[ref?.assetId]?.hash))throw Error('분석 기준 이미지 내용이 변경됐습니다. 다시 분석하세요.');
 if(!Array.isArray(requests)||!requests.length||new Set(requests.map(r=>r.id)).size!==requests.length)throw Error('승인할 후보를 선택하세요.');
 const prepared=requests.map(request=>{const c=batch.candidates.find(c=>c.id===request.id);if(!c||c.status!=='pending')throw Error('이미 처리했거나 없는 후보입니다.');return {candidate:c,entity:candidateEntity(batch,c,request,ref),request};});
 for(const {candidate,entity,request} of prepared){d.entities.push(entity);candidate.type=request.type;candidate.points=structuredClone(request.points);candidate.status='approved';candidate.entityId=entity.id;}
 return prepared.map(p=>p.entity);
}
export function saveAnalysisCandidateEdits(d,batchId,requests){
 const batch=d.extensions.referenceAnalysis?.find(b=>b.id===batchId);if(!batch)throw Error('분석 레이어가 없습니다.');
 if(!Array.isArray(requests)||new Set(requests.map(r=>r.id)).size!==requests.length)throw Error('후보 수정 목록이 중복됐습니다.');
 const updates=requests.map(request=>{const c=batch.candidates.find(c=>c.id===request.id);if(!c||c.status!=='pending')throw Error('이미 처리했거나 없는 후보입니다.');candidateEntity(batch,c,request);return {c,request};});
 for(const {c,request} of updates){c.points=structuredClone(request.points);c.type=request.type;}
}
export function rejectAnalysisCandidates(d,batchId,ids){
 const batch=d.extensions.referenceAnalysis?.find(b=>b.id===batchId);if(!batch||!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)throw Error('제외할 후보를 선택하세요.');
 const selected=ids.map(id=>{const c=batch.candidates.find(c=>c.id===id);if(!c||c.status!=='pending')throw Error('이미 처리했거나 없는 후보입니다.');return c;});for(const c of selected)c.status='rejected';
}
export function analysisCandidateIssues(d){
 const batches=d.extensions?.referenceAnalysis;if(batches===undefined)return [];if(!Array.isArray(batches))return ['분석 레이어 형식 오류'];
 const issues=[],ids=new Set([...d.nodes.map(n=>n.id),...d.objects.map(o=>o.id),...d.entities.map(e=>e.outputId),...d.recipes.map(r=>r.id),...Object.keys(d.assets),...(d.extensions.productionIdentity?.records||[]).map(r=>r.id),...(d.extensions.sockets||[]).map(r=>r.id)]);
 const take=value=>{if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)||ids.has(value))issues.push('분석 ID 누락/중복');ids.add(value);};
 for(const b of batches){take(b.id);if(!d.references.some(r=>r.id===b.sourceReferenceId)||!d.assets[b.sourceAssetId]||!d.assets[b.maskAssetId])issues.push('분석 원본/마스크 연결 누락');if(!Array.isArray(b.candidates)||b.candidates.length>100){issues.push('분석 후보 형식 오류');continue;}for(const c of b.candidates){take(c.id);if(!['pending','approved','rejected'].includes(c.status))issues.push('후보 상태 오류');try{candidateEntity(b,c,c);}catch(e){issues.push('분석 후보: '+e.message);}}}
 return issues;
}
