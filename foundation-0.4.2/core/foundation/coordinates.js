// Authoritative design space: metres, right-handed XY ground / Z up.
// Asset conversion is separate from both placement transform and project origin.
function vector(v){if(!Array.isArray(v)||v.length!==3||!v.every(Number.isFinite))throw Error('유효한 3차원 좌표가 필요합니다.');return v;}
export function localToAbsolute(point,origin){vector(point);vector(origin);return point.map((v,i)=>v+origin[i]);}
export function absoluteToLocal(point,origin){vector(point);vector(origin);return point.map((v,i)=>v-origin[i]);}
export function assetFrame(format,unitScale){
  if(!['glb','fbx'].includes(format))throw Error('지원하지 않는 모델 좌표 형식');
  const scale=unitScale??(format==='fbx'?.01:1);
  if(!Number.isFinite(scale)||scale<=0)throw Error('모델 단위 배율은 0보다 커야 합니다.');
  return {scale,rotationX:format==='glb'?Math.PI/2:0};
}
export function assetPointToStudio(point,format,unitScale){
  vector(point);const {scale}=assetFrame(format,unitScale),[x,y,z]=point;
  return (format==='glb'?[x,-z,y]:[x,y,z]).map(v=>v*scale);
}
export function studioPointToAsset(point,format,unitScale){
  vector(point);const {scale}=assetFrame(format,unitScale),[x,y,z]=point.map(v=>v/scale);
  return format==='glb'?[x,z,-y]:[x,y,z];
}
// Verified with export-coordinate-fixture.py and the explicit FBX importer
// profiles in Unity 6000.6.4f1 / Unreal 5.8.4. Not an arbitrary FBX convention.
export function studioToEngine(point,engine){
  vector(point);const [x,y,z]=point;
  if(engine==='unreal-5.8')return [x*100,-y*100,z*100];
  if(engine==='unity-6')return [-x,z,-y];
  throw Error('검증되지 않은 엔진 좌표 프로필');
}
export function engineToStudio(point,engine){
  vector(point);const [x,y,z]=point;
  if(engine==='unreal-5.8')return [x/100,-y/100,z/100];
  if(engine==='unity-6')return [-x,-z,y];
  throw Error('검증되지 않은 엔진 좌표 프로필');
}
export function studioPoseToEngine(pose,engine){
  const position=studioToEngine(pose.position,engine);vector(pose.scale);
  const q=pose.rotation;if(!Array.isArray(q)||q.length!==4||!q.every(Number.isFinite)||Math.abs(Math.hypot(...q)-1)>1e-6)throw Error('정규화된 Quaternion이 필요합니다.');
  const [x,y,z,w]=q;
  return {position,rotation:engine==='unreal-5.8'?[-x,y,-z,w]:[x,-z,y,w],scale:engine==='unreal-5.8'?[...pose.scale]:[pose.scale[0],pose.scale[2],pose.scale[1]]};
}
