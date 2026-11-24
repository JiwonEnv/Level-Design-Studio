import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {referenceFrameSignature} from '../core/foundation/image-derivation.js';

const MAX_BYTES=48*1024*1024,MAX_LINE=Math.ceil(MAX_BYTES/3)*4+2*1024*1024,PREFIX='lds-photocraft-edit-';
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v),finite=v=>Number.isFinite(v)&&Math.abs(v)<=1e7;
const fail=message=>{throw Error(message);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function size(width,height){if(![width,height].every(v=>Number.isInteger(v)&&v>0&&v<=8192)||width*height>24000000)fail('이미지 편집은 각 변 8192픽셀·총 2400만 픽셀 이내에서 사용하세요.');}
function safeFolder(folder,root){const resolved=path.resolve(folder);if(path.dirname(resolved)!==root||!path.basename(resolved).startsWith(PREFIX))fail('이미지 편집 임시 위치가 올바르지 않습니다.');return resolved;}
async function boundedRead(file){const info=await stat(file);if(!info.isFile()||info.size>MAX_BYTES||info.size<1)fail('이미지 편집 파일은 48MB 이내여야 합니다.');const bytes=await readFile(file);if(bytes.length>MAX_BYTES)fail('이미지 편집 파일은 48MB 이내여야 합니다.');return bytes;}
function pngBytes(content,width,height){
 if(typeof content!=='string'||content.length>Math.ceil(MAX_BYTES/3)*4||content.length%4||/[^A-Za-z0-9+/=]/.test(content))fail('이미지 편집 결과를 확인하지 못했습니다.');
 const bytes=Buffer.from(content,'base64');if(bytes.length<33||bytes.length>MAX_BYTES||bytes.toString('base64')!==content||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.readUInt32BE(16)!==width||bytes.readUInt32BE(20)!==height)fail('이미지 편집 결과의 크기·형식이 올바르지 않습니다.');return bytes;
}

// The native inspect protocol omits locks. Read only the bounded JSON manifest,
// never extract archive paths or tiles. This keeps lock readback authoritative
// across native undo and saved-document reopening without mirroring engine state.
function nativeManifest(bytes){
 let eocd=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){eocd=i;break;}
 if(eocd<0||bytes.readUInt16LE(eocd+4)||bytes.readUInt16LE(eocd+6))fail('편집 원본 문서 형식을 확인하지 못했습니다.');
 const count=bytes.readUInt16LE(eocd+10),end=bytes.readUInt32LE(eocd+16)+bytes.readUInt32LE(eocd+12);let at=bytes.readUInt32LE(eocd+16);
 if(count>10000||end>eocd)fail('편집 원본 문서 목록이 올바르지 않습니다.');
 for(let i=0;i<count;i++){
  if(at+46>end||bytes.readUInt32LE(at)!==0x02014b50)fail('편집 원본 문서 목록이 손상됐습니다.');
  const compressed=bytes.readUInt32LE(at+20),length=bytes.readUInt32LE(at+24),nameLength=bytes.readUInt16LE(at+28),extra=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32),next=at+46+nameLength+extra+comment;
  if(next>end)fail('편집 원본 문서 목록이 손상됐습니다.');
  if(bytes.toString('utf8',at+46,at+46+nameLength)==='manifest.json'){
   const method=bytes.readUInt16LE(at+10),local=bytes.readUInt32LE(at+42);
   if(length>16*1024*1024||local+30>bytes.length||bytes.readUInt32LE(local)!==0x04034b50)fail('편집 원본 문서 정보가 너무 크거나 손상됐습니다.');
   const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);if(start+compressed>bytes.length)fail('편집 원본 문서 정보가 손상됐습니다.');
   const packed=bytes.subarray(start,start+compressed),json=method===0?packed:method===8?inflateRawSync(packed,{maxOutputLength:16*1024*1024}):null;
   if(!json||json.length!==length)fail('편집 원본 문서 압축 형식을 확인하지 못했습니다.');
   const manifest=JSON.parse(json.toString('utf8'));if(manifest.format_version!==1||!plain(manifest.document))fail('지원하지 않는 편집 원본 문서입니다.');return manifest;
  }at=next;
 }fail('편집 원본 문서 정보가 없습니다.');
}

function allowedParams(command,input){
 if(!plain(input))fail('이미지 편집 명령의 값을 확인하세요.');
 const p=structuredClone(input),keys=allowed=>{if(Object.keys(p).some(k=>!allowed.includes(k)))fail('지원하지 않는 이미지 편집 매개변수입니다.');};
 const num=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
 const id=v=>Number.isSafeInteger(v)&&v>0;
 const point=v=>Array.isArray(v)&&v.length===2&&finite(v[0])&&finite(v[1]);
 const color=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
 const name=v=>typeof v==='string'&&v.trim().length>0&&v.length<=200;
 const layer=()=>{if(p.layer!==undefined&&!id(p.layer))fail('레이어를 다시 선택하세요.');};
 const optional=(key,check)=>{if(p[key]!==undefined&&!check(p[key]))fail('이미지 편집 값이 올바르지 않습니다: '+key);};
 if(command==='paint.stroke'){
  keys(['points','size','hardness','opacity','flow','color','mode','erase','spacing','smoothing','zoom','seed']);
  if(!Array.isArray(p.points)||!p.points.length||p.points.length>25000||Array.from(p.points).some(v=>!Array.isArray(v)||v.length<2||v.length>3||!finite(v[0])||!finite(v[1])||v.length===3&&!num(v[2],0,1)))fail('브러시 한 획은 올바른 좌표 25000점 이내여야 합니다.');
  optional('size',v=>num(v,.5,5000));for(const key of ['hardness','opacity','flow','smoothing'])optional(key,v=>num(v,0,1));optional('spacing',v=>num(v,0,10));optional('zoom',v=>num(v,.01,100));optional('color',color);optional('mode',v=>['normal','clear'].includes(v));optional('erase',v=>typeof v==='boolean');optional('seed',v=>Number.isSafeInteger(v)&&v>=0);return p;
 }
 if(command==='shape.create'){
  keys(['kind','rect','fill','stroke','name','path','from','to','weight','sides']);if(!['rect','ellipse','line','path','polygon'].includes(p.kind))fail('지원하지 않는 이미지 도형입니다.');
  if(['rect','ellipse','polygon'].includes(p.kind)&&(!Array.isArray(p.rect)||p.rect.length!==4||!point(p.rect.slice(0,2))||!num(p.rect[2],.01,8192)||!num(p.rect[3],.01,8192)))fail('도형 범위를 확인하세요.');
  if(p.kind==='line'&&(!point(p.from)||!point(p.to)))fail('선의 시작과 끝을 확인하세요.');optional('weight',v=>num(v,.5,5000));optional('sides',v=>Number.isInteger(v)&&num(v,3,100));optional('fill',v=>v===null||color(v));optional('name',name);
  if(p.stroke!==undefined&&p.stroke!==null){const s=p.stroke;if(!plain(s)||Object.keys(s).some(k=>!['width','color','opacity','align','cap','join'].includes(k))||!num(s.width,.5,5000)||!color(s.color)||s.opacity!==undefined&&!num(s.opacity,0,100)||s.align!==undefined&&!['inside','center','outside'].includes(s.align)||s.cap!==undefined&&!['butt','round','square'].includes(s.cap)||s.join!==undefined&&!['miter','round','bevel'].includes(s.join))fail('도형 선의 두께·색상을 확인하세요.');}
  if(p.kind==='path'){const x=p.path;if(!plain(x)||Object.keys(x).some(k=>!['subpaths','fillRule','inverted'].includes(k))||!Array.isArray(x.subpaths)||!x.subpaths.length||x.subpaths.length>64)fail('경로 도형을 확인하세요.');let count=0;for(const s of Array.from(x.subpaths)){if(!plain(s)||Object.keys(s).some(k=>!['closed','knots','op'].includes(k))||typeof s.closed!=='boolean'||!Array.isArray(s.knots)||s.knots.length<2||(count+=s.knots.length)>25000||Array.from(s.knots).some(v=>!point(v))||s.op!==undefined&&!['combine','subtract','intersect','exclude'].includes(s.op))fail('경로 꼭짓점을 확인하세요.');}if(x.fillRule!==undefined&&!['nonzero','evenodd'].includes(x.fillRule)||x.inverted!==undefined&&typeof x.inverted!=='boolean')fail('경로 도형을 확인하세요.');}return p;
 }
 if(command==='layer.new.layer'){keys(['name','opacity','position']);optional('name',name);optional('opacity',v=>num(v,0,1));optional('position',v=>['above','below'].includes(v));return p;}
 if(['layer.duplicate','layer.delete','layer.select','layer.arrange.bringForward','layer.arrange.sendBackward'].includes(command)){keys(command==='layer.duplicate'?['layer','name']:['layer']);layer();optional('name',name);if(command==='layer.select'&&!id(p.layer))fail('레이어를 선택하세요.');return p;}
 if(command==='layer.setProps'){keys(['layer','name','visible','locked','opacity']);layer();optional('name',name);optional('visible',v=>typeof v==='boolean');optional('locked',v=>typeof v==='boolean');optional('opacity',v=>num(v,0,1));return p;}
 if(['edit.undo','edit.redo','select.deselect'].includes(command)){keys([]);return p;}
 if(['edit.copy','edit.cut'].includes(command)){keys(['layer']);layer();return p;}
 if(command==='edit.paste'){keys(['center','clampToCanvas','as']);optional('center',point);optional('clampToCanvas',v=>typeof v==='boolean');optional('as',v=>v==='pixels');return p;}
 if(command==='select.rect'){keys(['x','y','width','height','mode','ellipse','antiAlias','feather']);if(![p.x,p.y].every(v=>Number.isInteger(v)&&finite(v))||![p.width,p.height].every(v=>Number.isInteger(v)&&num(v,1,8192)))fail('선택 영역 범위를 확인하세요.');optional('mode',v=>['replace','add','subtract','intersect'].includes(v));for(const key of ['ellipse','antiAlias'])optional(key,v=>typeof v==='boolean');optional('feather',v=>num(v,0,8192));return p;}
 if(command==='edit.transform'){keys(['layer','scaleX','scaleY','rotate','dx','dy','reference','interpolation']);layer();for(const key of ['scaleX','scaleY'])optional(key,v=>num(v,1,10000));for(const key of ['rotate','dx','dy'])optional(key,finite);optional('reference',v=>v==='center'||point(v));optional('interpolation',v=>['bilinear','nearest','bicubic'].includes(v));return p;}
 fail('지원하지 않는 이미지 편집 명령입니다.');
}

export class PhotoCraftEditor{
 constructor({store,executable}){this.store=store;this.executable=executable;this.current=null;this.queue=Promise.resolve();}
 _enqueue(fn){const result=this.queue.then(fn);this.queue=result.catch(()=>{});return result;}
 async _source(request){const project=await this.store.project(request.projectId),reference=project.references.find(r=>r.id===request.referenceId),asset=reference&&project.assets[reference.assetId];if(!reference||!asset||asset.hash!==request.sourceHash||referenceFrameSignature(reference)!==request.signature)fail('원본 또는 이미지 배치가 변경됐습니다. 편집 창을 다시 여세요.');size(...reference.sourceSize);return {project,reference,asset};}
 _session(id){if(!this.current||this.current.id!==id||this.current.dead)fail('이미지 편집 세션이 종료됐습니다. 편집 창을 다시 여세요.');return this.current;}
 _start(s){
  const child=spawn(this.executable,['serve','--no-gpu','--automation-read-root',s.folder,'--automation-write-root',s.folder],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PHOTOCRAFT_CONTROL_PORT:''}});s.child=child;s.pending=new Map();s.serial=0;s.stderr='';let buffer='';
  const abort=()=>{s.dead=true;for(const p of s.pending.values()){clearTimeout(p.timer);p.reject(Error('이미지 편집 엔진이 종료됐습니다. 편집 창을 다시 여세요.'));}s.pending.clear();};
  child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buffer+=chunk;if(buffer.length>MAX_LINE){abort();child.kill();return;}let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);try{const message=JSON.parse(line),pending=s.pending.get(message.id);if(!pending)continue;s.pending.delete(message.id);clearTimeout(pending.timer);if(message.ok)pending.resolve(message.result);else pending.reject(Error(/locked/i.test(message.error||'')?'잠긴 레이어입니다. 잠금을 해제한 뒤 다시 시도하세요.':/clipboard|selection/i.test(message.error||'')?'선택 영역과 복사한 내용을 확인하세요.':'PhotoCraft 편집 작업을 완료하지 못했습니다. 입력값과 선택한 레이어를 확인하세요.'));}catch{abort();child.kill();}}});
  child.stderr.setEncoding('utf8');child.stderr.on('data',chunk=>{s.stderr=(s.stderr+chunk).slice(-8192);});child.on('error',abort);child.stdin.on('error',abort);s.exited=new Promise(resolve=>child.once('close',()=>{abort();resolve();}));
 }
 _request(s,method,params={}){if(s.dead)return Promise.reject(Error('이미지 편집 엔진이 종료됐습니다.'));return new Promise((resolve,reject)=>{const id=++s.serial,timer=setTimeout(()=>{s.pending.delete(id);reject(Error('이미지 편집 시간이 초과됐습니다. 편집 창을 다시 여세요.'));s.dead=true;s.child.kill();},60000);s.pending.set(id,{resolve,reject,timer});s.child.stdin.write(JSON.stringify({id,method,params})+'\n');});}
 async _view(s){
  const inspected=await this._request(s,'doc.inspect');if(inspected.width!==s.width||inspected.height!==s.height)fail('이미지 편집 중 문서 크기가 변경됐습니다.');
  await this._request(s,'doc.save',{path:'working.pcraft'});const native=await boundedRead(path.join(s.folder,'working.pcraft')),manifest=nativeManifest(native),locks=new Map();
  const collect=(layers,ancestor=false,depth=0)=>{if(!Array.isArray(layers)||depth>16)fail('편집 문서의 레이어 구조가 올바르지 않습니다.');for(const layer of layers){if(locks.size>=64)fail('이미지 편집은 최대 64개 레이어를 지원합니다.');const all=ancestor||!!layer.locks?.all;locks.set(layer.id,{...layer.locks,all});if(layer.content?.kind==='group')collect(layer.content.children,all,depth+1);}};collect(manifest.document.layers);
  const layers=[],flatten=rows=>{for(const layer of rows||[]){layers.push({id:layer.id,name:layer.name,kind:layer.kind,visible:layer.visible,locked:!!locks.get(layer.id)?.all,locks:locks.get(layer.id),opacity:layer.opacity});if(layer.children)flatten(layer.children);}};flatten(inspected.layers);
  const rendered=await this._request(s,'doc.render',{maxSide:0}),png=pngBytes(rendered.base64,s.width,s.height);s.state={layers,selectedLayerId:inspected.activeLayer,canUndo:!!inspected.canUndo,canRedo:!!inspected.canRedo};s.native=native;
  return {sessionId:s.id,state:structuredClone(s.state),png:png.toString('base64'),width:s.width,height:s.height};
 }
 open(request){return this._enqueue(async()=>{
  const {project,reference,asset}=await this._source(request);await this._dispose();if(typeof this.executable!=='string'||!path.isAbsolute(this.executable)||!await stat(this.executable).then(x=>x.isFile()).catch(()=>false))fail('PhotoCraft 이미지 편집 도구가 없습니다.');
  let selected=asset,ext=asset.ext?.toLowerCase();if(reference.derived?.operation?.type==='photocraft-edit'){const d=reference.derived;selected=project.assets[d.documentAssetId];if(!selected||selected.hash!==d.documentHash)fail('편집 가능한 원본 문서가 누락되거나 변경됐습니다.');ext='pcraft';}
  if(!['png','jpg','jpeg','webp','pcraft'].includes(ext))fail('이미지 편집은 PNG·JPG·WebP 자료에서 시작하세요.');const bytes=await boundedRead(await this.store.findBlob(selected.hash));if(hash(bytes)!==selected.hash)fail('원본 이미지 파일이 손상됐습니다.');if(ext==='pcraft')nativeManifest(bytes);
  const tempRoot=path.resolve(os.tmpdir()),folder=safeFolder(await mkdtemp(path.join(tempRoot,PREFIX)),tempRoot),s={id:randomUUID(),folder,tempRoot,width:reference.sourceSize[0],height:reference.sourceSize[1],source:structuredClone(request),dead:false};this.current=s;
  try{await writeFile(path.join(folder,'source.'+ext),bytes,{flag:'wx'});this._start(s);await this._request(s,'doc.open',{path:'source.'+ext});if(ext!=='pcraft')await this._request(s,'engine.execute',{command:'layer.new.layerFromBackground',params:{ifPresent:true}});return await this._view(s);}catch(error){await this._dispose();throw error;}
 });}
 command({sessionId,command,params={}}){return this._enqueue(async()=>{const s=this._session(sessionId),checked=allowedParams(command,params);if(['layer.new.layer','layer.duplicate','shape.create','edit.paste'].includes(command)&&s.state.layers.length>=64)fail('이미지 편집은 최대 64개 레이어를 지원합니다.');await this._request(s,'engine.execute',{command,params:checked});return this._view(s);});}
 export({sessionId}){return this._enqueue(async()=>{const s=this._session(sessionId);await this._source(s.source);const view=await this._view(s);return {content:view.png,documentContent:s.native.toString('base64'),width:s.width,height:s.height,state:view.state};});}
 close({sessionId}){return this._enqueue(async()=>{if(this.current?.id!==sessionId)return {closed:false};await this._dispose();return {closed:true};});}
 closeAll(){return this._enqueue(()=>this._dispose());}
 async _dispose(){const s=this.current;if(!s)return;this.current=null;try{if(s.child){s.child.stdin.end();let timer;await Promise.race([s.exited,new Promise(resolve=>{timer=setTimeout(()=>{s.child.kill();resolve();},2000);})]);clearTimeout(timer);}}finally{await rm(safeFolder(s.folder,s.tempRoot),{recursive:true,force:true});}}
}
