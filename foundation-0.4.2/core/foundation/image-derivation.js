import {referenceToWorld} from '../scene-model.js';
import {referenceScaleConfirmed} from './references.js';
export const referenceFrameSignature=r=>JSON.stringify([r.assetId,r.sourceSize,r.widthMeters,r.origin,r.rotation]);
export function imageOperation(reference,request){
 const [w,h]=reference.sourceSize||[];
 if(![w,h].every(n=>Number.isInteger(n)&&n>0)||w*h>24000000)throw Error('이미지 편집은 2400만 픽셀 이내의 원본을 사용하세요.');
 if(request?.type==='crop'){
  const {x,y,width,height}=request;
  if(![x,y,width,height].every(Number.isInteger)||x<0||y<0||width<1||height<1||x+width>w||y+height>h)throw Error('크롭 범위는 원본 이미지 안에 있어야 합니다.');
  return {type:'crop',command:'image.crop',params:{x,y,width,height,deleteCroppedPixels:true},size:[width,height]};
 }
 if(request?.type==='perspective'){
  const {corners,width,height}=request;
  if(![width,height].every(n=>Number.isInteger(n)&&n>0&&n<=4096)||width*height>16000000)throw Error('보정 결과는 가로·세로 4096픽셀 이내로 지정하세요.');
  if(!Array.isArray(corners)||corners.length!==4||corners.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<0||p[0]>w||p[1]<0||p[1]>h))throw Error('원본 이미지 안의 네 모서리를 지정하세요.');
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
  if(corners.some((p,i)=>cross(p,corners[(i+1)%4],corners[(i+2)%4])<1))throw Error('왼쪽 위부터 시계 방향으로 겹치지 않는 네 모서리를 지정하세요.');
  return {type:'perspective',command:'image.perspectiveCrop',params:{corners:structuredClone(corners),width,height,interpolation:'bilinear'},size:[width,height]};
 }
 throw Error('지원하지 않는 이미지 편집입니다.');
}
export function derivedReferenceFrame(source,asset,operation){
 const crop=operation.type==='crop',params=operation.params,origin=referenceToWorld(source,crop?[params.x,params.y+params.height]:params.corners[3]);
 return {widthMeters:source.widthMeters*operation.size[0]/source.sourceSize[0],sourceSize:[...operation.size],origin,rotation:source.rotation||0,opacity:source.opacity??.65,scaleConfirmed:crop&&referenceScaleConfirmed(source),derived:{version:1,sourceReferenceId:source.id,sourceAssetId:source.assetId,sourceHash:asset.hash,sourceFrame:structuredClone(source),operation:structuredClone(operation),engine:{name:'PhotoCraft',version:'0.23.1'},coordinatePolicy:crop?'preserve-source-pixel-scale':'requires-new-metric-calibration'}};
}
