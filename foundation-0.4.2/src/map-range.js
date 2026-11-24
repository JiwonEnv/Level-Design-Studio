// Match captured pixels and geographic bounds after device-pixel rounding.
export function mapRangePixels(canvas,range=null){
 const rect=canvas.getBoundingClientRect();if(rect.width<=0||rect.height<=0)throw Error('지도 화면 크기를 확인하세요.');
 const ratioX=canvas.width/rect.width,ratioY=canvas.height/rect.height;
 const sx=range?Math.max(0,Math.floor(range.x*ratioX)):0,sy=range?Math.max(0,Math.floor(range.y*ratioY)):0;
 const ex=range?Math.min(canvas.width,Math.ceil((range.x+range.width)*ratioX)):canvas.width,ey=range?Math.min(canvas.height,Math.ceil((range.y+range.height)*ratioY)):canvas.height;
 if(ex<=sx||ey<=sy)throw Error('등록할 지도 범위를 다시 선택하세요.');
 return {sx,sy,width:ex-sx,height:ey-sy,corners:[[sx/ratioX,sy/ratioY],[ex/ratioX,ey/ratioY]]};
}

export function createMapRange({map,viewport,button,clearButton,info,onChange=()=>{}}){
 const canvas=map.getCanvas(),overlay=document.createElement('div'),outline=document.createElement('div');overlay.id='map-range-overlay';outline.id='map-range-rect';outline.hidden=true;overlay.append(outline);viewport.append(overlay);
 let selecting=false,selection=null,drag=null,busy=false,destroyed=false,lastSize=null;
 function render(message){
  button.setAttribute('aria-pressed',String(selecting));button.textContent=selecting?'범위 선택 중':'사각 범위 선택';overlay.classList.toggle('selecting',selecting);clearButton.disabled=busy||!selecting&&!selection;
  const rect=drag?.rect||selection;outline.hidden=!rect;if(rect){Object.assign(outline.style,{left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px'});}
  if(message)info.textContent=message;
  else if(selection){const pixels=mapRangePixels(canvas,selection),nw=map.unproject(pixels.corners[0]),se=map.unproject(pixels.corners[1]);info.textContent=`선택 범위 ${pixels.width} × ${pixels.height} px · 서 ${nw.lng.toFixed(6)} / 남 ${se.lat.toFixed(6)} / 동 ${se.lng.toFixed(6)} / 북 ${nw.lat.toFixed(6)} · 드래그로 다시 선택`;}else info.textContent=selecting?'지도 위를 드래그하여 사각 범위를 선택하세요. 가로·세로 최소 16px.':'현재 지도 화면 전체를 등록합니다. 사각 범위를 선택할 수도 있습니다.';
  onChange(selection,{selecting,busy});
 }
 function setSelecting(value){selecting=value;drag=null;if(value)map.dragPan.disable();else map.dragPan.enable();render();}
 function clear(message){selection=null;drag=null;render(message);}
 const point=event=>{const box=canvas.getBoundingClientRect();return [Math.max(0,Math.min(box.width,event.clientX-box.left)),Math.max(0,Math.min(box.height,event.clientY-box.top))];};
 const rectangle=(a,b)=>({x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),width:Math.abs(a[0]-b[0]),height:Math.abs(a[1]-b[1])});
 overlay.onpointerdown=event=>{if(!selecting||busy||event.button!==0)return;event.preventDefault();event.stopPropagation();const start=point(event);selection=null;drag={start,rect:rectangle(start,start)};overlay.setPointerCapture(event.pointerId);render('등록할 사각 범위를 드래그하세요.');};
 overlay.onpointermove=event=>{if(!drag||busy)return;event.preventDefault();event.stopPropagation();drag.rect=rectangle(drag.start,point(event));render('등록할 사각 범위를 드래그하세요.');};
 overlay.onpointerup=event=>{if(!drag||busy)return;event.preventDefault();event.stopPropagation();const rect=rectangle(drag.start,point(event));drag=null;if(rect.width<16||rect.height<16){selection=null;render('범위가 너무 작습니다. 가로·세로 16px 이상으로 다시 선택하세요.');return;}selection=rect;render();};
 overlay.onpointercancel=()=>clear('범위 선택을 취소했습니다. 현재 화면 전체를 등록합니다.');
 button.onclick=()=>{if(busy)return;if(selecting){render('범위를 다시 드래그하세요. 화면 전체를 등록하려면 전체 화면으로 복귀를 누르세요.');return;}setSelecting(true);};clearButton.onclick=()=>{if(busy)return;selection=null;drag=null;setSelecting(false);};
 const observer=new ResizeObserver(()=>{const box=canvas.getBoundingClientRect(),next=[box.width,box.height];if(lastSize&&(lastSize[0]!==next[0]||lastSize[1]!==next[1])&&(selection||drag))clear('지도 크기가 변경되어 선택을 해제했습니다. 범위를 다시 선택하세요.');lastSize=next;});observer.observe(viewport);
 render();
 return {get selection(){return selection&&{...selection};},get selecting(){return selecting;},clear,setBusy(value){busy=value;button.disabled=value;render();},destroy(){if(destroyed)return;destroyed=true;observer.disconnect();map.dragPan.enable();overlay.remove();}};
}
