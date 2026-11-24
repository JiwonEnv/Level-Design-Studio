import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const run=promisify(execFile),MAX_BYTES=48*1024*1024,PREFIX='lds-psd-import-';
const pngSignature=Buffer.from([137,80,78,71,13,10,26,10]);
export function inspectPsdHeader(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<26||bytes.byteLength>MAX_BYTES)throw Error('PSD 파일은 26바이트 이상 48MB 이내여야 합니다.');
 const data=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(!data.subarray(0,4).equals(Buffer.from('8BPS')))throw Error('PSD 파일 서명을 확인할 수 없습니다.');
 const version=data.readUInt16BE(4);
 if(version===2)throw Error('PSB 형식은 현재 지원하지 않습니다. RGB 8비트 PSD를 사용하세요.');
 if(version!==1)throw Error('현재는 PSD 버전 1만 지원합니다.');
 if(data.subarray(6,12).some(byte=>byte!==0))throw Error('PSD 헤더가 올바르지 않습니다.');
 const channels=data.readUInt16BE(12),height=data.readUInt32BE(14),width=data.readUInt32BE(18),depth=data.readUInt16BE(22),colorMode=data.readUInt16BE(24);
 if(colorMode!==3)throw Error('현재는 RGB PSD만 지원합니다. CMYK 등 다른 색상 모드는 RGB로 변환해 주세요.');
 if(depth!==8)throw Error('현재는 채널당 8비트 PSD만 지원합니다. 16비트·32비트 PSD는 지원하지 않습니다.');
 if(![3,4].includes(channels))throw Error('현재는 RGB 3채널 또는 RGBA 4채널 PSD만 지원합니다.');
 if(width<1||height<1||width>8192||height>8192||width*height>24000000)throw Error('PSD 크기는 가로·세로 8192픽셀, 총 2400만 픽셀 이내여야 합니다.');
 return {version,width,height,channels,depth,colorMode,mode:'RGB8'};
}

function decodeContent(content){
 if(typeof content!=='string'||!content.length||content.length>Math.ceil(MAX_BYTES/3)*4||content.length%4!==0||/[^A-Za-z0-9+/=]/.test(content))throw Error('PSD 파일 데이터가 올바르지 않거나 48MB를 초과합니다.');
 const bytes=Buffer.from(content,'base64');
 if(bytes.length>MAX_BYTES||bytes.toString('base64')!==content)throw Error('PSD 파일 데이터가 올바르지 않거나 48MB를 초과합니다.');
 return bytes;
}
function guardedFolder(folder,tempRoot){
 const resolved=path.resolve(folder);
 if(path.dirname(resolved)!==tempRoot||!path.basename(resolved).startsWith(PREFIX))throw Error('PSD 임시 작업 위치를 확인하지 못했습니다.');
 return resolved;
}
export async function flattenPsd({executable,content}){
 const bytes=decodeContent(content),header=inspectPsdHeader(bytes);
 if(typeof executable!=='string'||!path.isAbsolute(executable))throw Error('PhotoCraft 이미지 처리 도구를 확인하세요.');
 const executableInfo=await stat(executable).catch(()=>null);
 if(!executableInfo?.isFile())throw Error('PhotoCraft 이미지 처리 도구가 없습니다. 프로그램 배포 파일을 확인하세요.');
 const tempRoot=path.resolve(os.tmpdir()),folder=guardedFolder(await mkdtemp(path.join(tempRoot,PREFIX)),tempRoot);
 try{
  const input=path.join(folder,'source.psd'),output=path.join(folder,'flattened.png');
  await writeFile(input,bytes,{flag:'wx'});
  try{await run(executable,['convert',input,output,'--no-gpu'],{windowsHide:true,timeout:60000,maxBuffer:1024*1024});}
  catch(error){throw Error(error.killed?'PSD 합성 시간이 초과됐습니다. 레이어와 이미지 크기를 줄여 주세요.':'PSD를 합성하지 못했습니다. 지원하는 RGB 8비트 PSD인지 확인해 주세요.');}
  const info=await stat(output).catch(()=>null);
  if(!info?.isFile()||info.size<33||info.size>MAX_BYTES)throw Error('PSD 합성 결과의 크기·형식을 검증하지 못했습니다.');
  const result=await readFile(output);
  if(result.length<33||result.length>MAX_BYTES||!result.subarray(0,8).equals(pngSignature)||result.readUInt32BE(8)!==13||result.toString('ascii',12,16)!=='IHDR'||result.readUInt32BE(16)!==header.width||result.readUInt32BE(20)!==header.height)throw Error('PSD 합성 결과의 크기·형식을 검증하지 못했습니다.');
  return {content:result.toString('base64'),width:header.width,height:header.height,engine:{name:'PhotoCraft',version:'0.23.1'},mode:'RGB8'};
 }finally{await rm(guardedFolder(folder,tempRoot),{recursive:true,force:true});}
}
