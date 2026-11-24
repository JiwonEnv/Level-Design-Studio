import test from 'node:test';
import assert from 'node:assert/strict';
import {mapRangePixels} from '../../src/map-range.js';
import {localToGeographic,mapReferenceFrame} from '../../core/foundation/geographic.js';

const canvas=(width=1001,height=601,cssWidth=500.5,cssHeight=300.5)=>({width,height,getBoundingClientRect:()=>({width:cssWidth,height:cssHeight})});

test('map capture keeps the whole physical canvas when no range is selected',()=>{
 assert.deepEqual(mapRangePixels(canvas()),{sx:0,sy:0,width:1001,height:601,corners:[[0,0],[500.5,300.5]]});
});

test('fractional CSS selection covers complete device pixels and uses those exact edges for geography',()=>{
 const pixels=mapRangePixels(canvas(),{x:10.25,y:20.25,width:100.1,height:70.1});
 assert.deepEqual(pixels,{sx:20,sy:40,width:201,height:141,corners:[[10,20],[110.5,90.5]]});
 const anchor=[126.978,37.5665],unproject=([x,y])=>localToGeographic([-500+x*2,300-y*2],anchor),nw=unproject(pixels.corners[0]),se=unproject(pixels.corners[1]);
 const frame=mapReferenceFrame({west:nw[0],north:nw[1],east:se[0],south:se[1],width:pixels.width,height:pixels.height,anchor,zoom:17});
 assert.deepEqual(frame.sourceSize,[201,141]);
 assert.ok(Math.abs(frame.widthMeters-201)<1e-7);
 assert.ok(Math.abs(frame.geo.metresPerPixel-1)<1e-9);
 assert.ok(Math.abs(frame.origin[0]+480)<1e-7);
 assert.ok(Math.abs(frame.origin[1]-119)<1e-7);
});

test('map selection is clipped at canvas edges and rejects empty or unavailable viewports',()=>{
 assert.deepEqual(mapRangePixels(canvas(),{x:-5,y:-5,width:20,height:20}),{sx:0,sy:0,width:30,height:30,corners:[[0,0],[15,15]]});
 assert.deepEqual(mapRangePixels(canvas(),{x:490,y:290,width:100,height:100}),{sx:980,sy:580,width:21,height:21,corners:[[490,290],[500.5,300.5]]});
 assert.throws(()=>mapRangePixels(canvas(),{x:0,y:0,width:0,height:0}),/범위/);
 assert.throws(()=>mapRangePixels(canvas(),{x:600,y:0,width:10,height:10}),/범위/);
 assert.throws(()=>mapRangePixels(canvas(1001,601,0,0)),/화면 크기/);
});
