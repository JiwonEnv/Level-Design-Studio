import test from 'node:test';
import assert from 'node:assert/strict';
import {createRasterDocument,validateRasterDocument,rasterDerivedFrame,rasterLayerToImage,rasterImageToLayer} from '../../core/foundation/raster-edit.js';
import {referenceToWorld} from '../../core/scene-model.js';

const reference=()=>({id:'source-ref',assetId:'original-asset',sourceSize:[100,50],widthMeters:200,origin:[12,34,0],rotation:37,opacity:.7,scaleConfirmed:true});
const stroke=()=>({type:'brush',points:[[1,2],[7,9]],size:4,color:'#aAbB00'});

test('raster edit starts as an editable source copy and reopens without mutating source',()=>{
 const ref=reference(),before=structuredClone(ref),a=createRasterDocument(ref),b=createRasterDocument(ref);
 assert.deepEqual(ref,before);assert.equal(a.layers.length,1);assert.equal(a.layers[0].source,true);assert.equal(a.layers[0].locked,false);assert.deepEqual(a.layers[0].commands,[]);assert.notEqual(a.layers[0].id,b.layers[0].id);
 a.layers[0].commands.push(stroke());const frame=rasterDerivedFrame(ref,{hash:'original-hash'},a),saved={...ref,...frame,id:'derived-ref',assetId:'flattened-asset'};
 const reopened=createRasterDocument(saved);assert.deepEqual(reopened,a);reopened.layers[0].commands[0].points[0][0]=90;
 assert.equal(saved.derived.operation.document.layers[0].commands[0].points[0][0],1);assert.equal(a.layers[0].commands[0].points[0][0],1);
});

test('pixel edits preserve calibrated rotated map coordinates and immutable provenance',()=>{
 const ref={...reference(),scaleConfirmed:undefined,geo:{anchor:[127,37],bounds:[126,36,128,38],crs:'EPSG:3857'},calibration:{pixels:50,metres:100}},before=structuredClone(ref),doc=createRasterDocument(ref);
 const frame=rasterDerivedFrame(ref,{hash:'original-hash'},doc);assert.deepEqual(ref,before);assert.equal(frame.scaleConfirmed,true);assert.deepEqual(frame.geo,ref.geo);assert.deepEqual(frame.calibration,ref.calibration);
 for(const point of [[0,0],[100,50],[12,21]])assert.deepEqual(referenceToWorld(frame,point),referenceToWorld(ref,point));
 frame.geo.anchor[0]=0;frame.calibration.metres=7;assert.equal(ref.geo.anchor[0],127);assert.equal(ref.calibration.metres,100);
 assert.equal(rasterDerivedFrame({...reference(),scaleConfirmed:false},{hash:'h'},doc).scaleConfirmed,false);
});

test('repeated raster edits keep original backing asset lineage without nested documents',()=>{
 const ref=reference(),doc=createRasterDocument(ref),first=rasterDerivedFrame(ref,{hash:'original-hash'},doc);
 const secondRef={...ref,...first,id:'derived-ref',assetId:'flattened-asset'},second=rasterDerivedFrame(secondRef,{hash:'flattened-hash'},createRasterDocument(secondRef));
 assert.equal(second.derived.sourceReferenceId,ref.id);assert.equal(second.derived.sourceAssetId,ref.assetId);assert.equal(second.derived.sourceHash,'original-hash');
 assert.equal(second.derived.sourceFrame.id,'derived-ref');assert.equal(second.derived.sourceFrame.assetId,'flattened-asset');assert.equal(second.derived.sourceFrame.derived,undefined);
 assert.deepEqual(Object.keys(second.derived.sourceFrame).sort(),['assetId','id','origin','rotation','sourceSize','widthMeters']);
});

test('document validation preserves drawing commands, permits clipped strokes and defaults omitted offsets',()=>{
 const doc=createRasterDocument(reference()),layer=doc.layers[0];delete layer.offsetX;delete layer.offsetY;
 layer.commands=[stroke(),{...stroke(),type:'eraser',points:[[-100,70]]},{type:'rect',x:-10,y:2,width:30,height:20,color:'#ff0000'},{type:'ellipse',x:2,y:3,width:4,height:5,color:'#000000'},{type:'clear-rect',x:1,y:2,width:30,height:40}];
 const validated=validateRasterDocument(doc);assert.equal(validated.layers[0].offsetX,0);assert.equal(layer.offsetX,undefined);assert.deepEqual(validated.layers[0].commands,layer.commands);
 validated.layers[0].commands[0].points[0][0]=800;assert.equal(layer.commands[0].points[0][0],1);
});

test('source-copy layers can erase original pixels independently while ordinary layers remain transparent',()=>{
 const ref=reference(),doc=createRasterDocument(ref),original=structuredClone(ref);
 doc.layers[0].commands.push({...stroke(),type:'eraser'});
 doc.layers.push({...structuredClone(doc.layers[0]),id:'source-copy'});
 doc.layers.push({id:'transparent',name:'빈 레이어',visible:true,locked:false,opacity:1,commands:[]});
 const validated=validateRasterDocument(doc);
 assert.equal(validated.layers[0].source,true);assert.equal(validated.layers[1].source,true);assert.equal(validated.layers[2].source,false);
 assert.equal(doc.layers[2].source,undefined);assert.deepEqual(ref,original);
 assert.deepEqual(createRasterDocument({...ref,derived:{operation:{type:'raster-edit',document:validated}}}),validated);
 doc.layers[2].source='yes';assert.throws(()=>validateRasterDocument(doc),/원본 편집 레이어/);
 doc.layers[2].source=null;assert.throws(()=>validateRasterDocument(doc),/원본 편집 레이어/);
});

test('sparse arrays and null numeric offsets cannot pass validation and become invalid after JSON save',()=>{
 const variants=[d=>d.layers=Array(1),d=>d.layers[0].commands=Array(1),d=>d.layers[0].commands=[{...stroke(),points:Array(1)}],d=>d.layers[0].commands=[{...stroke(),points:[Array(2)]}],d=>d.layers[0].offsetX=null];
 for(const mutate of variants){const doc=createRasterDocument(reference());mutate(doc);assert.throws(()=>validateRasterDocument(doc),/이미지 편집 문서/);}
});

test('malformed documents and invalid command values fail before rendering or saving',()=>{
 const check=mutate=>{const doc=createRasterDocument(reference());mutate(doc);assert.throws(()=>validateRasterDocument(doc),/이미지 편집 문서/);};
 for(const invalid of [null,[],{}, {version:2,width:100,height:50,layers:[]}])assert.throws(()=>validateRasterDocument(invalid));
 for(const mutate of [d=>d.width=0,d=>d.height=1.5,d=>d.width=8193,d=>{d.width=6000;d.height=5000;},d=>d.layers[0].visible=1,d=>d.layers[0].locked='yes',d=>d.layers[0].opacity=1.01,d=>d.layers[0].offsetX=Infinity,d=>d.layers[0].id='',d=>d.layers.push(structuredClone(d.layers[0])),d=>d.layers[0].commands=[{type:'arbitrary'}],d=>d.layers[0].commands=[{...stroke(),size:0}],d=>d.layers[0].commands=[{...stroke(),color:'red'}],d=>d.layers[0].commands=[{...stroke(),points:[[NaN,1]]}],d=>d.layers[0].commands=[{...stroke(),points:[[1e8,1]]}],d=>d.layers[0].commands=[{type:'clear-rect',x:0,y:0,width:-1,height:5}]])check(mutate);
 const mismatched=createRasterDocument(reference());mismatched.width=99;assert.throws(()=>rasterDerivedFrame(reference(),{hash:'h'},mismatched),/크기/);
 assert.throws(()=>createRasterDocument({...reference(),derived:{operation:{type:'raster-edit',document:mismatched}}}),/크기/);
});

test('shared limits bound all layers, commands and brush points rather than each individual layer',()=>{
 const doc=createRasterDocument(reference()),base=doc.layers[0];
 doc.layers=Array.from({length:65},(_,i)=>({...structuredClone(base),id:'layer-'+i}));assert.throws(()=>validateRasterDocument(doc),/64/);
 doc.layers=[{...base,commands:Array.from({length:3000},stroke)},{...base,id:'two',commands:Array.from({length:2001},stroke)}];assert.throws(()=>validateRasterDocument(doc),/5000/);
 doc.layers=[{...base,commands:[{...stroke(),points:Array.from({length:125000},()=>[0,0])}]},{...base,id:'two',commands:[{...stroke(),points:Array.from({length:125001},()=>[0,0])}]}];assert.throws(()=>validateRasterDocument(doc),/25만/);
});

const closePoint=(actual,expected)=>actual.forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<1e-7,`${actual} differs from ${expected}`));
test('layer transforms use document center, anisotropic scale then clockwise rotation then translation',()=>{
 const size=[100,50],layer={offsetX:7,offsetY:-3,rotation:90,scaleX:2,scaleY:.5},before=structuredClone(layer);
 closePoint(rasterLayerToImage(layer,[60,25],size),[57,42]);
 closePoint(rasterLayerToImage(layer,[50,45],size),[47,22]);
 closePoint(rasterLayerToImage(layer,[50,25],size),[57,22]);
 for(const point of [[0,0],[100,50],[9.5,21.2],[-400,90]])closePoint(rasterImageToLayer(layer,rasterLayerToImage(layer,point,size),size),point);
 assert.deepEqual(layer,before);closePoint(rasterLayerToImage({},[23,31],size),[23,31]);
});

test('transform extremes remain invertible and reject invalid matrices and points',()=>{
 for(const layer of [{rotation:37,scaleX:.01,scaleY:100,offsetX:1e7,offsetY:-1e7},{rotation:-450,scaleX:100,scaleY:.01}]){
  for(const point of [[0,0],[100,50],[9,21]])closePoint(rasterImageToLayer(layer,rasterLayerToImage(layer,point,[100,50]),[100,50]),point);
 }
 for(const layer of [{scaleX:0},{scaleY:-1},{scaleX:100.01},{scaleY:.009},{rotation:Infinity},{rotation:null},{offsetX:NaN}]){
  assert.throws(()=>rasterLayerToImage(layer,[1,2],[100,50]),/이미지 편집 문서/);assert.throws(()=>rasterImageToLayer(layer,[1,2],[100,50]),/이미지 편집 문서/);
 }
 assert.throws(()=>rasterLayerToImage({},[1,2]),/크기/);assert.throws(()=>rasterImageToLayer({},[NaN,2],[100,50]),/좌표/);assert.throws(()=>rasterLayerToImage({},Array(2),[100,50]),/좌표/);
});

test('version-1 documents retain optional transform defaults and selection transfers without changing inputs',()=>{
 const doc=createRasterDocument(reference()),layer=doc.layers[0];delete layer.rotation;delete layer.scaleX;delete layer.scaleY;
 layer.commands=[{type:'selection-transfer',x:-10,y:0,width:100,height:50,dx:12,dy:-5,copy:false},{type:'selection-transfer',x:30,y:15,width:10,height:8,dx:4,dy:6,copy:true}];
 const before=structuredClone(doc),validated=validateRasterDocument(doc);assert.deepEqual(doc,before);assert.equal(validated.version,1);assert.equal(validated.layers[0].rotation,0);assert.equal(validated.layers[0].scaleX,1);assert.equal(validated.layers[0].scaleY,1);assert.deepEqual(validated.layers[0].commands,layer.commands);
 const frame=rasterDerivedFrame(reference(),{hash:'original-hash'},validated),reopened=createRasterDocument({...reference(),...frame});assert.deepEqual(reopened,validated);
 reopened.layers[0].commands[0].dx=900;assert.equal(frame.derived.operation.document.layers[0].commands[0].dx,12);
 for(const change of [{x:.2},{y:Infinity},{width:101},{height:51},{width:0},{dx:1e7+1},{dy:.5},{copy:1}]){
  const invalid=structuredClone(doc);Object.assign(invalid.layers[0].commands[0],change);assert.throws(()=>validateRasterDocument(invalid),/선택 영역/);
 }
 for(const transform of [{scaleX:0},{scaleY:null},{rotation:1e7+1}]){const invalid=structuredClone(doc);Object.assign(invalid.layers[0],transform);assert.throws(()=>validateRasterDocument(invalid),/레이어/);}
});
