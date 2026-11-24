import {createRasterDocument,validateRasterDocument,rasterImageToLayer} from '../core/foundation/raster-edit.js';
import './raster-workspace.css';
import {createRasterRenderer,applyRasterLayerTransform} from './raster-renderer.js';

const copy=value=>structuredClone(value);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Source-backed editable layers and transparent overlays preserve the source file.
export async function openRasterWorkspace({reference,asset,sourceAsset=asset,fileUrl,onApply,notify}){
 let documentData=validateRasterDocument(createRasterDocument(reference));
 const source=new Image();source.src=fileUrl(sourceAsset);await source.decode();
 if(source.naturalWidth!==documentData.width||source.naturalHeight!==documentData.height)throw Error('원본 이미지 크기와 편집 문서가 다릅니다. 원본 자료를 확인하세요.');
 const dialog=document.createElement('dialog');dialog.id='raster-workspace';
 dialog.innerHTML=`<header class="raster-heading"><div><small>IMAGE WORKSPACE · PIXEL EDITOR</small><h2>이미지 편집</h2><p>${esc(asset.name)} · ${documentData.width} × ${documentData.height} px · 축척 없이 자유롭게 편집할 수 있습니다.</p></div><button id="raster-close">취소</button></header>
 <div class="raster-toolbar" aria-label="이미지 편집 도구">${[['brush','브러시'],['eraser','지우개'],['rect','사각형'],['ellipse','타원'],['select','영역 선택']].map(([tool,label])=>`<button type="button" data-raster-tool="${tool}">${label}</button>`).join('')}<label>색상<input type="color" id="raster-color" value="#4d9ef7"></label><label>크기(px)<input type="number" id="raster-size" min="1" max="2048" value="12"></label><button id="raster-undo">실행 취소</button><button id="raster-redo">다시 실행</button></div>
 <div class="raster-body"><div class="raster-stage"><div id="raster-canvas-area"><canvas id="raster-canvas" tabindex="0" aria-label="이미지 픽셀 편집 캔버스"></canvas></div><div class="raster-selection-tools"><span id="raster-selection-info">영역 선택 후 활성 레이어의 선택 부분을 지울 수 있습니다.</span><div class="raster-selection-actions"><label>이동 X(px)<input id="raster-selection-dx" type="number" step="1" value="0"></label><label>Y(px)<input id="raster-selection-dy" type="number" step="1" value="0"></label><button id="raster-selection-move">영역 이동</button><button id="raster-selection-copy">영역 복사</button><button id="raster-selection-clear">영역 지우기</button><button id="raster-selection-cancel">선택 해제</button></div></div></div>
 <aside class="raster-layers"><h3>편집 레이어</h3><div class="raster-layer-buttons"><button id="raster-layer-add">＋ 추가</button><button id="raster-layer-duplicate">복제</button><button id="raster-layer-delete">삭제</button><button id="raster-layer-up">위로</button><button id="raster-layer-down">아래로</button></div><div id="raster-layer-list" aria-label="편집 레이어 목록"></div><div class="raster-layer-properties"><label>레이어 이름<input id="raster-layer-name" maxlength="100"></label><div class="raster-flags"><label><input type="checkbox" id="raster-layer-visible">표시</label><label><input type="checkbox" id="raster-layer-lock">잠금</label></div><label>불투명도<input type="range" id="raster-layer-opacity" min="0" max="1" step=".05"></label><h4>레이어 전체 이동</h4><div class="raster-offsets"><label>X(px)<input id="raster-layer-x" type="number" step="1"></label><label>Y(px)<input id="raster-layer-y" type="number" step="1"></label></div><label>회전(°)<input id="raster-layer-rotation" type="number" step="1" value="0"></label><div class="raster-offsets"><label>가로 배율<input id="raster-layer-scale-x" type="number" min=".01" max="100" step=".05" value="1"></label><label>세로 배율<input id="raster-layer-scale-y" type="number" min=".01" max="100" step=".05" value="1"></label></div><p>회전·크기는 이미지 중심이 기준입니다. 선택 영역은 활성 레이어의 픽셀 축을 따릅니다. 영역 이동 값도 해당 축의 픽셀 단위입니다.</p></div><div class="raster-source"><b>원본 파일 · 보존</b><small>원본 편집본에서 원본 그림도 지울 수 있습니다.<br>원본 파일은 변경하지 않습니다.</small></div></aside></div>
 <footer class="raster-footer"><p id="raster-status" role="status">편집 결과와 레이어 기록을 별도 파생 이미지로 저장합니다. 원본은 그대로 보존됩니다.</p><button id="raster-apply">새 파생 이미지로 적용</button></footer>`;
 document.body.append(dialog);dialog.showModal();
 const $=selector=>dialog.querySelector(selector),canvas=$('#raster-canvas'),ctx=canvas.getContext('2d'),renderer=createRasterRenderer(source,documentData.width,documentData.height);
 canvas.width=documentData.width;canvas.height=documentData.height;
 let activeId=documentData.layers.at(-1)?.id||null,tool='brush',busy=false,closed=false,gesture=null,selection=null,undo=[],redo=[],frame=null;
 const active=()=>documentData.layers.find(layer=>layer.id===activeId);
 function fail(error){$('#raster-status').textContent=error.message;notify?.(error.message,true);}
 const attempt=fn=>(...args)=>{try{fn(...args);}catch(error){fail(error);}};
 const editable=(requireVisible=true)=>{const layer=active();if(!layer)throw Error('먼저 편집 레이어를 추가하세요.');if(layer.locked)throw Error('잠긴 레이어입니다. 잠금을 해제한 뒤 편집하세요.');if(requireVisible&&!layer.visible)throw Error('숨긴 레이어입니다. 표시한 뒤 편집하세요.');return layer;};
 function snapshot(){return {document:copy(documentData),activeId};}
 function commit(change,message){
  if(busy)return;const before=snapshot(),beforeSelection=selection&&copy(selection);
  try{change();documentData=validateRasterDocument(documentData);}catch(error){documentData=before.document;activeId=before.activeId;selection=beforeSelection;refresh();throw error;}
  undo.push(before);if(undo.length>40)undo.shift();redo=[];gesture=null;if(message)$('#raster-status').textContent=message;refresh();
 }
 function composite(target,preview=false){renderer.render(target,documentData,preview?gesture:null);}
 function draw(){
  frame=null;if(closed)return;composite(ctx,true);
  const rect=gesture?.selection||selection;if(rect&&active()){ctx.save();applyRasterLayerTransform(ctx,active(),[documentData.width,documentData.height]);ctx.strokeStyle='#f7d47f';ctx.lineWidth=Math.max(1,documentData.width/(canvas.clientWidth||documentData.width));ctx.setLineDash([ctx.lineWidth*5,ctx.lineWidth*3]);ctx.strokeRect(rect.x,rect.y,rect.width,rect.height);ctx.restore();}
 }
 function requestDraw(){if(!frame)frame=requestAnimationFrame(draw);}
 function fit(){const area=$('#raster-canvas-area').getBoundingClientRect(),ratio=Math.min((area.width-20)/canvas.width,(area.height-20)/canvas.height);canvas.style.width=Math.max(1,canvas.width*ratio)+'px';canvas.style.height=Math.max(1,canvas.height*ratio)+'px';requestDraw();}
 function refresh(){
  const layer=active(),index=documentData.layers.findIndex(item=>item.id===activeId),disabled=busy||!layer,locked=disabled||layer.locked;
  $('#raster-layer-list').innerHTML=[...documentData.layers].reverse().map(item=>`<button type="button" data-raster-layer="${item.id}" aria-pressed="${item.id===activeId}"><span>${item.visible?'◉':'○'} ${esc(item.name)}</span><small>${item.locked?'잠김':'편집 가능'} · ${Math.round(item.opacity*100)}%</small></button>`).join('')||'<p>원본은 보존되어 있습니다.<br>편집 레이어를 추가하세요.</p>';
  $('#raster-layer-list').querySelectorAll('button').forEach(button=>{button.disabled=busy;button.onclick=()=>{if(busy)return;activeId=button.dataset.rasterLayer;gesture=null;selection=null;refresh();};});
  for(const element of dialog.querySelectorAll('button,input'))element.disabled=busy;
  $('#raster-layer-name').value=layer?.name||'';$('#raster-layer-visible').checked=layer?.visible??false;$('#raster-layer-lock').checked=layer?.locked??false;$('#raster-layer-opacity').value=layer?.opacity??1;$('#raster-layer-x').value=layer?.offsetX??0;$('#raster-layer-y').value=layer?.offsetY??0;
  $('#raster-layer-rotation').value=layer?.rotation??0;$('#raster-layer-scale-x').value=layer?.scaleX??1;$('#raster-layer-scale-y').value=layer?.scaleY??1;
  for(const id of ['name','opacity','x','y','rotation','scale-x','scale-y'])$('#raster-layer-'+id).disabled=locked;
  $('#raster-layer-visible').disabled=disabled;$('#raster-layer-lock').disabled=disabled;
  $('#raster-layer-delete').disabled=locked;$('#raster-layer-duplicate').disabled=disabled;$('#raster-layer-up').disabled=locked||index===documentData.layers.length-1;$('#raster-layer-down').disabled=locked||index<=0;
  $('#raster-undo').disabled=busy||!undo.length;$('#raster-redo').disabled=busy||!redo.length;$('#raster-selection-clear').disabled=locked||!layer?.visible||!selection||!selection.width||!selection.height;
  for(const id of ['move','copy','dx','dy'])$('#raster-selection-'+id).disabled=$('#raster-selection-clear').disabled;$('#raster-selection-cancel').disabled=busy||!selection;
  $('#raster-selection-info').textContent='영역을 선택하면 활성 레이어의 픽셀을 이동·복사·지울 수 있습니다.';
  if(selection)$('#raster-selection-info').textContent=`선택 영역 ${Math.round(selection.width)} × ${Math.round(selection.height)} px · 활성 레이어에만 적용`;
  for(const button of dialog.querySelectorAll('[data-raster-tool]'))button.setAttribute('aria-pressed',String(button.dataset.rasterTool===tool));
  requestDraw();
 }
 function point(event){const rect=canvas.getBoundingClientRect();return [Math.max(0,Math.min(canvas.width,(event.clientX-rect.left)*canvas.width/rect.width)),Math.max(0,Math.min(canvas.height,(event.clientY-rect.top)*canvas.height/rect.height))];}
 const clampPoint=p=>[Math.max(0,Math.min(documentData.width,p[0])),Math.max(0,Math.min(documentData.height,p[1]))];
 const selectionRectangle=(a,b)=>{const x=Math.floor(Math.min(a[0],b[0])),y=Math.floor(Math.min(a[1],b[1]));return {x,y,width:Math.min(documentData.width,Math.ceil(Math.max(a[0],b[0])))-x,height:Math.min(documentData.height,Math.ceil(Math.max(a[1],b[1])))-y};};
 const rectangle=(a,b)=>({x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),width:Math.abs(a[0]-b[0]),height:Math.abs(a[1]-b[1])});
 canvas.onpointerdown=attempt(event=>{
  if(busy||event.button!==0)return;event.preventDefault();canvas.focus();const imagePoint=point(event),p=active()?rasterImageToLayer(active(),imagePoint,[documentData.width,documentData.height]):imagePoint;
  if(tool==='select'){if(!active())throw Error('선택할 편집 레이어를 추가하세요.');const local=clampPoint(p);gesture={start:local,selection:selectionRectangle(local,local)};selection=null;}
  else{const layer=editable(),size=Number($('#raster-size').value);if(!Number.isFinite(size)||size<1||size>2048)throw Error('브러시 크기는 1~2048px로 입력하세요.');const local=p;gesture={start:local,layerId:layer.id,command:['brush','eraser'].includes(tool)?{type:tool,points:[local],size,color:$('#raster-color').value}:{type:tool,...rectangle(local,local),color:$('#raster-color').value}};}
  canvas.setPointerCapture(event.pointerId);requestDraw();
 });
 canvas.onpointermove=event=>{if(!gesture||busy)return;const p=rasterImageToLayer(active(),point(event),[documentData.width,documentData.height]);if(gesture.selection)gesture.selection=selectionRectangle(gesture.start,clampPoint(p));else{const layer=active(),local=p;if(gesture.command.points){const last=gesture.command.points.at(-1);if(Math.hypot(local[0]-last[0],local[1]-last[1])>=.25)gesture.command.points.push(local);}else Object.assign(gesture.command,rectangle(gesture.start,local));}requestDraw();};
 canvas.onpointerup=attempt(event=>{if(!gesture||busy)return;canvas.onpointermove(event);const completed=gesture;gesture=null;if(completed.selection){selection=completed.selection;refresh();}else if(completed.command.points||completed.command.width>0&&completed.command.height>0){commit(()=>editable().commands.push(completed.command),'편집 레이어에 그렸습니다. 원본은 유지됩니다.');}else requestDraw();});
 canvas.onpointercancel=()=>{gesture=null;requestDraw();};
 for(const button of dialog.querySelectorAll('[data-raster-tool]'))button.onclick=()=>{if(busy)return;tool=button.dataset.rasterTool;gesture=null;refresh();};
 $('#raster-layer-add').onclick=attempt(()=>commit(()=>{const layer={id:crypto.randomUUID(),name:'편집 레이어 '+(documentData.layers.length+1),visible:true,locked:false,opacity:1,source:false,offsetX:0,offsetY:0,rotation:0,scaleX:1,scaleY:1,commands:[]};documentData.layers.push(layer);activeId=layer.id;selection=null;},'투명 편집 레이어를 추가했습니다.'));
 $('#raster-layer-duplicate').onclick=attempt(()=>commit(()=>{const layer=active();if(!layer)throw Error('복제할 레이어를 선택하세요.');const duplicate={...copy(layer),id:crypto.randomUUID(),name:layer.name.slice(0,95)+' 복사',locked:false};documentData.layers.splice(documentData.layers.indexOf(layer)+1,0,duplicate);activeId=duplicate.id;selection=null;},'편집 레이어를 복제했습니다.'));
 $('#raster-layer-delete').onclick=attempt(()=>commit(()=>{const layer=editable(false),index=documentData.layers.indexOf(layer);documentData.layers.splice(index,1);activeId=documentData.layers[Math.min(index,documentData.layers.length-1)]?.id||null;selection=null;},'편집 레이어를 삭제했습니다. 실행 취소로 복원할 수 있습니다.'));
 for(const [id,delta]of [['up',1],['down',-1]])$('#raster-layer-'+id).onclick=attempt(()=>commit(()=>{const layer=editable(false),index=documentData.layers.indexOf(layer),target=index+delta;if(target<0||target>=documentData.layers.length)return;if(documentData.layers[target].locked)throw Error('잠긴 레이어를 넘어서 순서를 변경할 수 없습니다.');[documentData.layers[index],documentData.layers[target]]=[documentData.layers[target],documentData.layers[index]];},'편집 레이어 순서를 변경했습니다.'));
 $('#raster-layer-lock').onchange=attempt(event=>commit(()=>{active().locked=event.target.checked;},'레이어 잠금을 변경했습니다.'));
 $('#raster-layer-visible').onchange=attempt(event=>commit(()=>{active().visible=event.target.checked;},'레이어 표시를 변경했습니다.'));
 $('#raster-layer-name').onchange=attempt(event=>commit(()=>{if(active().locked)throw Error('잠긴 레이어입니다.');active().name=event.target.value;},'레이어 이름을 변경했습니다.'));
 $('#raster-layer-opacity').onchange=attempt(event=>commit(()=>{if(active().locked)throw Error('잠긴 레이어입니다.');active().opacity=Number(event.target.value);},'레이어 불투명도를 변경했습니다.'));
 for(const [id,key]of [['x','offsetX'],['y','offsetY'],['rotation','rotation'],['scale-x','scaleX'],['scale-y','scaleY']])$('#raster-layer-'+id).onchange=attempt(event=>commit(()=>{if(active().locked)throw Error('잠긴 레이어입니다.');active()[key]=Number(event.target.value);},'레이어 전체를 이동했습니다.'));
 $('#raster-selection-clear').onclick=attempt(()=>{if(!selection)return;commit(()=>{const layer=editable();layer.commands.push({type:'clear-rect',...selection});},'활성 레이어의 선택 영역을 지웠습니다. 원본은 유지됩니다.');});
 function transferSelection(isCopy){
  if(!selection)return;const dx=Number($('#raster-selection-dx').value),dy=Number($('#raster-selection-dy').value);
  if(!Number.isInteger(dx)||!Number.isInteger(dy)||Math.abs(dx)>1e7||Math.abs(dy)>1e7)throw Error('선택 영역 이동 값은 정수 픽셀로 입력하세요.');
  if(!dx&&!dy)return;
  commit(()=>{editable().commands.push({type:'selection-transfer',...selection,dx,dy,copy:isCopy});const left=Math.max(0,selection.x+dx),top=Math.max(0,selection.y+dy),right=Math.min(documentData.width,selection.x+dx+selection.width),bottom=Math.min(documentData.height,selection.y+dy+selection.height);selection=right>left&&bottom>top?{x:left,y:top,width:right-left,height:bottom-top}:null;},isCopy?'선택 영역을 복사했습니다.':'선택 영역을 이동했습니다.');
 }
 $('#raster-selection-move').onclick=attempt(()=>transferSelection(false));$('#raster-selection-copy').onclick=attempt(()=>transferSelection(true));$('#raster-selection-cancel').onclick=()=>{if(busy)return;selection=null;gesture=null;refresh();};
 function restore(from,to){if(busy||!from.length)return;to.push(snapshot());const saved=from.pop();documentData=saved.document;activeId=saved.activeId;gesture=null;selection=null;$('#raster-status').textContent='편집 이력을 복원했습니다.';refresh();}
 $('#raster-undo').onclick=()=>restore(undo,redo);$('#raster-redo').onclick=()=>restore(redo,undo);
 dialog.addEventListener('keydown',event=>{if(busy||event.target.closest('input,textarea'))return;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?restore(redo,undo):restore(undo,redo);}else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();restore(redo,undo);}else if(event.key==='Delete'&&selection){event.preventDefault();$('#raster-selection-clear').click();}});
 $('#raster-close').onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 const observer=new ResizeObserver(fit);observer.observe($('#raster-canvas-area'));
 dialog.addEventListener('close',()=>{closed=true;observer.disconnect();if(frame)cancelAnimationFrame(frame);dialog.remove();canvas.width=canvas.height=1;renderer.dispose();},{once:true});
 $('#raster-apply').onclick=async()=>{
  if(busy)return;try{documentData=validateRasterDocument(documentData);gesture=null;busy=true;refresh();$('#raster-status').textContent='편집 결과와 레이어 기록을 저장하고 있습니다…';
   // Use a separate output so the selection outline never becomes image pixels.
   const output=document.createElement('canvas');output.width=documentData.width;output.height=documentData.height;composite(output.getContext('2d'));const content=output.toDataURL('image/png').split(',')[1];output.width=output.height=1;
   await onApply({content,document:copy(documentData)});dialog.close();
  }catch(error){fail(error);}finally{busy=false;if(!closed)refresh();}
 };
 refresh();fit();return dialog;
}
