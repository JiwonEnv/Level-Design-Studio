import area from '@turf/area';
import length from '@turf/length';
import {mercator} from './geographic.js';

export const REFERENCE_VECTOR_ENGINE=Object.freeze({name:'Terra Draw',version:'1.40.0',adapter:'terra-draw-maplibre-gl-adapter',adapterVersion:'1.5.0',measurement:'Turf.js',measurementVersion:'7.4.0'});
const fail=message=>{throw Error('지도 벡터 자료: '+message);};
const identifier=value=>{if(typeof value!=='string'||!/[\w-]+/.test(value)||!/^[-\w]{1,128}$/.test(value))fail('자료 또는 도형 ID를 확인하세요.');return value;};
const position=value=>{if(!Array.isArray(value)||value.length!==2||!value.every(Number.isFinite))fail('지리 좌표를 확인하세요.');mercator(value);return [...value];};

export function measureReferenceVector(feature){
 const lengthMeters=length(feature,{units:'meters'}),areaSquareMeters=feature.geometry.type==='Polygon'?area(feature):0;
 if(!Number.isFinite(lengthMeters)||!Number.isFinite(areaSquareMeters)||lengthMeters<=0||feature.geometry.type==='Polygon'&&areaSquareMeters<=0)fail('측정할 수 없는 도형입니다.');
 return {id:feature.id,lengthMeters,areaSquareMeters};
}

export function normalizeReferenceVectorLayer(input){
 if(!input||input.version!==1)fail('지원하지 않는 버전입니다.');const id=identifier(input.id),anchor=position(input.anchor);
 if(typeof input.name!=='string'||!input.name.trim()||input.name.length>200)fail('레이어 이름을 확인하세요.');
 if(!Array.isArray(input.features)||input.features.length>1000)fail('한 레이어에는 최대 1000개 도형을 저장할 수 있습니다.');
 let count=0;const ids=new Set(),positions=values=>{if(!Array.isArray(values)||(count+=values.length)>20000)fail('한 레이어의 정점은 총 2만 개 이내여야 합니다.');return Array.from(values,position);};
 const features=input.features.map(feature=>{
  if(!feature||feature.type!=='Feature')fail('GeoJSON Feature 형식이 필요합니다.');const featureId=identifier(feature.id);if(ids.has(featureId))fail('도형 ID가 중복됩니다.');ids.add(featureId);
  const type=feature.geometry?.type;let coordinates;
  if(type==='LineString'){coordinates=positions(feature.geometry.coordinates);if(coordinates.length<2)fail('선에는 두 점 이상이 필요합니다.');}
  else if(type==='Polygon'){
   if(!Array.isArray(feature.geometry.coordinates)||!feature.geometry.coordinates.length||feature.geometry.coordinates.length>64)fail('폴리곤의 외곽선을 확인하세요.');
   coordinates=feature.geometry.coordinates.map(values=>{const ring=positions(values);if(ring.length<4||ring[0].some((v,i)=>v!==ring.at(-1)[i]))fail('폴리곤은 닫힌 외곽선이어야 합니다.');return ring;});
  }else fail('선 또는 폴리곤만 저장할 수 있습니다.');
  return {type:'Feature',id:featureId,geometry:{type,coordinates},properties:{mode:type==='LineString'?'linestring':'polygon'}};
 });
 return {version:1,id,name:input.name.trim(),anchor,features,sourceEngine:{...REFERENCE_VECTOR_ENGINE},source:{type:'map',crs:'EPSG:4326',provider:'OpenStreetMap Standard',attribution:'© OpenStreetMap contributors',licenseUrl:'https://www.openstreetmap.org/copyright'},measurements:features.map(measureReferenceVector)};
}

// Explicit persistence only; no semantic design entities are created here.
export function saveReferenceVectorLayer(project,payload){
 const layer=normalizeReferenceVectorLayer(payload),existing=project.extensions?.referenceVectors;
 if(existing&&(existing.version!==1||!Array.isArray(existing.layers)))fail('저장된 벡터 레이어 형식을 확인하세요.');
 const shared=project.extensions?.geoReference?.anchor;if(shared&&shared.some((value,index)=>Math.abs(value-layer.anchor[index])>1e-10))fail('프로젝트의 공통 지도 기준점이 변경됐습니다. 지도를 다시 여세요.');
 const layers=(existing?.layers||[]).map(normalizeReferenceVectorLayer);if(layers.length>256||new Set(layers.map(item=>item.id)).size!==layers.length)fail('저장된 레이어 수 또는 ID를 확인하세요.');
 if(layers.some(item=>item.anchor.some((value,index)=>Math.abs(value-layer.anchor[index])>1e-10)))fail('벡터 자료의 공통 지도 기준점이 다릅니다.');
 const at=layers.findIndex(item=>item.id===layer.id);if(at<0){if(layers.length===256)fail('지도 벡터 레이어는 최대 256개입니다.');layers.push(layer);}else layers[at]=layer;
 project.extensions??={};project.extensions.referenceVectors={version:1,layers};project.extensions.geoReference??={version:1,anchor:[...layer.anchor],method:'web-mercator-scaled-at-anchor'};return structuredClone(layer);
}
