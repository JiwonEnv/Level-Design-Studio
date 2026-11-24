import test from 'node:test';
import assert from 'node:assert/strict';
import {newDocument,reconcileLegacy,validateDocument} from '../../core/foundation/document.js';
import {referenceFrameSignature} from '../../core/foundation/image-derivation.js';
import {addAnalysisBatch,approveAnalysisCandidates,saveAnalysisCandidateEdits} from '../../core/foundation/analysis-candidates.js';
import {CommandHistory} from '../../core/foundation/history.js';
import {affectedBy,dependencyGraph} from '../../core/foundation/dependencies.js';
function fixture(){const d=newDocument('Candidates'),assetId=crypto.randomUUID(),maskAssetId=crypto.randomUUID();for(const a of [assetId,maskAssetId])d.assets[a]={id:a,hash:'a'.repeat(64)};const ref={id:crypto.randomUUID(),assetId,sourceSize:[100,50],widthMeters:100,origin:[10,20,0],rotation:0};d.references.push(ref);reconcileLegacy(d);const batch=addAnalysisBatch(d,{referenceId:ref.id,sourceHash:d.assets[assetId].hash,signature:referenceFrameSignature(ref),maskAssetId,result:{engine:{name:'OpenCV',version:'4.13.0'},parameters:{mode:'regions',threshold:128},candidates:[{points:[[10,10],[30,10],[30,30],[10,30]],evidence:{areaPixels:400}},{points:[[50,10],[70,10],[70,30],[50,30]],evidence:{areaPixels:400}}]}});return {d,ref,batch};}
test('candidate-only save creates no design object; edited selected approval maps source pixels and preserves IDs through undo',()=>{
 const {d,batch}=fixture();assert.equal(d.entities.length,0);validateDocument(d);assert.equal(batch.candidates[0].confidence,null);const a=batch.candidates[0],b=structuredClone(batch.candidates[1]);saveAnalysisCandidateEdits(d,batch.id,[{...a,type:'Zone',points:[[12,10],[30,10],[30,30],[12,30]]}]);assert.equal(d.entities.length,0);
 const history=new CommandHistory(),result=history.execute(d,'approve',p=>{approveAnalysisCandidates(p,batch.id,[{...a}]);reconcileLegacy(p);});assert.equal(result.error,undefined);assert.equal(d.entities.length,1);assert.equal(d.entities[0].type,'Zone');assert.deepEqual(d.entities[0].geometry.points[0],[22,60,0]);assert.deepEqual(d.extensions.referenceAnalysis[0].candidates[1],b);const eid=d.entities[0].id,cid=a.id;
 const undone=history.undo(d);assert.equal(undone.entities.length,0);const redone=history.redo(undone);assert.equal(redone.entities[0].id,eid);assert.equal(redone.extensions.referenceAnalysis[0].candidates[0].id,cid);validateDocument(redone);
 assert.deepEqual(dependencyGraph(redone).diagnostics,[]);const impact=affectedBy(redone,[batch.maskAssetId]);assert.ok(impact.ids.includes(cid));assert.deepEqual(impact.entityIds,[eid]);assert.deepEqual(impact.outputIds,[redone.entities[0].outputId]);
});
test('invalid edits, duplicate approvals, stale source frames and missing masks do not silently mutate valid outputs',()=>{
 const {d,batch}=fixture(),before=structuredClone(d),a=batch.candidates[0];assert.throws(()=>approveAnalysisCandidates(d,batch.id,[{...a},{...a}]),/선택/);assert.deepEqual(d,before);assert.throws(()=>saveAnalysisCandidateEdits(d,batch.id,[{...a,points:[[0,0],[0,0],[0,0]]}]),/중복|면적/);assert.deepEqual(d,before);
 d.assets[d.references[0].assetId].hash='b'.repeat(64);assert.throws(()=>approveAnalysisCandidates(d,batch.id,[a]),/변경/);assert.equal(d.entities.length,0);const missing=structuredClone(before);delete missing.assets[batch.maskAssetId];assert.throws(()=>validateDocument(missing),/마스크/);
});
test('pixel candidates survive scale calibration and approve in the current frame without rerunning image analysis',()=>{
 const {d,batch}=fixture();d.references[0].widthMeters=50;const candidate=batch.candidates[0],pixel=candidate.points[0];const entities=approveAnalysisCandidates(d,batch.id,[candidate]);assert.deepEqual(entities[0].geometry.points[0],[10+pixel[0]*.5,20+(50-pixel[1])*.5,0]);assert.equal(entities[0].analysisOrigin.approvedFrame.widthMeters,50);assert.equal(batch.sourceFrame.widthMeters,100);
});
