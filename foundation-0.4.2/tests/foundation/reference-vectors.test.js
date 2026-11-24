import test from 'node:test';
import assert from 'node:assert/strict';
import {newDocument} from '../../core/foundation/document.js';
import {localToGeographic} from '../../core/foundation/geographic.js';
import {normalizeReferenceVectorLayer,saveReferenceVectorLayer} from '../../core/foundation/reference-vectors.js';

const line={type:'Feature',id:'line-1',geometry:{type:'LineString',coordinates:[[0,0],[.001,0]]},properties:{mode:'linestring',selected:true}};
const payload=()=>({version:1,id:'layer-1',name:'지도 측정',anchor:[0,0],features:[structuredClone(line)]});

test('real Turf measures a geodesic line in meters and ignores injected measurement values',()=>{
 const input=payload();input.measurements=[{id:'line-1',lengthMeters:9999}];const layer=normalizeReferenceVectorLayer(input);
 assert.ok(Math.abs(layer.measurements[0].lengthMeters-111.19508023353292)<1e-8);
 assert.equal(layer.measurements[0].areaSquareMeters,0);assert.equal(layer.sourceEngine.measurement,'Turf.js');
 assert.deepEqual(layer.features[0].properties,{mode:'linestring'});layer.features[0].geometry.coordinates[0][0]=12;assert.equal(input.features[0].geometry.coordinates[0][0],0);
});

test('Turf computes polygon surface area and perimeter from geographic coordinates',()=>{
 const anchor=[126.978,37.5665],coordinates=[[0,0],[100,0],[100,100],[0,100],[0,0]].map(point=>localToGeographic(point,anchor));
 const layer=normalizeReferenceVectorLayer({...payload(),anchor,features:[{type:'Feature',id:'polygon-1',geometry:{type:'Polygon',coordinates:[coordinates]}}]});
 assert.ok(layer.measurements[0].areaSquareMeters>9900&&layer.measurements[0].areaSquareMeters<10100);
 assert.ok(layer.measurements[0].lengthMeters>398&&layer.measurements[0].lengthMeters<402);
 assert.equal(layer.features[0].geometry.coordinates[0].length,5);
});

test('explicit vector save upserts stable IDs with a shared anchor and creates no semantic entities',()=>{
 const project=newDocument('Map reference'),before=structuredClone({entities:project.entities,references:project.references,nodes:project.nodes});
 const first=saveReferenceVectorLayer(project,payload());assert.deepEqual(project.extensions.geoReference.anchor,[0,0]);
 const changed=payload();changed.name='수정 자료';changed.features[0].geometry.coordinates[1]=[.002,0];saveReferenceVectorLayer(project,changed);
 assert.equal(project.extensions.referenceVectors.layers.length,1);assert.equal(project.extensions.referenceVectors.layers[0].id,first.id);assert.equal(project.extensions.referenceVectors.layers[0].features[0].id,'line-1');
 assert.ok(project.extensions.referenceVectors.layers[0].measurements[0].lengthMeters>first.measurements[0].lengthMeters*1.99);
 assert.deepEqual({entities:project.entities,references:project.references,nodes:project.nodes},before);
 const snapshot=structuredClone(project);assert.throws(()=>saveReferenceVectorLayer(project,{...payload(),anchor:[1,1]}),/기준점/);assert.deepEqual(project,snapshot);
});

test('invalid coordinates, unclosed polygons, duplicate IDs, and degenerate geometry are rejected',()=>{
 const input=payload();for(const position of [[0,90],[181,0],[NaN,0]])assert.throws(()=>normalizeReferenceVectorLayer({...input,anchor:position}));
 assert.throws(()=>normalizeReferenceVectorLayer({...input,features:[line,line]}),/중복/);
 assert.throws(()=>normalizeReferenceVectorLayer({...input,features:[{...line,geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,1]]]}}]}),/닫힌/);
 assert.throws(()=>normalizeReferenceVectorLayer({...input,features:[{...line,geometry:{type:'LineString',coordinates:[[0,0],[0,0]]}}]}),/측정/);
 assert.throws(()=>normalizeReferenceVectorLayer({...input,features:[{...line,id:'<unsafe>'}]}),/ID/);
});
