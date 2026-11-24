import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {deflateSync,inflateSync} from 'node:zlib';
import {PhotoCraftEditor} from '../../infrastructure/photocraft-session.js';
import {referenceFrameSignature} from '../../core/foundation/image-derivation.js';

const hash=b=>createHash('sha256').update(b).digest('hex');
const executable=fileURLToPath(new URL('../../../.tools/photocraft-0.23.1/photocraft-cli.exe',import.meta.url));
const hasTool=process.platform==='win32'&&await stat(executable).then(s=>s.isFile()).catch(()=>false);
function crc32(bytes){let v=0xffffffff;for(const b of bytes){v^=b;for(let i=0;i<8;i++)v=(v>>>1)^((v&1)?0xedb88320:0);}return (v^0xffffffff)>>>0;}
function chunk(type,data){const body=Buffer.concat([Buffer.from(type),data]),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);body.copy(out,4);out.writeUInt32BE(crc32(body),out.length-4);return out;}
function sourcePng(){const h=Buffer.alloc(13);h.writeUInt32BE(80);h.writeUInt32BE(64,4);h[8]=8;h[9]=6;const raw=Buffer.alloc(64*(80*4+1));for(let y=8;y<30;y++)for(let x=8;x<30;x++){const offset=y*(80*4+1)+1+x*4;raw[offset]=255;raw[offset+3]=255;}return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
function decode(content){
 const b=Buffer.from(content,'base64'),width=b.readUInt32BE(16),height=b.readUInt32BE(20),channels=b[25]===6?4:3;assert.equal(b[24],8);const parts=[];for(let i=8;i<b.length;){const n=b.readUInt32BE(i);if(b.toString('ascii',i+4,i+8)==='IDAT')parts.push(b.subarray(i+8,i+8+n));i+=n+12;}
 const raw=inflateSync(Buffer.concat(parts)),stride=width*channels,out=Buffer.alloc(stride*height);let at=0;const paeth=(a,b,c)=>{const p=a+b-c,A=Math.abs(p-a),B=Math.abs(p-b),C=Math.abs(p-c);return A<=B&&A<=C?a:B<=C?b:c;};for(let y=0;y<height;y++){const f=raw[at++];assert.ok(f<=4);for(let x=0;x<stride;x++){const a=x>=channels?out[y*stride+x-channels]:0,b=y?out[(y-1)*stride+x]:0,c=y&&x>=channels?out[(y-1)*stride+x-channels]:0;out[y*stride+x]=(raw[at++]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][f])&255;}}
 return {width,height,data:out,pixel:(x,y)=>{const p=[...out.subarray((y*width+x)*channels,(y*width+x+1)*channels)];return channels===4?p:[...p,255];}};
}

test('PhotoCraft sessions reject stale sources before starting an executable',async()=>{
 const reference={id:'source',assetId:'image',sourceSize:[80,64]},project={references:[reference],assets:{image:{hash:'hash',ext:'png'}}},store={project:async()=>structuredClone(project)},editor=new PhotoCraftEditor({store,executable:'missing'});
 await assert.rejects(editor.open({projectId:'p',referenceId:'source',sourceHash:'changed',signature:referenceFrameSignature(reference)}),/원본/);
 await assert.rejects(editor.open({projectId:'p',referenceId:'source',sourceHash:'hash',signature:'wrong'}),/배치/);
 project.references[0].sourceSize=[8193,1];await assert.rejects(editor.open({projectId:'p',referenceId:'source',sourceHash:'hash',signature:referenceFrameSignature(project.references[0])}),/8192/);
 await editor.closeAll();
});

test('real PhotoCraft owns pixels, vector outlines, layers, native history and persistent editable documents',{skip:!hasTool,timeout:70000},async()=>{
 const tempRoot=path.resolve(os.tmpdir()),folder=await mkdtemp(path.join(tempRoot,'lds-photocraft-test-')),blobs=new Map(),source=sourcePng(),sourceHash=hash(source),reference={id:'source-reference',assetId:'source-image',sourceSize:[80,64],widthMeters:160,origin:[12,34,0],rotation:15,opacity:.65,scaleConfirmed:true};
 const project={id:'project',references:[reference],assets:{'source-image':{id:'source-image',hash:sourceHash,ext:'png'}}},original=structuredClone(project),put=async bytes=>{const key=hash(bytes),file=path.join(folder,key);await writeFile(file,bytes);blobs.set(key,file);return key;};await put(source);
 const store={project:async()=>structuredClone(project),findBlob:async key=>{if(!blobs.has(key))throw Error('missing blob');return blobs.get(key);}},editor=new PhotoCraftEditor({store,executable}),request={projectId:project.id,referenceId:reference.id,sourceHash,signature:referenceFrameSignature(reference)};let opened;
 try{
  opened=await editor.open(request);const sessionId=opened.sessionId,base=opened.state.selectedLayerId,cmd=(command,params={})=>editor.command({sessionId,command,params});
  assert.deepEqual(decode(opened.png).pixel(20,20),[255,0,0,255]);assert.equal(opened.width,80);assert.equal(opened.height,64);
  let view=await cmd('paint.stroke',{points:[[20,20]],size:10,hardness:1,flow:1,opacity:1,mode:'clear',seed:1});assert.equal(decode(view.png).pixel(20,20)[3],0);
  view=await cmd('edit.undo');assert.deepEqual(decode(view.png).pixel(20,20),[255,0,0,255]);view=await cmd('edit.redo');assert.equal(decode(view.png).pixel(20,20)[3],0);
  view=await cmd('layer.new.layer',{name:'Sketch'});const sketch=view.state.selectedLayerId;
  view=await cmd('paint.stroke',{points:[[10,42],[65,42]],size:8,hardness:1,flow:1,opacity:1,color:'#0000ff',seed:1});assert.deepEqual(decode(view.png).pixel(40,42),[0,0,255,255]);
  view=await cmd('shape.create',{kind:'rect',rect:[40,8,24,24],fill:null,stroke:{width:4,color:'#00ff00',opacity:100,align:'center'},name:'Hollow rectangle'});const rect=view.state.selectedLayerId,pixels=decode(view.png);assert.deepEqual(pixels.pixel(40,20),[0,255,0,255]);assert.equal(pixels.pixel(52,20)[3],0);assert.ok(pixels.pixel(40,8)[1]>240);assert.equal(view.state.layers.find(l=>l.id===rect).kind,'Shape');
  view=await cmd('layer.setProps',{layer:rect,locked:true,opacity:.5});assert.equal(view.state.layers.find(l=>l.id===rect).locked,true);assert.equal(view.state.layers.find(l=>l.id===rect).opacity,.5);
  await assert.rejects(cmd('edit.transform',{layer:rect,dx:5,dy:0}),/잠긴/);
  view=await cmd('edit.undo');assert.equal(view.state.layers.find(l=>l.id===rect).locked,false);assert.equal(view.state.layers.find(l=>l.id===rect).opacity,1);view=await cmd('edit.redo');assert.equal(view.state.layers.find(l=>l.id===rect).locked,true);
  view=await cmd('layer.select',{layer:sketch});view=await cmd('layer.setProps',{layer:sketch,visible:false});assert.equal(view.state.layers.find(l=>l.id===sketch).visible,false);view=await cmd('layer.setProps',{layer:sketch,visible:true});
  const beforeInvalid=view.png;await assert.rejects(cmd('file.open',{path:'C:/private'}),/지원하지 않는/);await assert.rejects(cmd('paint.stroke',{points:[[1,2]],path:'C:/private'}),/매개변수/);await assert.rejects(cmd('paint.stroke',{points:Array.from({length:25001},()=>[1,2])}),/25000/);await assert.rejects(cmd('paint.stroke',{points:[[1,2]],size:Infinity}),/size/);
  const exported=await editor.export({sessionId});assert.deepEqual(decode(exported.content).data,decode(beforeInvalid).data);assert.equal(Buffer.from(exported.documentContent,'base64').readUInt32LE(0),0x04034b50);assert.deepEqual(project,original);assert.equal(hash(await readFile(blobs.get(sourceHash))),sourceHash);
  const documentHash=await put(Buffer.from(exported.documentContent,'base64')),flatHash=await put(Buffer.from(exported.content,'base64'));project.assets.document={id:'document',ext:'pcraft',hash:documentHash};project.assets.flattened={id:'flattened',ext:'png',hash:flatHash};const derived={...reference,id:'derived-reference',assetId:'flattened',derived:{documentAssetId:'document',documentHash,operation:{type:'photocraft-edit'}}};project.references.push(derived);
  const reopened=await editor.open({projectId:project.id,referenceId:derived.id,sourceHash:flatHash,signature:referenceFrameSignature(derived)});assert.notEqual(reopened.sessionId,sessionId);assert.equal((await editor.close({sessionId})).closed,false);assert.deepEqual(decode(reopened.png).data,decode(exported.content).data);assert.deepEqual(reopened.state.layers.map(l=>[l.id,l.name,l.kind,l.visible,l.locked,l.opacity]),exported.state.layers.map(l=>[l.id,l.name,l.kind,l.visible,l.locked,l.opacity]));
  const command=editor.command({sessionId:reopened.sessionId,command:'layer.select',params:{layer:base}}),close=editor.close({sessionId:reopened.sessionId});await command;assert.equal((await close).closed,true);await assert.rejects(editor.command({sessionId:reopened.sessionId,command:'edit.undo'}),/종료/);
 }finally{await editor.closeAll();const resolved=path.resolve(folder);if(path.dirname(resolved)===tempRoot&&path.basename(resolved).startsWith('lds-photocraft-test-'))await rm(resolved,{recursive:true,force:true});}
});
