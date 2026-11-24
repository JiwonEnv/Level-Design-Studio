import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {deflateSync,inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {inspectPsdHeader,flattenPsd} from '../../infrastructure/psd-import.js';

function header({version=1,channels=4,width=3,height=2,depth=8,colorMode=3}={}){
 const b=Buffer.alloc(26);b.write('8BPS');b.writeUInt16BE(version,4);b.writeUInt16BE(channels,12);b.writeUInt32BE(height,14);b.writeUInt32BE(width,18);b.writeUInt16BE(depth,22);b.writeUInt16BE(colorMode,24);return b;
}
test('PSD header identifies supported RGB8 dimensions without modifying source bytes',()=>{
 const input=header(),before=Buffer.from(input);assert.deepEqual(inspectPsdHeader(input),{version:1,width:3,height:2,channels:4,depth:8,colorMode:3,mode:'RGB8'});assert.deepEqual(input,before);
 assert.equal(inspectPsdHeader(header({channels:3})).channels,3);
 assert.equal(inspectPsdHeader(new Uint8Array(input)).width,3);
});
test('unsupported PSD formats and impossible dimensions are rejected before conversion',()=>{
 for(const [bytes,reason] of [[Buffer.alloc(25),/26바이트/],[Buffer.alloc(48*1024*1024+1),/48MB/],[header({version:2}),/PSB/],[header({version:0}),/버전 1/],[header({colorMode:4}),/RGB/],[header({depth:16}),/8비트/],[header({depth:32}),/8비트/],[header({channels:5}),/3채널/],[header({width:0}),/크기/],[header({height:8193}),/8192/],[header({width:6000,height:5000}),/2400만/]])assert.throws(()=>inspectPsdHeader(bytes),reason);
 const badMagic=header();badMagic[0]=0;assert.throws(()=>inspectPsdHeader(badMagic),/서명/);
 const highBitMagic=header();highBitMagic[0]|=128;assert.throws(()=>inspectPsdHeader(highBitMagic),/서명/);
 const reserved=header();reserved[8]=1;assert.throws(()=>inspectPsdHeader(reserved),/헤더/);
 assert.throws(()=>inspectPsdHeader('8BPS'),/26바이트/);
});
test('base64 decoding is strict and invalid inputs cannot launch a converter',async()=>{
 for(const content of ['',null,'AAAA\n',header().toString('base64')+' ', 'AB==','data:image/psd;base64,AAAA'])await assert.rejects(flattenPsd({executable:'missing',content}),/데이터/);
 await assert.rejects(flattenPsd({executable:'relative.exe',content:header().toString('base64')}),/도구/);
});

function crc32(bytes){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;}
function chunk(type,data){const label=Buffer.from(type),body=Buffer.concat([label,data]),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);body.copy(out,4);out.writeUInt32BE(crc32(body),out.length-4);return out;}
function fixturePng(){const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(3);ihdr.writeUInt32BE(2,4);ihdr[8]=8;ihdr[9]=6;const row=Buffer.from([0,255,0,0,255,0,255,0,255,0,0,255,255]);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.concat([row,row]))),chunk('IEND',Buffer.alloc(0))]);}
function pixels(png){
 const depth=png[24],color=png[25],channels=color===6?4:color===2?3:0;assert.equal(depth,8);assert.ok(channels,'Expected RGB/RGBA PNG');const parts=[];for(let i=8;i<png.length;){const length=png.readUInt32BE(i);if(png.toString('ascii',i+4,i+8)==='IDAT')parts.push(png.subarray(i+8,i+8+length));i+=length+12;}
 const raw=inflateSync(Buffer.concat(parts)),width=png.readUInt32BE(16),height=png.readUInt32BE(20),stride=width*channels,decoded=Buffer.alloc(stride*height);let at=0;
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const filter=raw[at++];assert.ok(filter<=4);for(let x=0;x<stride;x++){const a=x>=channels?decoded[y*stride+x-channels]:0,b=y?decoded[(y-1)*stride+x]:0,c=y&&x>=channels?decoded[(y-1)*stride+x-channels]:0;decoded[y*stride+x]=(raw[at++]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;}}
 return Array.from({length:width*height},(_,i)=>[...decoded.subarray(i*channels,i*channels+3)]);
}
const executable=fileURLToPath(new URL('../../../.tools/photocraft-0.23.1/photocraft-cli.exe',import.meta.url)),hasTool=process.platform==='win32'&&await stat(executable).then(s=>s.isFile()).catch(()=>false);
test('real PhotoCraft PNG→PSD→flattened PNG preserves RGB pixels and immutable original PSD', {skip:!hasTool,timeout:70000},async()=>{
 const tempRoot=path.resolve(os.tmpdir()),folder=await mkdtemp(path.join(tempRoot,'lds-psd-test-'));
 try{
  const pngPath=path.join(folder,'fixture.png'),psdPath=path.join(folder,'fixture.psd');await writeFile(pngPath,fixturePng());
  await promisify(execFile)(executable,['convert',pngPath,psdPath,'--no-gpu'],{windowsHide:true,timeout:60000,maxBuffer:1024*1024});
  const original=await readFile(psdPath),hash=createHash('sha256').update(original).digest('hex');assert.equal(inspectPsdHeader(original).mode,'RGB8');
  const result=await flattenPsd({executable,content:original.toString('base64')});assert.equal(result.width,3);assert.equal(result.height,2);assert.deepEqual(result.engine,{name:'PhotoCraft',version:'0.23.1'});assert.equal(result.mode,'RGB8');
  assert.deepEqual(pixels(Buffer.from(result.content,'base64')),[[255,0,0],[0,255,0],[0,0,255],[255,0,0],[0,255,0],[0,0,255]]);
  assert.equal(createHash('sha256').update(await readFile(psdPath)).digest('hex'),hash);
  await assert.rejects(flattenPsd({executable,content:header().toString('base64')}),/합성하지 못했습니다/);
 }finally{const resolved=path.resolve(folder);if(path.dirname(resolved)===tempRoot&&path.basename(resolved).startsWith('lds-psd-test-'))await rm(resolved,{recursive:true,force:true});}
});
