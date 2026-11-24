import test from 'node:test';
import assert from 'node:assert/strict';
import {geographicToLocal,localToGeographic,mapReferenceFrame,mercator,inverseMercator} from '../../core/foundation/geographic.js';
import {allowedApplicationRequest} from '../../desktop/network-policy.js';
test('geographic local coordinates preserve one project anchor across adjacent captures',()=>{
 const anchor=[126.978,37.5665],p=[126.979,37.567];const local=geographicToLocal(p,anchor);assert.ok(local[0]>88&&local[0]<89);assert.ok(local[1]>55&&local[1]<56);const restored=localToGeographic(local,anchor);assert.ok(Math.hypot(...restored.map((v,i)=>v-p[i]))<1e-10);
 const sw=[126.977,37.566],ne=inverseMercator(mercator(sw).map((v,i)=>v+[200,100][i]));const frame=mapReferenceFrame({west:sw[0],south:sw[1],east:ne[0],north:ne[1],width:800,height:400,anchor,zoom:17});assert.equal(frame.geo.crs,'EPSG:3857');assert.deepEqual(frame.geo.anchor,anchor);assert.deepEqual(frame.origin.slice(0,2),geographicToLocal(sw,anchor));assert.ok(Math.abs(frame.widthMeters-200*Math.cos(anchor[1]*Math.PI/180))<1e-8);assert.equal(frame.geo.metresPerPixel,frame.widthMeters/800);
});
test('map frame rejects world wrap, broad ranges, remote anchor and non-planar captures',()=>{
 const base={west:126.97,south:37.56,east:126.98,north:37.57,width:800,height:400,anchor:[126.975,37.565],zoom:16};assert.throws(()=>mapReferenceFrame(base),/비율/);assert.throws(()=>mapReferenceFrame({...base,east:128}),/10km/);assert.throws(()=>mapReferenceFrame({...base,west:179.9,east:-179.9}),/범위/);assert.throws(()=>mapReferenceFrame({...base,anchor:[0,0]}),/기준 위치/);assert.throws(()=>mercator([0,90]),/위도/);
});
test('desktop only allows exact OSM raster requests in addition to private app resources',()=>{
 for(const u of ['studio://app/','studio://app/api/state','https://tile.openstreetmap.org/16/55884/25343.png','blob:studio://app/id','data:image/png;base64,'])assert.equal(allowedApplicationRequest(u),true,u);
 for(const u of ['https://example.com/1/2/3.png','https://tile.openstreetmap.org.evil.test/1/2/3.png','https://tile.openstreetmap.org/style.json','https://tile.openstreetmap.org/1/2/3.png?token=secret','https://user@tile.openstreetmap.org/1/2/3.png','http://tile.openstreetmap.org/1/2/3.png','studio://app.evil/','file:///C:/file'])assert.equal(allowedApplicationRequest(u),false,u);
});
