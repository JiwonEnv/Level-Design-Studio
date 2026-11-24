import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {imageOperation,derivedReferenceFrame,referenceFrameSignature} from '../core/foundation/image-derivation.js';
const run=promisify(execFile);
export async function previewReferenceImage({store,executable,projectId,referenceId,sourceHash,signature,request}){
 const p=await store.project(projectId),ref=p.references.find(r=>r.id===referenceId),asset=ref&&p.assets[ref.assetId];
 if(!ref||!asset||asset.hash!==sourceHash||referenceFrameSignature(ref)!==signature)throw Error('원본 또는 이미지 배치가 변경됐습니다. 편집 창을 다시 여세요.');
 if(!['png','jpg','jpeg','webp'].includes(asset.ext))throw Error('PNG·JPG·WebP 참조 이미지를 사용하세요.');
 const operation=imageOperation(ref,request);await stat(executable).catch(()=>{throw Error('PhotoCraft 이미지 처리 도구가 없습니다. 프로그램 배포 파일을 확인하세요.');});
 const bytes=await readFile(await store.findBlob(asset.hash));if(bytes.length>48*1024*1024||createHash('sha256').update(bytes).digest('hex')!==asset.hash)throw Error('원본 이미지가 누락되거나 손상됐습니다.');
 const folder=await mkdtemp(path.join(os.tmpdir(),'lds-image-preview-'));
 try{
  const input=path.join(folder,'source.'+asset.ext),output=path.join(folder,'derived.png');await writeFile(input,bytes,{flag:'wx'});
  await run(executable,['run',input,'--cmd',operation.command,'--params',JSON.stringify(operation.params),'--out',output],{windowsHide:true,timeout:60000,maxBuffer:1024*1024});
  const result=await readFile(output);if(result.length>48*1024*1024||!result.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||result.readUInt32BE(16)!==operation.size[0]||result.readUInt32BE(20)!==operation.size[1])throw Error('이미지 처리 결과의 크기·형식을 검증하지 못했습니다.');
  return {content:result.toString('base64'),frame:derivedReferenceFrame(ref,asset,operation)};
 }finally{const resolved=path.resolve(folder);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('lds-image-preview-'))await rm(resolved,{recursive:true,force:true});}
}
