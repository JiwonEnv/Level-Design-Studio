import {referenceScaleConfirmed} from './references.js';

const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const coordinate=value=>Number.isFinite(value)&&Math.abs(value)<=1e7;
const fail=message=>{throw Error('이미지 편집 문서: '+message);};
function dimensions(width,height){
 if(![width,height].every(v=>Number.isInteger(v)&&v>0&&v<=8192)||width*height>24000000)fail('가로·세로 8192픽셀, 총 2400만 픽셀 이내여야 합니다.');
}
function text(value,label,max){if(typeof value!=='string'||!value.trim()||value.length>max)fail(label+' 형식이 올바르지 않습니다.');return value;}
function layerTransform(layer){
 if(!record(layer))fail('레이어 형식이 올바르지 않습니다.');
 const value=(key,fallback)=>layer[key]===undefined?fallback:layer[key];
 const offsetX=value('offsetX',0),offsetY=value('offsetY',0),rotation=value('rotation',0),scaleX=value('scaleX',1),scaleY=value('scaleY',1);
 if(!coordinate(offsetX)||!coordinate(offsetY)||!coordinate(rotation))fail('레이어 이동·회전 값이 올바르지 않습니다.');
 if(![scaleX,scaleY].every(v=>Number.isFinite(v)&&v>=.01&&v<=100))fail('레이어 배율은 0.01~100 범위여야 합니다.');
 return {offsetX,offsetY,rotation,scaleX,scaleY};
}
function transformInputs(layer,point,size){
 if(!Array.isArray(size)||size.length!==2)fail('이미지 크기가 필요합니다.');dimensions(size[0],size[1]);
 if(!Array.isArray(point)||point.length!==2||![point[0],point[1]].every(v=>Number.isFinite(v)&&Math.abs(v)<=1e12))fail('변환 좌표가 올바르지 않습니다.');
 return {...layerTransform(layer),centerX:size[0]/2,centerY:size[1]/2};
}
// Coordinates use image pixels: +X right, +Y down, positive rotation clockwise.
export function rasterLayerToImage(layer,point,size){
 const {centerX,centerY,offsetX,offsetY,rotation,scaleX,scaleY}=transformInputs(layer,point,size),a=rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),x=(point[0]-centerX)*scaleX,y=(point[1]-centerY)*scaleY;
 return [centerX+offsetX+c*x-s*y,centerY+offsetY+s*x+c*y];
}
export function rasterImageToLayer(layer,point,size){
 const {centerX,centerY,offsetX,offsetY,rotation,scaleX,scaleY}=transformInputs(layer,point,size),a=rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),x=point[0]-centerX-offsetX,y=point[1]-centerY-offsetY;
 return [centerX+(c*x+s*y)/scaleX,centerY+(-s*x+c*y)/scaleY];
}

// Return a detached, allow-listed document. Validation never changes caller data.
export function validateRasterDocument(document){
 if(!record(document)||document.version!==1)fail('지원하지 않는 버전입니다.');
 dimensions(document.width,document.height);
 if(!Array.isArray(document.layers)||document.layers.length>64)fail('레이어는 최대 64개입니다.');
 let commandCount=0,pointCount=0;const ids=new Set();
 const layers=Array.from(document.layers,layer=>{
  if(!record(layer))fail('레이어 형식이 올바르지 않습니다.');
  const id=text(layer.id,'레이어 ID',128),name=text(layer.name,'레이어 이름',200);
  if(ids.has(id))fail('레이어 ID가 중복됩니다.');ids.add(id);
  if(typeof layer.visible!=='boolean'||typeof layer.locked!=='boolean'||!Number.isFinite(layer.opacity)||layer.opacity<0||layer.opacity>1)fail('레이어 표시·잠금·불투명도를 확인하세요.');
  const transform=layerTransform(layer);
  const source=layer.source===undefined?false:layer.source;if(typeof source!=='boolean')fail('원본 편집 레이어 형식이 올바르지 않습니다.');
  if(!Array.isArray(layer.commands)||(commandCount+=layer.commands.length)>5000)fail('편집 명령은 최대 5000개입니다.');
  const commands=Array.from(layer.commands,command=>{
   if(!record(command))fail('편집 명령 형식이 올바르지 않습니다.');
   const {type}=command;
   if(type==='selection-transfer'){
    const {x,y,width,height,dx,dy,copy}=command;
    if(![x,y,dx,dy].every(v=>Number.isInteger(v)&&coordinate(v))||!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||width>document.width||height>document.height||typeof copy!=='boolean')fail('선택 영역 이동·복사 범위가 올바르지 않습니다.');
    return {type,x,y,width,height,dx,dy,copy};
   }
   if(type==='brush'||type==='eraser'){
    if(!Array.isArray(command.points)||!command.points.length||(pointCount+=command.points.length)>250000)fail('브러시 점은 총 25만 개 이내여야 합니다.');
    if(!Number.isFinite(command.size)||command.size<=0||command.size>8192)fail('브러시 크기는 0 초과 8192 이하로 입력하세요.');
    if(typeof command.color!=='string'||!/^#[0-9a-f]{6}$/i.test(command.color))fail('색상 형식이 올바르지 않습니다.');
    const points=Array.from(command.points,point=>{if(!Array.isArray(point)||point.length!==2||!coordinate(point[0])||!coordinate(point[1]))fail('브러시 좌표가 올바르지 않습니다.');return [...point];});
    return {type,points,size:command.size,color:command.color};
   }
   if(type==='rect'||type==='ellipse'||type==='clear-rect'){
    const {x,y,width,height}=command;
    if(![x,y,width,height].every(coordinate)||width<=0||height<=0)fail('도형 범위가 올바르지 않습니다.');
    if(type==='clear-rect')return {type,x,y,width,height};
    if(typeof command.color!=='string'||!/^#[0-9a-f]{6}$/i.test(command.color))fail('색상 형식이 올바르지 않습니다.');
    return {type,x,y,width,height,color:command.color};
   }
   fail('지원하지 않는 편집 명령입니다.');
  });
  return {id,name,visible:layer.visible,locked:layer.locked,opacity:layer.opacity,source,...transform,commands};
 });
 return {version:1,width:document.width,height:document.height,layers};
}

export function createRasterDocument(reference){
 const [width,height]=reference?.sourceSize||[];dimensions(width,height);
 const previous=reference?.derived?.operation;
 if(previous?.type==='raster-edit'&&previous.document){
  const document=validateRasterDocument(previous.document);
  if(document.width!==width||document.height!==height)fail('원본 크기와 편집 문서 크기가 다릅니다.');
  return document;
 }
 return {version:1,width,height,layers:[{id:crypto.randomUUID(),name:'원본 편집본',visible:true,locked:false,opacity:1,source:true,offsetX:0,offsetY:0,rotation:0,scaleX:1,scaleY:1,commands:[]}]};
}

// Pixel-only edits keep the metric frame and geographic measurement intact.
export function rasterDerivedFrame(reference,asset,document){
 const validated=validateRasterDocument(document),[width,height]=reference?.sourceSize||[];
 if(validated.width!==width||validated.height!==height)fail('원본 크기와 편집 문서 크기가 다릅니다.');
 if(!reference?.id||!reference.assetId||typeof asset?.hash!=='string'||!asset.hash)fail('원본 이미지 연결이 없습니다.');
 const sourceFrame=structuredClone({id:reference.id,assetId:reference.assetId,sourceSize:reference.sourceSize,widthMeters:reference.widthMeters,origin:reference.origin,rotation:reference.rotation});
 const previous=reference.derived?.operation?.type==='raster-edit'?reference.derived:null;
 const frame={widthMeters:reference.widthMeters,sourceSize:[...reference.sourceSize],origin:structuredClone(reference.origin),rotation:reference.rotation??0,opacity:reference.opacity??.65,scaleConfirmed:referenceScaleConfirmed(reference),derived:{version:1,sourceReferenceId:previous?.sourceReferenceId??reference.id,sourceAssetId:previous?.sourceAssetId??reference.assetId,sourceHash:previous?.sourceHash??asset.hash,sourceFrame,operation:{type:'raster-edit',document:validated},engine:{name:'Studio Raster',version:'1'},coordinatePolicy:'preserve-source-pixel-scale'}};
 for(const key of ['geo','calibration'])if(reference[key]!==undefined)frame[key]=structuredClone(reference[key]);
 return frame;
}

export const rasterDocument=createRasterDocument;
