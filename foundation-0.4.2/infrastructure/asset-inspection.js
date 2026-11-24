import {inspectPsdHeader} from './psd-import.js';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const stable=x=>JSON.stringify(x);
const sorted=x=>[...x].sort((a,b)=>stable(a).localeCompare(stable(b)));
const children=(n,name)=>n?.children?.filter(c=>c.name===name)||[];
const one=(n,name)=>children(n,name)[0];

function glb(bytes){
 if(bytes.length<20||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('GLB 헤더 또는 전체 길이가 올바르지 않습니다.');
 let document,offset=12,binLength=0;
 while(offset<bytes.length){if(offset+8>bytes.length)throw Error('GLB chunk 일부가 없습니다.');const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);offset+=8;if(offset+length>bytes.length)throw Error('GLB 저장이 끝나지 않았습니다.');if(type===0x4e4f534a){if(document)throw Error('중복 GLB JSON');document=JSON.parse(bytes.subarray(offset,offset+length).toString('utf8').replace(/\0+$/,''));}if(type===0x004e4942)binLength+=length;offset+=length;}
 if(!document||document.asset?.version!=='2.0')throw Error('지원하지 않는 GLB 문서');
 for(const buffer of document.buffers||[])if(buffer.uri&&!buffer.uri.startsWith('data:'))throw Error('외부 파일에 의존하는 GLB는 자동 갱신할 수 없습니다.');
 if(document.buffers?.[0]&&!document.buffers[0].uri&&document.buffers[0].byteLength>binLength)throw Error('GLB 버퍼 일부가 없습니다.');
 for(const view of document.bufferViews||[])if((view.byteOffset||0)+view.byteLength>(document.buffers?.[view.buffer]?.byteLength??-1))throw Error('GLB 버퍼 범위 오류');
 for(const accessor of document.accessors||[]){const width={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}[accessor.componentType],components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16}[accessor.type];if(!width||!components||!Number.isInteger(accessor.count)||accessor.count<0)throw Error('GLB accessor 형식 오류');if(accessor.bufferView!==undefined){const view=document.bufferViews?.[accessor.bufferView],size=width*components;if(!view||(accessor.byteOffset||0)+Math.max(0,accessor.count-1)*(view.byteStride||size)+(accessor.count?size:0)>view.byteLength)throw Error('GLB accessor 버퍼 일부 누락');}if(accessor.sparse)throw Error('Sparse GLB accessor는 자동 분석을 지원하지 않습니다.');}
 const meshes=document.meshes||[],nodes=document.nodes||[],materials=document.materials||[];
 if(!meshes.length||!nodes.some(n=>Number.isInteger(n.mesh)))throw Error('GLB 모델 메시가 없습니다.');
 for(const mesh of meshes)for(const primitive of mesh.primitives||[]){const accessor=document.accessors?.[primitive.attributes?.POSITION];if(!accessor||!accessor.count)throw Error('GLB POSITION 누락');for(const a of [...Object.values(primitive.attributes||{}),primitive.indices].filter(x=>x!==undefined))if(!document.accessors?.[a])throw Error('GLB accessor 누락');}
 const identity=nodes.map((n,i)=>({name:n.name||'node-'+i,mesh:n.mesh??null,children:n.children||[],skin:n.skin??null}));
 const frame=nodes.map(n=>({translation:n.translation||[0,0,0],rotation:n.rotation||[0,0,0,1],scale:n.scale||[1,1,1],matrix:n.matrix||null}));
 const slots={materials:materials.map((m,i)=>m.name||'material-'+i),binding:meshes.map(m=>(m.primitives||[]).map(p=>p.material??null))};
 const topology=meshes.map((m,i)=>({name:m.name||'mesh-'+i,primitives:(m.primitives||[]).map(p=>({mode:p.mode??4,vertices:document.accessors[p.attributes.POSITION].count,indices:p.indices===undefined?null:document.accessors[p.indices].count,morphs:p.targets?.length||0,skin:!!p.attributes?.JOINTS_0}))}));
 return {format:'glb',identity,frame,slots,topology,meshCount:meshes.length,materialCount:materials.length,animated:!!document.animations?.length,extensions:document.extensionsRequired||[]};
}

// Read FBX metadata without loading textures, evaluating scripts or modifying files.
function binaryFBX(bytes){
 const version=bytes.readUInt32LE(23),wide=version>=7500,header=wide?25:13;let at=27,nodes=0;
 const u64=()=>{const n=Number(bytes.readBigUInt64LE(at));at+=8;if(!Number.isSafeInteger(n))throw Error('FBX 정수 범위 오류');return n;};
 const u32=()=>{const n=bytes.readUInt32LE(at);at+=4;return n;};
 function property(){const type=String.fromCharCode(bytes[at++]);let value;switch(type){case 'Y':value=bytes.readInt16LE(at);at+=2;return value;case 'C':return !!bytes[at++];case 'I':value=bytes.readInt32LE(at);at+=4;return value;case 'F':value=bytes.readFloatLE(at);at+=4;return value;case 'D':value=bytes.readDoubleLE(at);at+=8;return value;case 'L':value=bytes.readBigInt64LE(at).toString();at+=8;return value;case 'S':case 'R':{const length=u32();if(at+length>bytes.length)throw Error('FBX property 일부 누락');value=bytes.subarray(at,at+length);at+=length;return type==='S'?value.toString('utf8').replace(/\x00\x01/g,'::'):null;}default:if('fdlibc'.includes(type)){const count=u32(),encoding=u32(),length=u32(),width={f:4,d:8,l:8,i:4,b:1,c:1}[type];if(at+length>bytes.length||count*width>128*1024*1024)throw Error('FBX 배열 범위 오류');const raw=bytes.subarray(at,at+length);at+=length;const decoded=encoding===0?raw:encoding===1?inflateSync(raw,{maxOutputLength:128*1024*1024}):null;if(!decoded||decoded.length!==count*width)throw Error('FBX 배열이 완성되지 않았습니다.');return {array:count,hash:digest(decoded)};}throw Error('지원하지 않는 FBX property '+type);}}
 function node(depth=0){if(depth>100||++nodes>100000||at+header>bytes.length)throw Error('FBX node 범위 오류');const end=wide?u64():u32(),count=wide?u64():u32(),propertyLength=wide?u64():u32(),nameLength=bytes[at++];if(end===0){at+=nameLength;return null;}if(end>bytes.length||end<=at||count>100000)throw Error('FBX 저장 일부가 없습니다.');const name=bytes.subarray(at,at+nameLength).toString();at+=nameLength;const start=at,props=[];for(let i=0;i<count;i++)props.push(property());if(at-start!==propertyLength)throw Error('FBX property 길이 오류');const descendants=[];while(at<end){const next=node(depth+1);if(next)descendants.push(next);else break;}if(at!==end)throw Error('FBX node 종료 위치 오류');return {name,props,children:descendants};}
 const root={children:[]};while(at+header<=bytes.length){const n=node();if(!n)break;root.children.push(n);}return {root,version};
}
function asciiFBX(bytes){
 const text=bytes.toString('utf8');if(!/FBXHeaderExtension\s*:/.test(text))throw Error('FBX ASCII 헤더 누락');
 const tokens=text.match(/"(?:\\.|[^"\\])*"|;[^\r\n]*|[{}:,]|[^\s{}:,]+|\n/g)?.filter(t=>!t.startsWith(';'))||[];let i=0,total=0;
 const value=t=>t.startsWith('"')?t.slice(1,-1).replace(/\\"/g,'"'):Number.isFinite(Number(t))?Number(t):t;
 function block(depth=0){if(depth>100)throw Error('FBX 계층 깊이 오류');const out=[];while(i<tokens.length){while(tokens[i]==='\n')i++;if(tokens[i]==='}'){i++;return out;}if(i>=tokens.length)break;const name=tokens[i++];if(tokens[i++]!==':')throw Error('FBX ASCII 문법 오류');const props=[];let sub=[];while(i<tokens.length){const t=tokens[i];if(t==='{'){i++;sub=block(depth+1);break;}if(t==='\n'){i++;break;}if(t==='}')break;i++;if(t!==',')props.push(value(t));}out.push({name,props,children:sub});if(++total>100000)throw Error('FBX node 수 초과');}if(depth)throw Error('FBX 저장이 완료되지 않았습니다.');return out;}
 const root={children:block()};return {root,version:Number(one(one(root,'FBXHeaderExtension'),'FBXVersion')?.props[0])||0};
}
function fbx(bytes){
 const {root,version}=bytes.subarray(0,21).toString()==='Kaydara FBX Binary  \0'?binaryFBX(bytes):asciiFBX(bytes);
 if(version<7000||version>8000)throw Error('지원하지 않는 FBX 버전');const objects=one(root,'Objects'),connections=one(root,'Connections');if(!objects||!connections)throw Error('FBX Objects/Connections 누락');
 const models=children(objects,'Model'),geometries=children(objects,'Geometry').filter(n=>n.props[2]==='Mesh'),materials=children(objects,'Material');if(!geometries.length||!models.length)throw Error('FBX 메시가 없습니다.');
 const key=n=>String(n.props[1]||'').replace(/^.*?::/,'');const keys=new Map((objects.children||[]).map(n=>[String(n.props[0]),key(n)]));
 const props=n=>children(one(n,'Properties70'),'P').map(p=>[String(p.props[0]),p.props.slice(4)]);
 const important=/^(Lcl Translation|Lcl Rotation|Lcl Scaling|RotationOffset|RotationPivot|ScalingOffset|ScalingPivot|GeometricTranslation|GeometricRotation|GeometricScaling|PreRotation|PostRotation)$/;
 const frame=sorted(models.map(n=>({name:key(n),properties:sorted(props(n).filter(([name])=>important.test(name)))})));
 const materialIds=new Set(materials.map(n=>String(n.props[0]))),modelIds=new Set(models.map(n=>String(n.props[0])));
 const arrayInfo=n=>n?.props?.[0]?.array!==undefined?n.props[0]:{array:one(n,'a')?.props.length||0,hash:digest(Buffer.from(JSON.stringify(one(n,'a')?.props||[])))};
 const geometryShape=n=>({name:key(n),type:n.props[2],vertices:arrayInfo(one(n,'Vertices')).array,indices:arrayInfo(one(n,'PolygonVertexIndex')).array});
 const geometryBindings=geometries.map(n=>({name:key(n),layers:children(n,'LayerElementMaterial').map(l=>({mapping:one(l,'MappingInformationType')?.props,reference:one(l,'ReferenceInformationType')?.props,materials:arrayInfo(one(l,'Materials'))}))}));
 const links=children(connections,'C').filter(n=>n.props[0]==='OO').map(n=>({from:String(n.props[1]),to:String(n.props[2])}));
 return {format:'fbx',identity:sorted(models.map(n=>({name:key(n),type:n.props[2],parent:links.filter(l=>l.from===String(n.props[0])&&modelIds.has(l.to)).map(l=>keys.get(l.to))}))),frame,slots:{materials:materials.map(key),geometryBindings,binding:links.filter(l=>materialIds.has(l.from)).map(l=>[keys.get(l.from),keys.get(l.to)])},topology:sorted(geometries.map(geometryShape)),meshCount:geometries.length,materialCount:materials.length,units:sorted(props(one(root,'GlobalSettings')).filter(([name])=>/Axis|UnitScale/.test(name))),animated:children(objects,'AnimationCurve').length>0};
}
function texture(bytes,ext){
 if(ext==='psd')return {format:'psd',...inspectPsdHeader(bytes)};
 if(ext==='png'){if(bytes.length<33||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('PNG 헤더 오류');let i=8,complete=false;while(i+12<=bytes.length){const n=bytes.readUInt32BE(i),type=bytes.subarray(i+4,i+8).toString();if(i+12+n>bytes.length)throw Error('PNG 저장 일부가 없습니다.');i+=12+n;if(type==='IEND'){complete=true;break;}}if(!complete)throw Error('PNG IEND 누락');return {format:ext,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};}
 if(['jpg','jpeg'].includes(ext)){if(bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw Error('JPEG 저장이 완료되지 않았습니다.');return {format:'jpeg'};}
 if(ext==='webp'){if(bytes.subarray(0,4).toString()!=='RIFF'||bytes.subarray(8,12).toString()!=='WEBP'||bytes.readUInt32LE(4)+8!==bytes.length)throw Error('WebP 길이 오류');return {format:ext};}
 return null;
}
export function inspectAsset(bytes,ext){try{const summary=ext==='glb'?glb(bytes):ext==='fbx'?fbx(bytes):texture(bytes,ext);return summary?{status:'ok',hash:digest(bytes),summary}:{status:'unsupported',hash:digest(bytes),reason:'이 형식의 구조 자동 분석은 지원하지 않습니다.'};}catch(error){return {status:'error',hash:digest(bytes),reason:error.message};}}
export function classifyChange(before,after){
 if(after.status!=='ok')return {safe:false,reasons:[after.reason||'새 파일 구조를 확인하지 못했습니다.'],invalid:after.status==='error'};
 if(before.status!=='ok')return {safe:false,reasons:['이전 파일의 구조 정보가 없어 비교 확인이 필요합니다.']};
 const a=before.summary,b=after.summary,reasons=[];if(a.format!==b.format)reasons.push('파일 형식 변경');
 if(a.format==='psd')reasons.push('PSD 원본 변경: 기존 합성본을 보존하고 다시 합성해 확인하세요.');
 if(a.format==='glb'||a.format==='fbx'){if(stable(a.frame)!==stable(b.frame)||stable(a.units)!==stable(b.units))reasons.push('Pivot 또는 노드 Transform/단위 변경');if(stable(a.slots)!==stable(b.slots))reasons.push('Material Slot 또는 재질 연결 변경');if(stable(a.identity)!==stable(b.identity)||stable(a.topology)!==stable(b.topology))reasons.push('Mesh 구조 또는 계층 변경');if(a.animated||b.animated||a.extensions?.length||b.extensions?.length)reasons.push('애니메이션 또는 확장 구조는 수동 확인 필요');}
 return {safe:reasons.length===0,reasons:reasons.length?reasons:['호환되는 Mesh/UV 또는 Texture 내용 변경']};
}
