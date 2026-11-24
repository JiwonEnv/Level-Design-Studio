import {mapReferenceFrame,mercator} from '../core/foundation/geographic.js';
import 'maplibre-gl/dist/maplibre-gl.css';
import {createMapRange,mapRangePixels} from './map-range.js';
import './map-range.css';
import {createMapVectorWorkspace} from './map-vector-workspace.js';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

export async function openMapWorkspace({anchor,onCapture,notify,host=null,onClose,viewState,onViewChange,getProjectSnapshot,onSaveVector}){
 const {Map,NavigationControl,setWorkerUrl}=await import('maplibre-gl');
 setWorkerUrl(workerUrl);if(host&&!host.isConnected)return ()=>{};
 const dialog=document.createElement(host?'section':'dialog');dialog.id='map-workspace';dialog.style.cssText='width:min(1080px,95vw);max-width:95vw';
 dialog.innerHTML='<h2>Map · 지도에서 레퍼런스 만들기</h2><p>지도를 이동·확대한 뒤 현재 화면을 이미지로 등록합니다. 북쪽이 위이며 첫 캡처 중심을 프로젝트 지도 기준점으로 사용합니다.</p><div class="reference-tools"><label>경도<input id="map-longitude" type="number" step="any"></label><label>위도<input id="map-latitude" type="number" step="any"></label><button id="map-go">위치 이동</button><button id="map-capture" disabled>현재 범위 등록</button><button id="map-close">닫기</button></div><div class="map-range-toolbar"><button id="map-select-range" aria-pressed="false">사각 범위 선택</button><button id="map-clear-range" disabled>전체 화면으로 복귀</button></div><div id="map-viewport" style="height:480px;position:relative"></div><p id="map-range-info" role="status"></p><p id="map-status" role="status">지도 불러오는 중…</p><small>© OpenStreetMap contributors · ODbL · 일반 지도. 온라인으로 현재 표시 범위만 불러옵니다. 위성·오프라인 지도는 후속 지원입니다.</small>';
 if(host)host.append(dialog);else{document.body.append(dialog);dialog.showModal();}
 const $=s=>dialog.querySelector(s),center=viewState?.center||anchor||[126.978,37.5665];$('#map-longitude').value=center[0];$('#map-latitude').value=center[1];
 let map,range,vectors,busy=false,closed=false,tileFailure=false,waitingForTiles=true;
 for(const input of dialog.querySelectorAll('input'))input.style.width='130px';
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 const capture=$('#map-capture'),status=$('#map-status');
 const updateCapture=(selection=range?.selection,selecting=range?.selecting||false)=>{capture.disabled=busy||vectors?.active||vectors?.busy||tileFailure||waitingForTiles||!map?.areTilesLoaded()||selecting&&!selection;};
 const cleanup=()=>{if(closed)return;closed=true;vectors?.destroy();range?.destroy();map?.remove();dialog.remove();};
 $('#map-close').onclick=()=>host?onClose?.():dialog.close();if(host)$('#map-close').textContent='이미지로 돌아가기';dialog.addEventListener('close',cleanup,{once:true});
 try{
  map=new Map({container:$('#map-viewport'),center,zoom:viewState?.zoom??16,minZoom:2,maxZoom:19,pitch:0,bearing:0,dragRotate:false,touchZoomRotate:false,pitchWithRotate:false,renderWorldCopies:false,canvasContextAttributes:{preserveDrawingBuffer:true},attributionControl:{compact:false},style:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:19,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster',source:'osm'}]}});
  map.addControl(new NavigationControl({showCompass:false}));
  range=createMapRange({map,viewport:$('#map-viewport'),button:$('#map-select-range'),clearButton:$('#map-clear-range'),info:$('#map-range-info'),onChange:(selection,state)=>{if(state.selecting)vectors?.pause();updateCapture(selection,state.selecting);}});
  vectors=createMapVectorWorkspace({map,host:dialog,anchor,getProjectSnapshot,onSaveVector,notify,onActivate:()=>$('#map-clear-range').click(),onModeChange:()=>updateCapture()});
  map.on('moveend',()=>{const c=map.getCenter();onViewChange?.({center:[c.lng,c.lat],zoom:map.getZoom()});});
  map.on('movestart',()=>{tileFailure=false;waitingForTiles=true;capture.disabled=true;range.clear('지도가 이동하여 기존 선택을 해제했습니다. 사용할 범위를 다시 선택하세요.');status.textContent='지도 범위 불러오는 중…';});
  map.on('error',()=>{tileFailure=true;capture.disabled=true;status.textContent='지도를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 위치를 이동해 다시 시도하세요.';});
  map.on('idle',()=>{if(closed||tileFailure)return;waitingForTiles=false;updateCapture();if(!busy)status.textContent='사용할 범위로 이동·확대하고 현재 범위를 등록하세요. 최대 가로·세로 10km.';});
  $('#map-go').onclick=()=>{try{const next=[Number($('#map-longitude').value),Number($('#map-latitude').value)];mercator(next);map.jumpTo({center:next});}catch(e){status.textContent=e.message;}};
  capture.onclick=async()=>{
   if(busy||vectors.active||vectors.busy||tileFailure||waitingForTiles||!map.areTilesLoaded())return;
   if(range.selecting&&!range.selection){status.textContent='범위를 먼저 선택하세요. 전체를 등록하려면 전체 화면으로 복귀를 누르세요.';return;}
   try{
    busy=true;range.setBusy(true);capture.disabled=true;$('#map-close').disabled=true;$('#map-go').disabled=true;await vectors.prepareCapture();if(closed||!dialog.isConnected)return;const canvas=map.getCanvas(),pixels=mapRangePixels(canvas,range.selection),nw=map.unproject(pixels.corners[0]),se=map.unproject(pixels.corners[1]),c=map.unproject([(pixels.corners[0][0]+pixels.corners[1][0])/2,(pixels.corners[0][1]+pixels.corners[1][1])/2]);
    const frame=mapReferenceFrame({west:nw.lng,south:se.lat,east:se.lng,north:nw.lat,width:pixels.width,height:pixels.height,anchor:anchor||[c.lng,c.lat],zoom:map.getZoom()});
    const output=document.createElement('canvas');output.width=pixels.width;output.height=pixels.height;const ctx=output.getContext('2d');ctx.drawImage(canvas,pixels.sx,pixels.sy,pixels.width,pixels.height,0,0,pixels.width,pixels.height);const size=Math.max(4,Math.min(24,Math.round(output.width/70),Math.floor(output.height/4)));ctx.fillStyle='#ffffffeb';ctx.fillRect(0,output.height-size*2,output.width,size*2);ctx.fillStyle='#17232b';ctx.font=`${size}px sans-serif`;ctx.fillText('© OpenStreetMap contributors · openstreetmap.org/copyright',Math.min(10,output.width*.02),output.height-size*.65,output.width-Math.min(20,output.width*.04));
    const blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));if(!blob)throw Error('지도 이미지 생성에 실패했습니다.');
    // Encoding can finish after the user has left this workspace. Never import
    // a capture whose map context has already been disposed.
    if(closed||!dialog.isConnected)return;
    status.textContent='지도 레퍼런스 저장 중…';await onCapture(new File([blob],'Map-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png',{type:'image/png'}),frame);if(host){if(dialog.isConnected)onClose?.();}else dialog.close();
   }catch(e){status.textContent=e.message;notify(e.message,true);}finally{busy=false;if(!closed){range.setBusy(false);updateCapture();$('#map-close').disabled=false;$('#map-go').disabled=false;}}
  };
 }catch(e){cleanup();throw e;}
 return cleanup;
}
