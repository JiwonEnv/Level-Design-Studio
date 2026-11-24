import {TerraDraw,TerraDrawLineStringMode,TerraDrawPolygonMode,TerraDrawSelectMode,TerraDrawModeUndoRedo,TerraDrawSessionUndoRedo} from 'terra-draw';
import {TerraDrawMapLibreGLAdapter} from 'terra-draw-maplibre-gl-adapter';
import {normalizeReferenceVectorLayer,measureReferenceVector,REFERENCE_VECTOR_ENGINE} from '../core/foundation/reference-vectors.js';
import './map-vector-workspace.css';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=value=>structuredClone(value),prefix='studio-reference-vectors';

// Terra Draw owns input, editing, and history. Only Save touches the project.
export function createMapVectorWorkspace({map,host,anchor,getProjectSnapshot=()=>null,onSaveVector,onActivate=()=>{},onModeChange=()=>{},notify}){
 const panel=document.createElement('section');panel.id='map-vector-workspace';panel.innerHTML='<div class="map-vector-tools"><b>자료 벡터 · 측정</b><button id="map-vector-line" aria-pressed="false">선 그리기</button><button id="map-vector-polygon" aria-pressed="false">폴리곤 그리기</button><button id="map-vector-select" aria-pressed="false">선택 · 정점 편집</button><button id="map-vector-pan" aria-pressed="true">지도 탐색</button><button id="map-vector-delete">선택 삭제</button><button id="map-vector-undo">실행 취소</button><button id="map-vector-redo">다시 실행</button></div><div class="map-vector-document"><select id="map-vector-layer" aria-label="지도 벡터 레이어"></select><input id="map-vector-name" maxlength="200" aria-label="벡터 레이어 이름" value="지도 자료 1"><button id="map-vector-new">새 레이어</button><button id="map-vector-save">벡터 자료 저장</button></div><p id="map-vector-status" role="status">Terra Draw 준비 중…</p><div id="map-vector-list"></div>';
 host.insertBefore(panel,host.querySelector('#map-viewport'));const $=selector=>panel.querySelector(selector),drafts=new Map(),saved=new Map();
 const initial=getProjectSnapshot(),storedAnchor=anchor||initial?.extensions?.geoReference?.anchor||initial?.extensions?.referenceVectors?.layers?.[0]?.anchor;let sharedAnchor=storedAnchor||[map.getCenter().lng,map.getCenter().lat],anchorFixed=!!storedAnchor;
 for(const layer of initial?.extensions?.referenceVectors?.layers||[]){const valid=normalizeReferenceVectorLayer(layer);drafts.set(valid.id,valid);saved.set(valid.id,JSON.stringify(valid));}
 let layerId=[...drafts.keys()].at(-1)||crypto.randomUUID(),draw=null,ready=false,destroyed=false,busy=false,mode='static',selected=null,raf=null,updating=false;
 if(!drafts.has(layerId))drafts.set(layerId,{version:1,id:layerId,name:'지도 자료 1',anchor:[...sharedAnchor],features:[]});
 const active=()=>drafts.get(layerId);
 const features=()=>draw?.getSnapshot().filter(feature=>['linestring','polygon'].includes(feature.properties.mode)&&!feature.properties.currentlyDrawing).map(feature=>({type:'Feature',id:feature.id,geometry:clone(feature.geometry),properties:{mode:feature.properties.mode}}))||active().features;
 const unfinished=()=>draw?.getSnapshot().some(feature=>feature.properties.currentlyDrawing);
 function report(error){$('#map-vector-status').textContent=error.message;notify?.(error.message,true);}
 const attempt=fn=>(...args)=>{try{fn(...args);}catch(error){report(error);}};
 function remember(){if(ready&&!updating)active().features=features();}
 function visibility(){
  if(!ready||destroyed)return;const value=mode==='static'?'none':'visible';
  for(const layer of map.getStyle()?.layers||[])if(layer.id.startsWith(prefix)&&map.getLayoutProperty(layer.id,'visibility')!==value)map.setLayoutProperty(layer.id,'visibility',value);
 }
 function renderList(){
  raf=null;if(destroyed)return;remember();const list=features();
  $('#map-vector-layer').innerHTML=[...drafts.values()].map(layer=>`<option value="${layer.id}" ${layer.id===layerId?'selected':''}>${esc(layer.name)}</option>`).join('');
  if(document.activeElement!==$('#map-vector-name'))$('#map-vector-name').value=active().name;
  $('#map-vector-list').innerHTML=list.map((feature,index)=>{try{const measurement=measureReferenceVector(feature);return `<button data-vector-feature="${feature.id}" aria-pressed="${selected===feature.id}"><span>${feature.geometry.type==='Polygon'?'폴리곤':'선'} ${index+1}</span><small data-vector-measure="${feature.id}">${feature.geometry.type==='Polygon'?`면적 ${measurement.areaSquareMeters.toFixed(2)} m² · 둘레 `:'길이 '}${measurement.lengthMeters.toFixed(2)} m</small></button>`;}catch{return '';}}).join('');
  for(const button of panel.querySelectorAll('[data-vector-feature]'))button.onclick=attempt(()=>{activate('select');draw.selectFeature(button.dataset.vectorFeature);});
  for(const control of panel.querySelectorAll('button,input,select'))control.disabled=busy||!ready;
  $('#map-vector-save').disabled=busy||!ready||!onSaveVector||unfinished();$('#map-vector-delete').disabled=busy||!ready||!selected;
  $('#map-vector-undo').disabled=busy||!ready||!draw.canUndo();$('#map-vector-redo').disabled=busy||!ready||!draw.canRedo();
  for(const [id,value]of [['line','linestring'],['polygon','polygon'],['select','select'],['pan','static']])$('#map-vector-'+id).setAttribute('aria-pressed',String(mode===value));
  visibility();
 }
 function schedule(){if(!destroyed&&!raf)raf=requestAnimationFrame(renderList);}
 function activate(next){
  if(!ready||busy)return;remember();if(next!=='static'){onActivate();if(!anchorFixed){const center=map.getCenter();sharedAnchor=[center.lng,center.lat];for(const draft of drafts.values())if(!draft.features.length)draft.anchor=[...sharedAnchor];anchorFixed=true;}}mode=next;host.toggleAttribute('data-vector-active',mode!=='static');draw.setMode(mode);selected=null;visibility();renderList();onModeChange(mode);
  $('#map-vector-status').textContent=next==='linestring'?'선을 클릭으로 입력하세요. 마지막 점을 다시 클릭하거나 Enter로 완료합니다. 저장 전에는 프로젝트를 바꾸지 않습니다.':next==='polygon'?'외곽선을 클릭하고 시작점을 다시 클릭하여 닫으세요. 저장 전에는 프로젝트를 바꾸지 않습니다.':next==='select'?'도형 또는 목록을 선택하고 정점을 드래그하세요. 변경 후 벡터 자료 저장을 누르세요.':'지도 탐색 · 벡터를 숨겼습니다. 지도 이미지 캡처에는 벡터를 합성하지 않습니다.';
 }
 function loadDraft(id,rememberCurrent=true){
  if(rememberCurrent)remember();layerId=id;updating=true;try{draw.setMode('static');draw.clear();const results=draw.addFeatures(clone(active().features));const invalid=results.find(result=>!result.valid);if(invalid)throw Error('저장된 벡터를 열지 못했습니다: '+invalid.reason);draw.clearUndoRedoHistory();selected=null;draw.setMode(mode);}finally{updating=false;}renderList();
 }
 for(const [id,value]of [['line','linestring'],['polygon','polygon'],['select','select'],['pan','static']])$('#map-vector-'+id).onclick=attempt(()=>activate(value));
 $('#map-vector-delete').onclick=attempt(()=>{if(!ready||busy||!selected)return;draw.removeFeatures([selected]);selected=null;renderList();});
 $('#map-vector-undo').onclick=attempt(()=>{if(!ready||busy)return;draw.undo();selected=null;renderList();});$('#map-vector-redo').onclick=attempt(()=>{if(!ready||busy)return;draw.redo();selected=null;renderList();});
 $('#map-vector-layer').onchange=attempt(event=>loadDraft(event.target.value));
 $('#map-vector-name').onchange=()=>{active().name=$('#map-vector-name').value;schedule();};
 $('#map-vector-new').onclick=attempt(()=>{if(!ready||busy)return;remember();const id=crypto.randomUUID();drafts.set(id,{version:1,id,name:'지도 자료 '+(drafts.size+1),anchor:[...sharedAnchor],features:[]});loadDraft(id);activate('select');});
 $('#map-vector-save').onclick=async()=>{
  if(!ready||busy||unfinished())return;try{remember();active().name=$('#map-vector-name').value;const payload=normalizeReferenceVectorLayer(active());busy=true;draw.setMode('static');renderList();onModeChange(mode);
   $('#map-vector-status').textContent='벡터 자료와 Turf 측정값을 저장하고 있습니다…';await onSaveVector(clone(payload));if(destroyed)return;drafts.set(payload.id,payload);saved.set(payload.id,JSON.stringify(payload));$('#map-vector-status').textContent='지도 벡터 자료를 저장했습니다. 2D 설계 객체는 만들지 않았습니다.';
  }catch(error){if(!destroyed)report(error);}finally{busy=false;if(!destroyed){draw.setMode(mode);renderList();onModeChange(mode);}}
 };
 function keyGuard(event){if(mode!=='static'&&['Delete','Backspace','Enter','Escape','z','Z','y','Y'].includes(event.key))event.stopPropagation();}
 function start(){
  if(destroyed)return;try{
   const editable={feature:{draggable:true,coordinates:{draggable:true,midpoints:true,deletable:true}}};
   draw=new TerraDraw({adapter:new TerraDrawMapLibreGLAdapter({map,prefixId:prefix,coordinatePrecision:9,ignoreMismatchedPointerEvents:true}),modes:[new TerraDrawLineStringMode({pointerDistance:12,styles:{lineStringWidth:4,lineStringColor:'#397ff0',closingPointWidth:7,closingPointColor:'#f6c85c',closingPointOutlineWidth:2}}),new TerraDrawPolygonMode({pointerDistance:12,styles:{fillColor:'#398af0',fillOpacity:.18,outlineWidth:4,outlineColor:'#397ff0',closingPointWidth:7,closingPointColor:'#f6c85c',closingPointOutlineWidth:2}}),new TerraDrawSelectMode({pointerDistance:14,flags:{linestring:editable,polygon:editable},styles:{selectedLineStringWidth:5,selectedLineStringColor:'#f6c85c',selectedPolygonOutlineWidth:5,selectedPolygonOutlineColor:'#f6c85c',selectionPointWidth:6,selectionPointOutlineWidth:2,selectionPointColor:'#ffffff',selectionPointOutlineColor:'#397ff0',midPointWidth:5}})],undoRedo:{modeLevel:new TerraDrawModeUndoRedo({maxStackSize:50}),sessionLevel:new TerraDrawSessionUndoRedo({maxStackSize:50})}});
   draw.start();ready=true;draw.on('change',schedule);draw.on('finish',schedule);draw.on('history',schedule);draw.on('select',id=>{selected=id;schedule();});draw.on('deselect',()=>{selected=null;schedule();});
   map.getCanvas().addEventListener('keydown',keyGuard);map.getCanvas().addEventListener('keyup',keyGuard);map.on('styledata',visibility);loadDraft(layerId,false);activate('static');
   panel.dataset.sourceEngine=JSON.stringify(REFERENCE_VECTOR_ENGINE);
  }catch(error){report(error);}
 }
 for(const control of panel.querySelectorAll('button,input,select'))control.disabled=true;
 if(map.isStyleLoaded())start();else map.once('load',start);
 return {get active(){return mode!=='static';},get busy(){return busy;},pause(){if(ready&&!busy)activate('static');},async prepareCapture(){if(!ready||destroyed)return;activate('static');visibility();await new Promise(resolve=>{const done=()=>{map.off('render',done);map.off('remove',done);resolve();};map.once('render',done);map.once('remove',done);map.triggerRepaint();});},destroy(){destroyed=true;map.off('load',start);map.off('styledata',visibility);if(raf)cancelAnimationFrame(raf);map.getCanvas().removeEventListener('keydown',keyGuard);map.getCanvas().removeEventListener('keyup',keyGuard);draw?.stop();panel.remove();}};
}
