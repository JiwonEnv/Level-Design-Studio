import {Worker} from 'node:worker_threads';
import {referenceFrameSignature} from '../core/foundation/image-derivation.js';
export async function analyzeReferenceImage({store,modulePath,projectId,referenceId,sourceHash,signature,rgba,threshold=128,minArea=25,mode='regions'}){
 const p=await store.project(projectId),ref=p.references.find(r=>r.id===referenceId),asset=ref&&p.assets[ref.assetId];
 if(!ref||!asset||asset.hash!==sourceHash||referenceFrameSignature(ref)!==signature)throw Error('원본 또는 이미지 배치가 변경됐습니다. 분석 창을 다시 여세요.');
 const [width,height]=ref.sourceSize||[];
 if(![width,height].every(Number.isInteger)||width<1||height<1||width*height>4000000||!(rgba instanceof ArrayBuffer||ArrayBuffer.isView(rgba))||rgba.byteLength!==width*height*4)throw Error('후보 분석은 400만 픽셀 이내의 이미지에서 실행하세요.');
 const pixels=(rgba instanceof ArrayBuffer?new Uint8Array(rgba):new Uint8Array(rgba.buffer,rgba.byteOffset,rgba.byteLength)).slice();
 if(!Number.isInteger(threshold)||threshold<1||threshold>254||!Number.isFinite(minArea)||minArea<4||minArea>width*height||!['regions','lines'].includes(mode))throw Error('명암 기준·최소 영역·분석 방식을 확인하세요.');
 return await new Promise((resolve,reject)=>{
  let settled=false;
  const worker=new Worker(new URL('./image-analysis-worker.cjs',import.meta.url),{workerData:{modulePath,rgba:pixels.buffer,width,height,threshold,minArea,mode},transferList:[pixels.buffer]});
  const timer=setTimeout(()=>{settled=true;void worker.terminate();reject(Error('이미지 분석 시간이 초과됐습니다. 더 작은 범위로 크롭해 다시 시도하세요.'));},20000);
  worker.once('message',value=>{settled=true;clearTimeout(timer);void worker.terminate();value.error?reject(Error('OpenCV 분석 실패: '+value.error)):resolve(value);});worker.once('error',e=>{settled=true;clearTimeout(timer);reject(e);});worker.once('exit',()=>{clearTimeout(timer);if(!settled)reject(Error('이미지 분석이 중단됐습니다.'));});
 });
}
