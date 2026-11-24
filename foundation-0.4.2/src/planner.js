import {effective,applyNodeCommand,worldTransform,pointToLocal} from '../core/foundation/document.js';
import {visibleReferenceLayers,moveReferenceLayer,referenceScaleConfirmed} from '../core/foundation/references.js';
import {analysisPixelsCurrent} from '../core/foundation/analysis-candidates.js';
import {planReferenceCalibration,applyReferenceCalibration} from '../core/foundation/reference-calibration.js';
import {designMetrics,inspectDesign} from '../core/foundation/design-inspection.js';
import {renderTerrainInspector} from './terrain-inspector.js';
import {plannerToolbar,structureEntityInspector} from './editor-ui.js';
import {createTerrainCanvas} from './terrain-canvas.js';
import {createEntity, rectangle, entityIssues, worldToReference, referenceToWorld} from '../core/scene-model.js';

export const typeNames={Terrain:'지형',Road:'도로',Building:'건물',Water:'수역',Zone:'구역',Prop:'프랍'};
export const typeColors={Terrain:'#97af83',Road:'#e4be77',Building:'#9bcfca',Water:'#75b9de',Zone:'#b7a3d4',Prop:'#e1ad8f'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Number(n.toFixed(3));
export function createPlanner({getProject,getSelected,select,edit,fileUrl,notify,onReferenceImport,onMapOpen,onImageEdit,onRasterEdit,onLegacyRasterEdit,onAnalyze,onReferenceIssue,getReferenceControlsHost,onReferenceSelect,onReferenceRender}){
  let host,step=2,tool='select',draft=[],snap=true,view={x:-15,y:-65,width:110,height:80},drag=null,hover=null,preview=null,projectId=null,referenceId=null;
  const p=()=>getProject(),selected=()=>p()?.entities.find(e=>e.id===getSelected()||e.outputId===getSelected());
  const entityLocked=e=>{const n=p()?.nodes.find(n=>n.id===e?.id);return n?effective(p(),n,'locked'):!!p()?.layers.find(l=>l.id===e?.layerId)?.locked;};
  const entityVisible=e=>{const n=p()?.nodes.find(n=>n.id===e?.id);return n?effective(p(),n,'visible'):p()?.layers.find(l=>l.id===e?.layerId)?.visible!==false;};
  const terrainCanvas=createTerrainCanvas({getProject:p,getEntity:selected,getViewWidth:()=>view.width,isSelecting:()=>tool==='select',edit,notify,requestDraw:()=>draw(),onActivate:()=>{draft=[];preview=null;drag=null;tool='select';render(host,step);},getFrame:id=>{const frame=worldTransform(p(),p().nodes.find(n=>n.id===id));if(preview?.id===id&&drag?.kind==='entity'){const entity=p().entities.find(e=>e.id===id);frame.position=frame.position.map((v,i)=>v+preview.geometry.points[0][i]-entity.geometry.points[0][i]);}return frame;}});
  let activeReferenceId=null,knownReferenceIds=new Set();
  let calibrationPreview=null;
  let calibrationDistance=10;
  let viewportObserver=null;
  const expandedVertices=new Set();
  let referenceOverlay=false;
  let lastRoadClick=null;
  const refUI=selector=>host?.querySelector(selector)||getReferenceControlsHost?.()?.querySelector(selector);
  const ref=()=>p()?.references.find(r=>r.id===activeReferenceId)||p()?.references[0];
  const polygonTool=()=>['Terrain','Building','Water','Zone'].includes(tool);
  function screenDistance(a,b){const matrix=host?.querySelector('#planner-canvas')?.getScreenCTM();if(!matrix)return Infinity;const x=new DOMPoint(a[0],-a[1]).matrixTransform(matrix),y=new DOMPoint(b[0],-b[1]).matrixTransform(matrix);return Math.hypot(x.x-y.x,x.y-y.y);}
  function snapVertex(raw,fallback){const candidates=p().entities.filter(entityVisible).flatMap(e=>e.geometry.points);let nearest=null,distance=10;for(const point of candidates){const next=screenDistance(raw,point);if(next<distance){nearest=point;distance=next;}}return nearest?[...nearest]:fallback;}
  function previewCalibration(width,calibration){
    const r=ref();if(!r||!Number.isFinite(width)||width<=0)throw Error('이미지의 실제 가로 길이를 확인하세요.');
    calibrationPreview=planReferenceCalibration(p(),r.id,width,calibration);draft=[];render(host,step);
  }
  const attempt=fn=>(...args)=>{try{const result=fn(...args);if(result?.catch)result.catch(e=>notify(e.message,true));}catch(e){notify(e.message,true);}};
  function fit(){
    const points=step===1&&!referenceOverlay?[]:p()?.entities.flatMap(e=>e.geometry.points)||[];
    for(const r of visibleReferenceLayers(p())){const size=r.sourceSize||[1,1];points.push(...[[0,0],[size[0],0],[0,size[1]],[size[0],size[1]]].map(pt=>referenceToWorld({...r,sourceSize:size,origin:r.origin||[0,0,0]},pt)));}
    if(!points.length){view={x:-15,y:-65,width:110,height:80};return;}
    const xs=points.map(a=>a[0]),ys=points.map(a=>-a[1]),minX=Math.min(...xs),minY=Math.min(...ys),w=Math.max(20,Math.max(...xs)-minX),h=Math.max(20,Math.max(...ys)-minY);
    view={x:minX-w*.1,y:minY-h*.1,width:w*1.2,height:h*1.2};draw();
  }
  function svgPath(e){const pts=e.geometry.points;return pts.map((pt,i)=>`${i?'L':'M'}${pt[0]},${-pt[1]}`).join(' ')+(e.geometry.type==='polygon'?' Z':'');}
  function draw(){
    const svg=host?.querySelector('#planner-canvas');if(!svg)return;
    const sel=selected(),images=visibleReferenceLayers(p()).map(r=>{const asset=p().assets[r.assetId];return `<g data-reference="${r.id}" transform="translate(${r.origin?.[0]||0} ${-(r.origin?.[1]||0)}) rotate(${-(r.rotation||0)})"><image class="reference-image" href="${fileUrl(asset)}" x="0" y="${-r.widthMeters*(r.sourceSize?.[1]||1)/(r.sourceSize?.[0]||1)}" width="${r.widthMeters}" height="${r.widthMeters*(r.sourceSize?.[1]||1)/(r.sourceSize?.[0]||1)}" opacity="${r.opacity??.65}" preserveAspectRatio="none"/></g>`;}).join('');
    const calibrationReference=calibrationPreview&&p().references.find(r=>r.id===calibrationPreview.referenceId);
    const visibleRefs=new Set(visibleReferenceLayers(p()).map(r=>r.id));
    const candidateOutlines=(p().extensions.referenceAnalysis||[]).filter(b=>{const current=p().references.find(r=>r.id===b.sourceReferenceId);return b.visible!==false&&visibleRefs.has(b.sourceReferenceId)&&analysisPixelsCurrent(b,current,p().assets[current?.assetId]?.hash);}).flatMap(b=>{
      const current=p().references.find(r=>r.id===b.sourceReferenceId);
      return b.candidates.filter(c=>c.status==='pending').map(c=>{const points=c.points.map(pt=>referenceToWorld(current,pt)).map(pt=>`${pt[0]},${-pt[1]}`).join(' ');return `<${c.type==='Road'?'polyline':'polygon'} data-analysis-candidate="${c.id}" points="${points}" fill="none" stroke="#eed393" stroke-width="${view.width/500}" stroke-dasharray="${view.width/180} ${view.width/260}" pointer-events="none"/>`;});
    }).join('');
    const calibrationShapes=(calibrationPreview?.candidates||[]).filter(c=>calibrationPreview.selectedIds.includes(c.id)).map(c=>`<path data-calibration-entity="${c.id}" d="${svgPath({geometry:c.geometry})}" fill="none" stroke="#fff3b1" stroke-width="${view.width/350}" stroke-dasharray="${view.width/120} ${view.width/220}" pointer-events="none"/>`).join('');
    const calibrationOutline=calibrationReference?`<g id="calibration-outline" pointer-events="none" transform="translate(${calibrationReference.origin?.[0]||0} ${-(calibrationReference.origin?.[1]||0)}) rotate(${-(calibrationReference.rotation||0)})"><title>축척 적용 후 이미지 범위</title><rect x="0" y="${-calibrationPreview.width*(calibrationReference.sourceSize?.[1]||1)/(calibrationReference.sourceSize?.[0]||1)}" width="${calibrationPreview.width}" height="${calibrationPreview.width*(calibrationReference.sourceSize?.[1]||1)/(calibrationReference.sourceSize?.[0]||1)}" fill="#ffe5a118" stroke="#ffe5a1" stroke-width="${view.width/500}" stroke-dasharray="${view.width/100} ${view.width/180}"/></g>`:'';
    const activeImage=step===1&&visibleRefs.has(ref()?.id)?ref():null;
    const imageOutline=activeImage?'<g transform="translate('+(activeImage.origin?.[0]||0)+' '+(-(activeImage.origin?.[1]||0))+') rotate('+(-(activeImage.rotation||0))+')"><rect class="reference-selection-outline" data-active-reference="'+activeImage.id+'" x="0" y="'+(-activeImage.widthMeters*(activeImage.sourceSize?.[1]||1)/(activeImage.sourceSize?.[0]||1))+'" width="'+activeImage.widthMeters+'" height="'+(activeImage.widthMeters*(activeImage.sourceSize?.[1]||1)/(activeImage.sourceSize?.[0]||1))+'" fill="none" stroke="#93b8ff" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="none"/></g>':'';
    svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.width} ${view.height}`);
    const labelScale=Math.max(view.width/Math.max(1,svg.clientWidth),view.height/Math.max(1,svg.clientHeight));
    svg.innerHTML=`<defs><pattern id="planner-grid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M 5 0 L 0 0 0 5" fill="none" stroke="#46575c" stroke-width=".08"/></pattern></defs><rect x="${view.x-1000}" y="${view.y-1000}" width="${view.width+2000}" height="${view.height+2000}" fill="url(#planner-grid)"/>${images}${imageOutline}
    ${calibrationOutline}${candidateOutlines}${calibrationShapes}<path d="M-10000 0 H10000 M0 -10000 V10000" stroke="#82928a" stroke-width=".09" opacity=".5"/>
    ${p().entities.filter(e=>{if(step===1&&!referenceOverlay)return false;const n=p().nodes?.find(n=>n.id===e.id);return n?effective(p(),n,'visible'):p().layers.find(l=>l.id===e.layerId)?.visible!==false;}).sort((a,b)=>['Terrain','Zone','Water','Road','Building','Prop'].indexOf(a.type)-['Terrain','Zone','Water','Road','Building','Prop'].indexOf(b.type)).map(e=>{const current=preview?.id===e.id?preview:e,pts=current.geometry.points,color=typeColors[e.type],active=sel?.id===e.id;
      if(e.type==='Prop')return `<circle data-entity="${e.id}" cx="${pts[0][0]}" cy="${-pts[0][1]}" r="${active?.9:.6}" fill="${color}" stroke="${active?'#fff':color}" stroke-width=".18"/>`;
      return `<path data-entity="${e.id}" d="${svgPath(current)}" fill="${e.type==='Road'?'none':color+'35'}" stroke="${color}" stroke-width="${e.type==='Road'?e.parameters.width:active?3:2}" vector-effect="${e.type==='Road'?'none':'non-scaling-stroke'}" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>${e.type==='Road'?`<path d="${svgPath(current)}" fill="none" stroke="#364148" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-dasharray="6 4" pointer-events="none"/>`:''}<text class="canvas-entity-label" x="${pts[0][0]+6*labelScale}" y="${-pts[0][1]-8*labelScale}" font-size="${14*labelScale}" font-weight="550" fill="#f2f6ff" stroke="#151d2b" stroke-width="${3*labelScale}" paint-order="stroke" pointer-events="none">${esc(e.name)}</text>`;}).join('')}
    <g id="terrain-height-overlay"></g>
    ${sel&&(step!==1||referenceOverlay)&&tool==='select'&&!terrainCanvas.active&&entityVisible(sel)&&!entityLocked(sel)? (preview?.id===sel.id?preview:sel).geometry.points.map((pt,i)=>`<circle data-vertex="${i}" cx="${pt[0]}" cy="${-pt[1]}" r="${5*labelScale}" fill="#ecf4ce" stroke="#203b36" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`).join(''):''}
    ${draft.length?`<path d="${draft.map((pt,i)=>`${i?'L':'M'}${pt[0]} ${-pt[1]}`).join(' ')}${hover?` L${hover[0]} ${-hover[1]}`:''}" fill="none" stroke="#f1df9e" stroke-width="3" vector-effect="non-scaling-stroke" stroke-dasharray="7 4"/>${draft.map((pt,i)=>`<circle data-draft-point="${i}" cx="${pt[0]}" cy="${-pt[1]}" r="${(i===0&&polygonTool()?7:5)*labelScale}" fill="${i===0&&polygonTool()?'#7df0be':'#ffe5a1'}" stroke="#17212f" stroke-width="2" vector-effect="non-scaling-stroke"><title>${i===0&&polygonTool()?'첫 점을 클릭하면 도형을 닫습니다':'입력한 점'}</title></circle>`).join('')}`:''}`;
    if(step===2)terrainCanvas.drawOverlay(svg);
    updateReadout();
    updateDesignMetrics();
  }
  function updateReadout(){
    const terrainMode=step===2&&terrainCanvas.active,editing=terrainMode||!['select','pan'].includes(tool);
    const name=host?.querySelector('#active-tool-name'),hint=host?.querySelector('#active-tool-hint');
    if(name)name.textContent=(terrainMode&&terrainCanvas.label())||typeNames[tool]||({select:'선택',pan:'화면 이동',rectangle:'사각형 건물',calibrate:'두 점 축척'}[tool]);
    if(hint)hint.textContent=terrainMode?'캔버스에서 높이 편집 · Esc 취소':tool==='rectangle'?'드래그하여 건물 외곽선 그리기':tool==='Prop'?'클릭하여 배치':tool==='select'?'객체·정점 선택 및 드래그':tool==='pan'?'드래그하여 화면 이동':polygonTool()?'첫 점 클릭 또는 Enter로 닫기 · Esc 취소':tool==='Road'?'더블 클릭 또는 Enter로 선 완성 · Esc 취소':draft.length+'점 입력 · Enter 완료 / Esc 취소';
    const finishButton=host?.querySelector('#finish-drawing'),cancelButton=host?.querySelector('#cancel-drawing');
    if(finishButton)finishButton.disabled=terrainMode?false:!draft.length||tool==='rectangle';
    if(cancelButton)cancelButton.disabled=!editing&&!draft.length;
    const actions=host?.querySelector('.drawing-actions');if(actions)actions.hidden=!editing&&!draft.length;
    if(host)host.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===tool&&!terrainMode)));
    const status=host?.querySelector('#planner-readout');if(status)status.textContent=`${(step===2&&terrainCanvas.label())||typeNames[tool]||({select:'선택 / 정점 편집',pan:'화면 이동',rectangle:'사각형 건물',calibrate:'이미지 두 점 축척'}[tool])} · ${draft.length?draft.length+'점 · Enter로 완료':'격자 5m · 스냅 '+(snap?'1m':'끔')}${hover?` · X ${number(hover[0])} / Y ${number(hover[1])} m`:''}`;}
  function updateDesignMetrics(){
    const target=host?.querySelector('#design-metrics');if(!target)return;const entity=preview||selected(),metrics=designMetrics(entity);
    target.textContent=metrics?`${entity.name}${preview?' · 드래그 미리보기':''}${entityLocked(entity)?' · 잠김':''} · XY 범위 ${number(metrics.width)} × ${number(metrics.depth)}m · ${metrics.area===null?`길이 ${number(metrics.length)}m`:`면적 ${number(metrics.area)}m² · 둘레 ${number(metrics.length)}m`} · ${entity.type==='Terrain'?'입력 경계 높이':'높이'} ${number(metrics.minZ)}~${number(metrics.maxZ)}m${entity.parameters.terrain?` · 높이점 ${entity.parameters.terrain.controlPoints.length} / 등고선 ${entity.parameters.terrain.contours?.length||0}`:''}${metrics.buildingHeight!==null?` · 건물 높이 ${number(metrics.buildingHeight)}m`:entity.type==='Road'?` · 최대 구간 경사 ${number(metrics.maxGrade*100)}%`:''}`:'도형을 선택하면 길이·면적·높이를 표시합니다.';
    const live=host.querySelector('#design-live-issues');live.textContent=preview?entityIssues(preview).join(' · '):'';
  }
  function renderDesignInspection(){
    if(step!==2)return;const report=inspectDesign(p()),section=document.createElement('section');section.id='design-inspection';section.className='reference-tools';section.style.display='block';
    const metrics=document.createElement('div');metrics.id='design-metrics';const live=document.createElement('div');live.id='design-live-issues';live.style.color='#ffb4a8';section.append(metrics,live);
    const details=document.createElement('details'),summary=document.createElement('summary');details.id='design-issues';details.open=report.issues.length>0;summary.textContent=`2D 검사 · 오류 ${report.counts.error} / 확인 ${report.counts.warning} / 안내 ${report.counts.info}`;details.append(summary);
    const list=document.createElement('div');list.id='design-issue-list';list.style.cssText='max-height:105px;overflow:auto;display:grid;gap:5px;padding-top:6px';
    for(const issue of report.issues.slice(0,100)){const row=document.createElement('div');row.dataset.designIssue=issue.code;const text=document.createElement('span');text.textContent=issue.message;row.append(text);
      for(const id of issue.entityIds.slice(0,2)){const button=document.createElement('button');button.dataset.issueEntity=id;button.textContent=p().entities.find(e=>e.id===id)?.name||'도형 보기';button.style.cssText='padding:3px 6px;margin-left:6px';button.onclick=()=>{select(id);const e=p().entities.find(e=>e.id===id),points=e.geometry.points,x=Math.min(...points.map(p=>p[0])),y=Math.min(...points.map(p=>p[1])),w=Math.max(10,Math.max(...points.map(p=>p[0]))-x),h=Math.max(10,Math.max(...points.map(p=>p[1]))-y);view={x:x-w*.3,y:-y-h*1.3,width:w*1.6,height:h*1.6};draw();};row.append(button);}
      if(issue.referenceId){const button=document.createElement('button');button.dataset.issueReference=issue.referenceId;button.textContent='축척 확정으로 이동';button.onclick=()=>onReferenceIssue(issue.referenceId);row.append(button);}list.append(row);
    }
    if(!report.issues.length){const text=document.createElement('small');text.textContent='현재 검사에서 발견한 문제가 없습니다. 3D 충돌·접근성 검사를 포함하지 않습니다.';list.append(text);}if(report.issues.length>100){const text=document.createElement('small');text.textContent=`전체 ${report.issues.length}개 중 100개 표시`;list.append(text);}details.append(list);section.append(details);host.querySelector('.planner-surface').after(section);
  }
  function add(type,points){
    const entity=createEntity(type,points,{name:`${typeNames[type]} ${p().entities.filter(e=>e.type===type).length+1}`,referenceIds:ref()?[ref().id]:[]});
    const issues=entityIssues(entity);if(issues.length)throw Error(issues.join(', '));
    if(p().layers.find(l=>l.id===type)?.locked)throw Error('해당 레이어가 잠겨 있습니다.');
    edit(()=>p().entities.push(entity));select(entity.id);draw();return entity;
  }
  function finish(){
    if(!draft.length)return;
    if(tool==='calibrate'){
      if(draft.length!==2)throw Error('기준점 두 개를 선택하세요.');
      const r=ref();if(!r)throw Error('이미지를 먼저 지정하세요.');
      const pixels=draft.map(pt=>worldToReference({...r,sourceSize:r.sourceSize||[1,1],origin:r.origin||[0,0,0]},pt));
      const distance=Math.hypot(pixels[1][0]-pixels[0][0],pixels[1][1]-pixels[0][1]);
      const real=calibrationDistance;
      if(!Number.isFinite(real)||real<=0||distance<1e-6)throw Error('서로 다른 두 점과 실제 거리를 입력하세요.');
      previewCalibration(real/distance*r.sourceSize[0],{pixels,distanceMeters:real});return;
    }
    const points=draft.map(a=>[...a]);if(polygonTool()&&points.length>3&&Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])<1e-6)points.pop();
    add(tool,points);draft=[];hover=null;lastRoadClick=null;tool='select';render(host,step);
  }
  function screenPoint(event,applySnap=true){
    const svg=host.querySelector('#planner-canvas'),matrix=svg.getScreenCTM();const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
    const round=n=>snap&&applySnap?Math.round(n):n;
    return [round(point.x),round(-point.y),0];
  }
  function bindCanvas(){
    const svg=host.querySelector('#planner-canvas');
    svg.onpointerdown=attempt(event=>{
      if(event.button!==0&&event.button!==1)return;
      event.preventDefault();svg.focus();const raw=screenPoint(event,false),pt=tool==='calibrate'?raw:['select','pan'].includes(tool)?screenPoint(event):snapVertex(raw,screenPoint(event));
      if(event.button===1||tool==='pan'){drag={kind:'pan',client:[event.clientX,event.clientY],view:{...view}};svg.setPointerCapture(event.pointerId);return;}
      if(step===2&&terrainCanvas.down(event,{point:pt,raw},svg)){updateReadout();return;}
      if(tool==='rectangle'){drag={kind:'rectangle',start:pt};draft=[pt];svg.setPointerCapture(event.pointerId);return;}
      if(tool!=='select'){
        if(tool==='Prop'){add('Prop',[pt]);return;}
        if(polygonTool()&&draft.length>=3&&screenDistance(raw,draft[0])<=12){finish();return;}
        if(tool==='Road'){const now=event.timeStamp;if(lastRoadClick&&draft.length>=2&&now-lastRoadClick.at<350&&screenDistance(raw,lastRoadClick.point)<=6){lastRoadClick=null;finish();return;}lastRoadClick={at:now,point:raw};}else lastRoadClick=null;
        if(!draft.length||Math.hypot(pt[0]-draft.at(-1)[0],pt[1]-draft.at(-1)[1])>.001)draft.push(pt);
        if(tool==='calibrate'&&draft.length===2)finish();else draw();return;
      }
      const imageTarget=step===1&&event.target.closest('[data-reference]');if(imageTarget){onReferenceSelect?.(imageTarget.dataset.reference);return;}
      const target=event.target.closest('[data-entity]'),vertex=event.target.closest('[data-vertex]');
      const entity=vertex?selected():target?p().entities.find(e=>e.id===target.dataset.entity):null;
      if(!entity){select(null);draw();return;}
      select(entity.id);draw();
      if(entityLocked(entity))return;
      drag={kind:vertex?'vertex':'entity',vertex:vertex?Number(vertex.dataset.vertex):null,entity:structuredClone(entity),start:raw};svg.setPointerCapture(event.pointerId);
    });
    svg.onpointermove=event=>{
      const pt=screenPoint(event,tool!=='calibrate');hover=pt;
      if(step===2&&!drag&&terrainCanvas.move(event,{point:pt,raw:screenPoint(event,false)},svg)){updateReadout();return;}
      if(drag?.kind==='pan'){
        const scale=svg.getScreenCTM().a;
        view.x=drag.view.x-(event.clientX-drag.client[0])/scale;view.y=drag.view.y-(event.clientY-drag.client[1])/scale;
      }else if(drag?.kind==='rectangle'){draft=[drag.start,[pt[0],drag.start[1],0],pt,[drag.start[0],pt[1],0]];}
      else if(drag){preview=structuredClone(drag.entity);if(drag.kind==='vertex')preview.geometry.points[drag.vertex]=pt;else{const raw=screenPoint(event,false),dx=raw[0]-drag.start[0],dy=raw[1]-drag.start[1];preview.geometry.points=preview.geometry.points.map(a=>[snap?Math.round(a[0]+dx):a[0]+dx,snap?Math.round(a[1]+dy):a[1]+dy,a[2]]);}}
      if(drag||draft.length)draw();else updateReadout();
    };
    svg.onpointerup=attempt(()=>{
      if(step===2&&terrainCanvas.up())return;
      const current=drag;drag=null;
      if(current?.kind==='rectangle'){const points=draft;draft=[];if(points.length===4)add('Building',points);}
      else if(preview){const next=preview;preview=null;const issues=entityIssues(next);if(issues.length){draw();throw Error(issues.join(', '));}const node=p().nodes.find(n=>n.id===next.id);
        if(current?.kind==='entity'&&node){const entity=p().entities.find(e=>e.id===next.id),frame=worldTransform(p(),node),delta=next.geometry.points[0].map((v,i)=>v-entity.geometry.points[0][i]),target=frame.position.map((v,i)=>v+delta[i]),parent=p().nodes.find(n=>n.id===node.parentId),transform=structuredClone(node.transform);transform.position=parent?pointToLocal(worldTransform(p(),parent),target):target;edit(()=>applyNodeCommand(p(),{type:'transform',id:node.id,value:transform}),'2D 객체 이동','common');}
        else edit(()=>{p().entities.find(e=>e.id===next.id).geometry=next.geometry;});
      }
      draw();
    });
    svg.onpointercancel=()=>{drag=null;preview=null;draft=[];terrainCanvas.cancel();};
    svg.onpointerleave=()=>terrainCanvas.leave();
    svg.ondblclick=attempt(event=>{if(tool==='Road'&&draft.length>=2){event.preventDefault();finish();}});
    svg.onwheel=event=>{event.preventDefault();const point=screenPoint(event,false),factor=event.deltaY>0?1.12:1/1.12;if(view.width*factor<2||view.width*factor>100000)return;view.x=point[0]+(view.x-point[0])*factor;view.y=-point[1]+(view.y+point[1])*factor;view.width*=factor;view.height*=factor;draw();};
    svg.onkeydown=attempt(event=>{if(event.key==='Enter'){event.preventDefault();if(step!==2||!terrainCanvas.finish())finish();}if(event.key==='Escape'){event.preventDefault();cancelInput();}});
  }
  function cancelInput(){draft=[];preview=null;drag=null;terrainCanvas.deactivate();tool='select';render(host,step);}
  function render(element,nextStep){
    viewportObserver?.disconnect();if(step!==nextStep){tool='select';draft=[];preview=null;drag=null;}host=element;step=nextStep;
    if(step!==2)terrainCanvas.deactivate();
    if(projectId!==p().id){projectId=p().id;draft=[];preview=null;referenceId=null;activeReferenceId=null;knownReferenceIds=new Set();calibrationPreview=null;fit();}
    const addedReference=p().references.find(r=>!knownReferenceIds.has(r.id));
    if(addedReference)activeReferenceId=addedReference.id;
    if(!p().references.some(r=>r.id===activeReferenceId))activeReferenceId=p().references[0]?.id||null;
    knownReferenceIds=new Set(p().references.map(r=>r.id));
    if(referenceId!==ref()?.id){referenceId=ref()?.id;calibrationPreview=null;fit();}
    const r=ref();
    host.innerHTML=`<div class="planner">${plannerToolbar({step,snap,typeNames,typeColors})}
    ${step===1?`<div class="reference-tools"><b>이미지 자료</b><button id="reference-import">이미지 등록</button><button disabled title="지도 입력은 아직 구현하지 않았습니다.">Map · 후속 구현</button>${r?`<label>전체 가로(m)<input id="ref-width" type="number" min=".001" value="${number(r.widthMeters)}"></label><label>기준 거리(m)<input id="calibration-distance" type="number" min=".001" value="10"></label><button data-tool="calibrate">두 점 축척</button><label>불투명도<input id="reference-opacity" type="range" min="0" max="1" step=".05" value="${r.opacity??.65}"></label>`:'<span>이미지 등록 또는 지도 가져오기로 시작하세요.</span>'}</div>`:''}
    <div class="planner-surface"><svg id="planner-canvas" tabindex="0" role="application" aria-label="레벨 설계 캔버스" title="휠: 확대 · 가운데 버튼: 화면 이동 · Enter: 입력 완료 · Esc: 선택 도구로 복귀"></svg></div><div class="planner-status" id="planner-readout"></div><div class="planner-help">${step===1?'이미지 위에서 도로·외곽선을 그리면 STEP 2의 같은 객체로 저장됩니다.':'도로는 선, 지형·건물·수역·구역은 다각형, 프랍은 점으로 그립니다.'} · Enter 완료 / Esc 취소 · 휠 확대 · 가운데 버튼 이동</div></div>`;
    if(step===2)host.querySelector('.planner-surface').prepend(host.querySelector('.editor-tool-strip'));
    host.querySelectorAll('[data-tool]').forEach(button=>{button.classList.toggle('active',button.dataset.tool===tool&&!terrainCanvas.active);button.onclick=()=>{terrainCanvas.deactivate();tool=button.dataset.tool;if(step===1&&!['select','pan','calibrate'].includes(tool))referenceOverlay=true;draft=[];preview=null;render(host,step);};});
    if(step===1&&p().references.length){const label=document.createElement('label');label.textContent='편집할 이미지 ';const choice=document.createElement('select');choice.id='active-reference';for(const reference of p().references){const option=document.createElement('option');option.value=reference.id;option.textContent=p().assets[reference.assetId]?.name||reference.id;option.selected=reference.id===r?.id;choice.append(option);}choice.onchange=()=>{activeReferenceId=choice.value;draft=[];preview=null;if(onReferenceSelect)onReferenceSelect(choice.value);else render(host,step);};label.append(choice);host.querySelector('.reference-tools').prepend(label);}
    if(step===1&&r){
      const tools=host.querySelector('.reference-tools');
      if(onLegacyRasterEdit&&r.derived?.operation?.type==='raster-edit'){const legacy=document.createElement('button');legacy.id='reference-legacy-raster-edit';legacy.textContent='이전 Studio 레이어 기록 열기';legacy.onclick=attempt(()=>onLegacyRasterEdit(r.id));tools.append(legacy);}
      if(onRasterEdit){const raster=document.createElement('button');raster.id='reference-raster-edit';raster.textContent='PhotoCraft 이미지 편집';raster.onclick=attempt(()=>onRasterEdit(r.id));tools.append(raster);}
      const imageEdit=document.createElement('button');imageEdit.id='reference-edit-image';imageEdit.textContent='크롭 · 원근 보정';imageEdit.onclick=attempt(()=>onImageEdit(r.id));tools.append(imageEdit);
      const analyze=document.createElement('button');analyze.id='reference-analyze';analyze.textContent='이미지 후보 · 검수';analyze.onclick=attempt(()=>onAnalyze(r.id));tools.append(analyze);
      for(const [text,action] of [['위로',()=>moveReferenceLayer(p(),r.id,-1)],['아래로',()=>moveReferenceLayer(p(),r.id,1)],['표시 전환',()=>{const n=p().nodes.find(n=>n.id===r.id);applyNodeCommand(p(),{type:'visible',id:r.id,value:!n.visible});}],['잠금 전환',()=>{const n=p().nodes.find(n=>n.id===r.id);applyNodeCommand(p(),{type:'unlock',id:r.id,value:!n.locked});}]]){const button=document.createElement('button');button.textContent=text;button.dataset.referenceAction=text;button.onclick=attempt(()=>edit(action,'참조 이미지 '+text,'common'));tools.append(button);}
      const node=p().nodes.find(n=>n.id===r.id),info=document.createElement('small');info.id='reference-source-info';info.textContent=`${node?.visible===false?'숨김':'표시'} · ${node?.locked?'잠김':'편집 가능'} · ${referenceScaleConfirmed(r)?'축척 확정':'축척 미확정 · 100m 등 표시 길이는 임시값'} · 원본 ${p().assets[r.assetId]?.name||''}`;tools.append(info);
      if(!referenceScaleConfirmed(r)){const confirm=document.createElement('button');confirm.id='reference-confirm-scale';confirm.textContent='입력한 길이로 축척 확정';confirm.onclick=attempt(()=>previewCalibration(Number(refUI('#ref-width').value)));tools.append(confirm);}
      if(r.geo){const geo=document.createElement('small');geo.textContent=`${r.geo.source} · ${r.geo.crs} · 지도 기준점 ${r.geo.anchor.map(n=>n.toFixed(6)).join(', ')} · 투영 축척 변화 ≤ ${(r.geo.scaleErrorBound*100).toFixed(3)}% · 지역 미터 근사`;tools.append(geo);}
    }
    if(step===1&&calibrationPreview){
      const review=calibrationPreview,box=document.createElement('section');box.id='calibration-preview';box.className='reference-tools';
      const title=document.createElement('strong');title.textContent='축척 변경 미리보기';const info=document.createElement('span');info.textContent=`가로 ${number(review.oldWidth)}m → ${number(review.width)}m (${number(review.width/review.oldWidth)}배). 체크한 도형과 지형 안의 높이점·등고선·변형 영역의 XY를 함께 보정합니다. 높이값·일반 속성·계산 간격·기존 3D 결과는 유지합니다.`;
      const apply=document.createElement('button');apply.id='calibration-apply';apply.textContent='적용';apply.onclick=attempt(()=>{edit(()=>applyReferenceCalibration(p(),review,review.selectedIds),'이미지·선택 도형 축척 적용');calibrationPreview=null;render(host,step);fit();});
      const cancel=document.createElement('button');cancel.id='calibration-cancel';cancel.textContent='취소';cancel.onclick=()=>{calibrationPreview=null;render(host,step);};box.append(title,info,apply,cancel);host.querySelector('.reference-tools').after(box);
      const count=document.createElement('small'),impacts=document.createElement('div');impacts.id='calibration-impacts';impacts.style.cssText='flex-basis:100%;max-height:140px;overflow:auto;display:grid;gap:6px';const updateCount=()=>{count.textContent=`함께 보정 ${review.selectedIds.length} / 연결 도형 ${review.candidates.length}`;};updateCount();box.append(count,impacts);
      const extent=g=>[0,1].map(axis=>number(Math.max(...g.points.map(p=>p[axis]))-Math.min(...g.points.map(p=>p[axis])))).join(' × ');
      for(const c of review.candidates){const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');input.type='checkbox';input.style.width='auto';input.dataset.calibrationEntity=c.id;input.checked=review.selectedIds.includes(c.id);input.disabled=!!c.reason;text.textContent=`${c.name} · ${c.reason|| `XY 범위 ${extent(c.before)} → ${extent(c.geometry)}m${c.hasOutput?' · 기존 3D 유지, 이후 재생성 필요':''}`}`;input.onchange=()=>{review.selectedIds=input.checked?[...new Set([...review.selectedIds,c.id])]:review.selectedIds.filter(id=>id!==c.id);updateCount();draw();};label.append(input,text);impacts.append(label);}
    }
    host.querySelector('#planner-snap').onchange=e=>{snap=e.target.checked;};
    host.querySelector('#finish-drawing').onclick=attempt(()=>{if(step!==2||!terrainCanvas.finish())finish();});host.querySelector('#cancel-drawing').onclick=cancelInput;host.querySelector('#fit-plan').onclick=fit;
    if(r&&step===1){
      const distanceInput=host.querySelector('#calibration-distance');distanceInput.value=String(calibrationDistance);distanceInput.onchange=()=>{calibrationDistance=Number(distanceInput.value);};
      host.querySelector('#ref-width').onchange=attempt(event=>previewCalibration(Number(event.target.value)));
      host.querySelector('#reference-opacity').onchange=event=>edit(()=>r.opacity=Number(event.target.value));
    }
    if(step===1){host.querySelector('#reference-import').onclick=onReferenceImport;const mapButton=host.querySelector('.reference-tools button[disabled]');mapButton.disabled=false;mapButton.id='map-open';mapButton.textContent='지도 가져오기';mapButton.title='지도 범위를 이미지 레퍼런스로 등록';mapButton.onclick=attempt(onMapOpen);}
    if(step===2)terrainCanvas.renderToolbar(host);
    renderDesignInspection();draw();bindCanvas();
    if(step===1&&getReferenceControlsHost?.()){const controls=host.querySelector('.reference-tools');getReferenceControlsHost().replaceChildren(controls);onReferenceRender?.();}
    viewportObserver=new ResizeObserver(()=>{const svg=host?.querySelector('#planner-canvas');if(svg?.clientWidth&&svg.clientHeight)draw();});viewportObserver.observe(host.querySelector('#planner-canvas'));
  }
  function inspect(element,entity,{workspace=step}={}){
    const disabled=entityLocked(entity);
    if(!entity&&workspace===1){const reference=ref();element.innerHTML='<h3>자료 준비</h3><p>이미지·손그림·지도를 설계 근거로 준비합니다.</p><ol class="reference-guide"><li>이미지 또는 지도 등록</li><li>실제 축척 확인</li><li>필요한 부분 보정·후보 검수</li></ol><button id="inspector-reference-import">이미지 등록</button><button id="inspector-map-open">지도 가져오기</button><p class="hint">'+(reference?'현재 자료: '+esc(p().assets[reference.assetId]?.name||reference.name||'이미지')+' · '+(referenceScaleConfirmed(reference)?'축척 확정':'축척 확인 필요'):'원본은 보존하며 보정·분석 결과를 따로 관리합니다.')+'</p>';element.querySelector('#inspector-reference-import').onclick=onReferenceImport;element.querySelector('#inspector-map-open').onclick=attempt(onMapOpen);return;}
    if(!entity&&workspace===3){element.innerHTML='<h3>생성 결과 검토</h3><p>가운데 생성 목록에서 적용 대상을 선택하세요.</p><p class="hint">설계 객체를 선택하면 이곳에서 수치를 확인할 수 있습니다. 건축 모듈 조립은 준비 중입니다.</p>';return;}
    if(!entity){element.innerHTML='<h3>2D 설계</h3><p class="hint">캔버스에서 객체를 그리거나 선택하세요. 선택한 객체의 치수와 정점을 여기서 편집합니다.</p><h4>사각형 건물 추가</h4><label>가로(m)<input id="fp-width" type="number" value="8" min=".1"></label><label>깊이(m)<input id="fp-depth" type="number" value="6" min=".1"></label><button id="add-footprint">＋ 외곽선 추가</button>';element.querySelector('#add-footprint').onclick=attempt(()=>{const width=Number(element.querySelector('#fp-width').value),depth=Number(element.querySelector('#fp-depth').value);if(!(width>0&&depth>0&&width<=1000&&depth<=1000))throw Error('치수를 확인하세요.');add('Building',rectangle([0,0,0],width,depth));});return;}
    const inputs={Building:[['floors','층수'],['floorHeight','층고(m)']],Road:[['width','도로 폭(m)'],['elevation','높이(m)']],Terrain:[['elevation','지형 높이(m)']],Water:[['elevation','수면 높이(m)'],['depth','깊이(m)']],Zone:[['elevation','표시 높이(m)']],Prop:[['elevation','높이(m)'],['size','크기(m)']]}[entity.type];
    element.innerHTML=`<span class="pill">${typeNames[entity.type]} · ${entity.geometry.type==='polygon'?'영역':entity.geometry.type==='polyline'?'경로':'위치'}</span><h3>${esc(entity.name)}</h3><label>이름<input id="entity-name" value="${esc(entity.name)}" ${disabled?'disabled':''}></label>${inputs.map(([key,label])=>`<label>${label}<input data-param="${key}" type="number" value="${entity.parameters[key]}" step="${key==='floors'?1:.1}" ${disabled?'disabled':''}></label>`).join('')}${entity.type==='Prop'?`<label>배치 모델<select id="prop-asset" ${disabled?'disabled':''}><option value="">기본 마커</option>${Object.values(p().assets).filter(a=>['glb','fbx'].includes(a.ext)).map(a=>`<option value="${a.id}" ${entity.parameters.assetId===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label>`:''}<p class="hint">참조 이미지 ${entity.referenceIds.length}개 · 연결된 생성 결과 ${p().objects.some(o=>o.sourceEntityId===entity.id)?'있음':'미생성'}</p><details id="entity-vertices" class="inspector-section" ${expandedVertices.has(entity.id)?'open':''}><summary>정점 직접 편집 <span>${entity.geometry.points.length}점</span></summary><p class="hint">미터 단위 · X / Y / Z 높이</p><div class="vertex-table"><div class="vertex-axis-labels"><small>#</small><span>X</span><span>Y</span><span>Z</span></div>${entity.geometry.points.map((point,i)=>`<div><small>${i+1}</small>${point.map((value,axis)=>`<input type="number" data-point="${i}" data-axis="${axis}" value="${number(value)}" step=".5" aria-label="정점 ${i+1} ${'XYZ'[axis]}" ${disabled?'disabled':''}>`).join('')}</div>`).join('')}</div></details><p class="hint">드래그로 정점·객체를 편집합니다. 설계 변경은 STEP 3에서 미리보기한 뒤 적용합니다.</p>${disabled?'<p>잠긴 레이어입니다.</p>':'<button id="delete-entity">설계 객체 삭제</button>'}`;
    structureEntityInspector(element,{entity,metrics:designMetrics(entity),typeName:typeNames[entity.type],hasOutput:p().objects.some(o=>o.sourceEntityId===entity.id)});
    element.querySelector('#entity-vertices').ontoggle=event=>{if(event.target.open)expandedVertices.add(entity.id);else expandedVertices.delete(entity.id);};
    const commit=fn=>edit(()=>{fn();const issues=entityIssues(entity);if(issues.length)throw Error(issues.join(', '));});
    if(entity.type==='Terrain')renderTerrainInspector(element,{entity,project:p(),commit,disabled,notify});
    if(p().references.length){
      const sources=document.createElement('details');sources.id='entity-reference-links';const summary=document.createElement('summary');summary.textContent=`설계 근거 이미지 ${entity.referenceIds.length}개`;sources.append(summary);
      const list=document.createElement('div');list.style.cssText='max-height:110px;overflow:auto';
      for(const r of p().references){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.style.width='auto';input.dataset.entityReference=r.id;input.checked=entity.referenceIds.includes(r.id);input.disabled=disabled;input.onchange=attempt(()=>commit(()=>{entity.referenceIds=input.checked?[...new Set([...entity.referenceIds,r.id])]:entity.referenceIds.filter(id=>id!==r.id);}));label.append(input,document.createTextNode(r.name||p().assets[r.assetId]?.name||'이미지'));list.append(label);}
      const clear=document.createElement('button');clear.id='entity-reference-clear';clear.textContent='근거 연결 해제 · 미터 좌표 유지';clear.disabled=disabled||!entity.referenceIds.length;clear.onclick=attempt(()=>commit(()=>entity.referenceIds=[]));sources.append(list,clear);element.querySelector('#entity-vertices').before(sources);
    }
    element.querySelector('#entity-name').onchange=attempt(event=>commit(()=>entity.name=event.target.value.slice(0,100)));
    element.querySelectorAll('[data-param]').forEach(input=>input.onchange=attempt(()=>commit(()=>entity.parameters[input.dataset.param]=Number(input.value))));
    element.querySelectorAll('[data-point]').forEach(input=>input.onchange=attempt(()=>commit(()=>entity.geometry.points[Number(input.dataset.point)][Number(input.dataset.axis)]=Number(input.value))));
    const assetSelect=element.querySelector('#prop-asset');if(assetSelect)assetSelect.onchange=attempt(()=>commit(()=>{if(assetSelect.value)entity.parameters.assetId=assetSelect.value;else delete entity.parameters.assetId;}));
    const remove=element.querySelector('#delete-entity');if(remove)remove.onclick=attempt(()=>{
      const outputs=p().objects.filter(o=>o.sourceEntityId===entity.id);
      if(!confirm('설계 객체를 삭제할까요? 연결된 3D 결과는 독립 객체로 보존합니다.'))return;
      edit(()=>{p().entities=p().entities.filter(e=>e.id!==entity.id);for(const o of outputs){delete o.sourceEntityId;delete o.recipeId;o.ownership='Independent';}});select(null);
    });
  }
  return {render,inspect,fit,refreshSelection:draw,get referenceOverlay(){return referenceOverlay;},setReferenceOverlay:value=>{referenceOverlay=!!value;draw();},showReference:id=>{if(activeReferenceId!==id){activeReferenceId=id;referenceId=null;}},getView:()=>structuredClone(view),setView:value=>{view=structuredClone(value);draw();},reset:()=>{draft=[];preview=null;drag=null;referenceOverlay=false;terrainCanvas.reset();}};
}
