import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import {createPlanner, typeNames, typeColors} from './planner.js';
import {generatedMesh} from './generated-view.js';
import {createEntity, markOverride, dependencyEdges} from '../core/scene-model.js';
import {planGeneration, applyGeneration,generationInputSignature} from '../core/generation.js';
import {assetFrame} from '../core/foundation/coordinates.js';
import {renderGenerationReview} from './generation-review.js';
import {supportSummary} from './support-summary.js';
import './style.css';
import './shell/foundation.css';
import './editor-layout.css';
import './editor-theme.css';
import {createReferenceWorkspace} from './reference-workspace.js';
import './reference-workspace.css';
import {inspectorTabs,emptyScene,previewBanner} from './editor-ui.js';
import {createFoundationShell} from './shell/foundation.js';
import {reconcileLegacy,projectLegacy,effective} from '../core/foundation/document.js';
import {CommandHistory} from '../core/foundation/history.js';
const commandHistory=new CommandHistory();let foundation=null;
function syncHistory(){history=commandHistory.past;future=commandHistory.future;}

const $=s=>document.querySelector(s), uid=()=>crypto.randomUUID();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ownershipLabel=value=>({'Generated':'생성 결과','User Override':'수동 수정','Independent':'독립 배치'}[value]||value||'독립 배치');
const model=a=>a&&['fbx','glb'].includes(a.ext);
const previewable=a=>a&&['png','jpg','jpeg','webp'].includes(a.ext);
const fileUrl=a=>`/api/files/${a.hash}?ext=${a.ext}`;
let library={assets:[],projects:[]}, project=null, step=4, selected=null, assetSelection=null, history=[],future=[],saveQueue=Promise.resolve(),saveFailed=false,pendingSaves=0,activeImport=null;
let referenceWorkspace=null;
let pendingPlan=null,libraryMode=null,referenceImportRequested=false,inspectorTab='design',previewNeedsFrame=false;
const meshVersions=new Map();
let renderer,scene,camera,orbit,gizmo,world,selectionBox,renderToken=0;const meshes=new Map(),cache=new Map();let framedProject=null;const renderOrigin=new THREE.Vector3();
$('#app').innerHTML=`<header><div class="brand"><span class="logo">L<span>↗</span></span><div>Level Design Studio<small>${window.studioDesktop?'DESKTOP WORKSPACE · FOUNDATION 0.4.2':'LOCAL WORKSPACE · WEB PREVIEW'}</small></div></div><select id="projects" aria-label="프로젝트 선택"><option value="">프로젝트를 선택하세요</option></select><button id="new-project" aria-label="새 프로젝트" title="새 프로젝트">＋ 새 프로젝트</button><div class="header-right"><span id="save-state">프로젝트를 만들어 시작하세요</span><button id="save">저장</button><button id="roadmap">도움말</button></div></header>
<nav id="steps">${['자료 준비|Reference · 이미지 / 지도','2D 설계|지형 · 도로 · 건물 자리','건물 제작|Building · 생성 미리보기','3D 검토|Preview · 배치 / 확인'].map((v,i)=>`<button data-step="${i+1}" title="${v.split('|')[1]}"><small>STEP 0${i+1}</small><b>${v.split('|')[0]}</b><span>${v.split('|')[1]}</span></button>`).join('')}</nav>
<main><aside class="library"><div class="panel-heading"><h2>에셋 라이브러리</h2><span id="asset-count">0</span></div><div class="panel-switch"><button id="show-objects">객체</button><button id="show-layers">레이어</button><button id="show-assets">에셋</button></div><div id="scene-layers" hidden></div><div id="library-assets"><div class="segmented"><button data-scope="shared" class="active">공용</button><button data-scope="project">프로젝트</button></div><input id="search" placeholder="모델·텍스처 검색" aria-label="에셋 검색"><div class="filters"><select id="asset-filter" aria-label="에셋 종류"><option value="all">모든 에셋</option><option value="model">3D 모델</option><option value="texture">텍스처</option><option value="used">배치한 모델</option></select><button id="import">＋ 등록</button></div><p class="hint">FBX · GLB · 텍스처<br>파일을 여기로 끌어 놓아도 됩니다.</p><div id="asset-list"></div><div class="library-footer">기존 모델은 상세 화면에서 ‘파일 갱신’<br>같은 에셋의 이름과 연결을 유지합니다.</div></div></aside>
<section class="workspace"><div class="workspace-toolbar"><div><small id="eyebrow">YOUR SPACE, YOUR RULES</small><h1 id="workspace-title">3D Preview</h1></div><div id="viewport-tools"><button data-mode="translate">이동</button><button data-mode="rotate">회전</button><button data-mode="scale">크기</button><button id="frame">전체 보기</button></div></div><div id="stage"><div id="viewport"></div><div id="step-content"></div><div id="empty"><span>◇</span><h2>첫 레벨을 만들어 보세요</h2><p>프로젝트를 만들고 모델을 등록한 뒤<br>라이브러리에서 ‘배치’를 누르세요.</p><button id="demo">샘플 블록 배치</button></div><div class="viewport-badge">Z ↑ · 미터 · 로컬 저장</div></div><div class="bottom-toolbar"><span id="scene-count">0 objects</span><span>좌클릭: 선택 / 회전 · 우클릭: 화면 이동 · 휠: 확대</span><div><button id="undo">↶ 실행 취소</button><button id="redo">↷ 다시 실행</button></div></div><div class="outliner"><div class="panel-heading"><h2>레벨 오브젝트</h2><small>선택하여 편집</small></div><div id="objects"></div></div></section>
<aside class="inspector"><div class="panel-heading"><h2>속성</h2><button id="clear-selection" title="선택 해제" aria-label="선택 해제">×</button></div><div id="inspector-content"><p class="hint">모델 또는 배치한 항목을 선택하세요.</p></div><div class="export-panel"><h3>다음 제작 단계</h3><p>Unreal / Unity 출력·Git 동기화는<br>아직 구현되지 않았습니다.</p><button id="manifest">장면 기록 다운로드 (JSON)</button><small>엔진용 변환 파일이 아닌 Studio 장면 기록입니다.</small></div></aside></main><footer><span id="project-name">NO PROJECT OPEN</span><span id="workspace-location">로컬 전용 · 동기화 미구현</span><span id="desktop-folders" hidden><button id="choose-workspace">작업 폴더 열기</button><button id="show-workspace">저장 위치 보기</button></span></footer><div id="toast" role="status"></div><input type="file" id="files" multiple hidden accept=".fbx,.glb,.png,.jpg,.jpeg,.webp,.tga,.exr,.psd"><input type="file" id="replace-file" hidden accept=".fbx,.glb,.png,.jpg,.jpeg,.webp,.tga,.exr,.psd"><dialog id="dialog"><form method="dialog"><button class="close">×</button><div id="dialog-body"></div></form></dialog>`;
let scope='shared';
function notify(message,error=false){foundation?.log((error?'오류: ':'')+message);$('#toast').textContent=message;$('#toast').className='show'+(error?' error':'');clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#toast').className='',6500);}
async function api(url,options={}){const r=await fetch(url,{...options,headers:{'Content-Type':'application/json',...options.headers}});const data=await r.json();if(!r.ok)throw Error(data.error);return data;}
function guard(fn){return (...args)=>Promise.resolve().then(()=>fn(...args)).catch(e=>notify(e.message,true));}
function requireProject(){if(!project)throw Error('먼저 프로젝트를 만들어 주세요.');}
function snapshot(){return structuredClone(project);}
function checkpoint(){commandHistory.begin(project);status('편집 중…');window.studioDesktop?.saveState('pending');}
function status(text,error=false){$('#save-state').textContent=text;$('#save-state').className=error?'failed':'';window.studioDesktop?.saveState(error?'failed':(activeImport||pendingSaves||text==='파일 등록 중…'||text==='저장 중…')?'pending':'idle');}
function save(){if(!project)return Promise.resolve();const data=snapshot(),id=project.id;pendingSaves++;status('저장 중…');saveQueue=saveQueue.then(async()=>{await api('/api/foundation/'+id+'/recovery',{method:'POST',body:JSON.stringify({project:data})});data.storage=structuredClone(project.storage);const result=await api('/api/projects/'+id,{method:'PUT',body:JSON.stringify({project:data,expectedRevision:project.revision})});if(project?.id===id){project.revision=result.revision;project.updatedAt=result.updatedAt;project.storage=result.storage;commandHistory.markSaved(data);}saveFailed=false;}).catch(e=>{saveFailed=true;status('저장 실패 · 편집 내용 유지 · 저장 버튼으로 재시도',true);notify(e.message,true);}).finally(()=>{pendingSaves--;if(!saveFailed)status(pendingSaves?'저장 중…':activeImport?'파일 등록 중…':'저장 완료');});return saveQueue;}
function edit(fn,label='편집',source='legacy'){
 requireProject();const before=snapshot();
 const result=commandHistory.execute(project,label,()=>{
  fn();
  if(source==='legacy')for(const n of before.nodes||[]){
   if(!effective(before,n,'locked'))continue;
   const kind=n.extensions?.legacyKind,key=kind==='entity'?'entities':kind==='object'?'objects':kind==='reference'?'references':null;
   if(key){const old=before[key].find(v=>v.id===n.id),next=project[key].find(v=>v.id===n.id),data=v=>{if(!v)return v;const c=structuredClone(v);delete c.locked;return c;};if(JSON.stringify(data(old))!==JSON.stringify(data(next))||kind==='entity'&&JSON.stringify(before.objects.filter(o=>o.sourceEntityId===n.id))!==JSON.stringify(project.objects.filter(o=>o.sourceEntityId===n.id)))throw Error('잠긴 객체 또는 부모/레이어의 편집을 차단했습니다.');}
  }
  if(source==='legacy')reconcileLegacy(project,before);else projectLegacy(project);
 });
 project=result.document;syncHistory();if(result.error){render();throw result.error;}pendingPlan=null;render();save();
}
async function openProject(id){if(activeImport){$('#projects').value=project?.id||'';throw Error('파일 등록을 마친 뒤 프로젝트를 전환하세요.');}await saveQueue;if(saveFailed)throw Error('저장하지 못한 변경이 있습니다. 저장을 다시 시도하거나 프로젝트 설정에서 복구 사본을 확인하세요.');if(window.studioDesktop)await api('/api/asset-monitor/active',{method:'POST',body:JSON.stringify({id})});const nextProject=id?await api('/api/projects/'+id):null;referenceWorkspace?.leave();project=nextProject;if(project)await hydrateReferences(project);selected=null;assetSelection=null;pendingPlan=null;libraryMode=null;inspectorTab='design';previewNeedsFrame=false;planner.reset();commandHistory.reset(project);syncHistory();foundation?.onOpen();render();if(project)status('저장 완료');if(window.studioDesktop)localStorage.setItem('studio:lastProject:'+desktopWorkspace,id||'');}
async function hydrateReferences(p){for(const ref of p.references){if(ref.sourceSizeInferred||!ref.sourceSize){const asset=p.assets[ref.assetId];if(!asset||!previewable(asset))continue;try{const image=new Image();image.src=fileUrl(asset);await image.decode();ref.sourceSize=[image.naturalWidth,image.naturalHeight];delete ref.sourceSizeInferred;}catch{notify('참조 이미지 크기를 읽을 수 없습니다. 파일을 확인하세요.',true);}}}}
function pin(a){project.assets[a.id]=structuredClone(a);if(a.lastAcceptance?.event)project.assetAutoEvents={...project.assetAutoEvents,[(a.projectId||'shared')+':'+a.id]:a.lastAcceptance.event};for(const n of project.nodes||[])for(const r of n.assetRefs)if(r.assetId===a.id)r.hash=a.hash;}
function newObject(kind,assetId=null){return {id:uid(),kind,assetId,name:kind==='asset'?project.assets[assetId].name:'Blockout',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],locked:false,ownership:'Independent',...(kind==='blockout'?{dimensions:[4,4,3]}:{unitScale:project.assets[assetId].ext==='fbx'?0.01:1})};}
function place(a){edit(()=>{if(!project.assets[a.id])pin(a);const o=newObject('asset',a.id);project.objects.push(o);selected=o.id;assetSelection=null;});}
function render(){
 $('#projects').innerHTML='<option value="">프로젝트 선택</option>'+library.projects.map(p=>`<option value="${p.id}" ${p.id===project?.id?'selected':''}>${esc(p.name)}</option>`).join('');
 $('#project-name').textContent=project?.name||'NO PROJECT OPEN';$('#steps').querySelectorAll('button').forEach(b=>b.classList.toggle('active',Number(b.dataset.step)===step));
 document.body.dataset.workspace=step;$('#stage').classList.toggle('generation-active',step===3);const titles=['자료 준비','2D 설계','건물 제작 · 생성 미리보기','3D 검토'];$('#workspace-title').textContent=titles[step-1];
 emptyScene($('#empty'),{project,step,pending:pendingPlan,onStep:next=>{step=next;libraryMode=null;render();if(next===3)$('#preview-generation').click();}});$('#viewport').hidden=step<3;$('#viewport-tools').hidden=step<3;$('#scene-count').textContent=(project?.entities.length||0)+' 설계 / '+(project?.objects.length||0)+' 배치';$('.viewport-badge').hidden=step<3;
 $('#undo').disabled=!history.length;$('#redo').disabled=!future.length;$('#save').disabled=!project;$('#manifest').disabled=!project;
 renderAssets();renderLayers();renderObjects();renderInspector();renderStep();foundation?.render();if(step>=3)rebuild();
}
function renderAssets(){const search=$('#search').value.toLowerCase(),filter=$('#asset-filter').value;const catalogue=scope==='shared'?library.assets.filter(a=>!a.projectId):[...new Map([...library.assets.filter(a=>a.projectId===project?.id),...Object.values(project?.assets||{})].map(a=>[a.id,a])).values()];let list=catalogue.filter(a=>a.name.toLowerCase().includes(search));if(filter==='model')list=list.filter(model);if(filter==='texture')list=list.filter(a=>!model(a));if(filter==='used')list=list.filter(a=>project?.objects.some(o=>o.assetId===a.id));$('#asset-count').textContent=list.length;
 $('#asset-list').innerHTML=list.length?list.map(a=>`<article class="asset ${assetSelection===a.id?'selected':''}" data-asset="${a.id}"><button class="asset-open" data-action="inspect" data-id="${a.id}"><div class="asset-thumb">${previewable(a)?`<img src="${fileUrl(a)}" alt="">`:`<span>${model(a)?'◇':'▧'}</span>`}<small>${a.ext.toUpperCase()}</small></div><strong>${esc(a.name)}</strong><small>${(a.size/1024).toFixed(1)} KB · ${esc(a.category)}</small></button><button data-action="${model(a)?'place':previewable(a)?'reference':'inspect'}" data-id="${a.id}" ${project?'':'disabled'}>${model(a)?'＋ 배치':previewable(a)?'레퍼런스로 사용':'상세 정보'}</button></article>`).join(''):'<div class="library-empty">아직 에셋이 없습니다.<br>파일을 등록해 시작하세요.</div>';
}
function selectedEntity(){return project?.entities.find(e=>e.id===selected||e.outputId===selected);}
function selectedObject(){return project?.objects.find(o=>o.id===selected||o.sourceEntityId===selected);}
function renderLayers(){
 const mode=libraryMode||'objects';$('#scene-layers').hidden=step===1||mode!=='layers';$('#library-assets').hidden=mode!=='assets';if($('#foundation-tree'))$('#foundation-tree').hidden=step===1||mode!=='objects';for(const key of ['objects','layers','assets'])$('#show-'+key).classList.toggle('active',mode===key);$('.library h2').textContent=mode==='objects'?'프로젝트 객체':mode==='layers'?'레이어':'에셋 라이브러리';$('#asset-count').hidden=mode!=='assets';if($('#object-search'))$('#object-search').hidden=step===1||mode!=='objects';if($('#object-search-empty')&&mode!=='objects')$('#object-search-empty').hidden=true;
 $('#show-objects').textContent=step===1?'자료':'객체';$('#show-layers').textContent=step===1?'분석':'레이어';referenceWorkspace?.renderLibrary(mode);
 $('#scene-layers').innerHTML=project?project.layers.map(layer=>`<div class="layer-row"><label><input type="checkbox" data-visible="${layer.id}" ${layer.visible?'checked':''}><span style="color:${typeColors[layer.id]}">${typeNames[layer.id]||esc(layer.name)}</span></label><small>${project.entities.filter(e=>e.layerId===layer.id).length}</small><button data-lock-layer="${layer.id}" title="레이어 잠금">${layer.locked?'잠금':'편집'}</button></div>`).join('')+'<p class="hint">보이기·잠금은 모든 STEP에서 공유됩니다.<br>에셋 탭에서 모델·이미지를 등록하세요.</p>':'<p class="hint">프로젝트를 먼저 만드세요.</p>';
 $('#scene-layers').querySelectorAll('[data-visible]').forEach(input=>input.onchange=guard(()=>edit(()=>project.layers.find(l=>l.id===input.dataset.visible).visible=input.checked)));
 $('#scene-layers').querySelectorAll('[data-lock-layer]').forEach(button=>button.onclick=guard(()=>edit(()=>{const layer=project.layers.find(l=>l.id===button.dataset.lockLayer);layer.locked=!layer.locked;})));
}
function renderObjects(){
 if(!project){$('#objects').innerHTML='<p class="hint">프로젝트를 먼저 만드세요.</p>';return;}
 const tree=Object.keys(typeNames).map(type=>{const entities=project.entities.filter(e=>e.type===type);if(!entities.length)return '';return `<details open class="tree-group"><summary style="color:${typeColors[type]}">${typeNames[type]} · ${entities.length}</summary>${entities.map(e=>{const o=project.objects.find(o=>o.sourceEntityId===e.id);return `<div class="tree-entity"><button class="entity-row ${selectedEntity()?.id===e.id?'selected':''}" data-node="${e.id}" data-entity-select="${e.id}">${esc(e.name)}<small>${o?(o.generation?.sourceSignature===generationInputSignature(project,e)?'생성됨':'갱신 필요'):'미생성'}</small></button>${o?`<button class="object-row ${selected===o.id?'selected':''}" data-object="${o.id}">↳ ${esc(o.name)}<small>${ownershipLabel(o.ownership)}</small></button>`:''}</div>`;}).join('')}</details>`;}).join('');
 const independent=project.objects.filter(o=>!o.sourceEntityId).map(o=>`<button class="object-row ${selected===o.id?'selected':''}" data-node="${o.id}" data-object="${o.id}"><span>◇</span>${esc(o.name)}<small>${o.locked?'잠금':'독립 배치'}</small></button>`).join('');
 $('#objects').innerHTML=tree+(independent?'<details open class="tree-group"><summary>독립 배치</summary>'+independent+'</details>':'')||'<p class="hint">설계 객체를 그리거나 모델을 배치하세요.</p>';
}
function renderInspector(){if(step===1&&project){referenceWorkspace.inspect($('#inspector-content'));return;}if(foundation?.inspect())return;const o=selectedObject(),a=library.assets.find(x=>x.id===assetSelection),entity=selectedEntity();const layerLocked=project?.layers.find(l=>l.id===entity?.layerId)?.locked;let html='';
 if(project&&!a&&(entity&&(!o||inspectorTab==='design')||!entity&&!o&&step<3)){planner.inspect($('#inspector-content'),entity,{workspace:step});if(entity){foundation?.appendCommon(entity.id);if(o)inspectorTabs($('#inspector-content'),'design',tab=>{inspectorTab=tab;renderInspector();});}return;}
 if(o){html=`<span class="pill">${esc(ownershipLabel(o.ownership))}</span><h3>${esc(o.name)}</h3>${entity?'<button id="edit-source">설계 속성 편집</button>':''}<label class="check"><input id="locked" type="checkbox" ${o.locked?'checked':''}>배치 잠금</label><p class="hint">위치·회전·크기는 장면에 저장됩니다.</p>`;for(const [key,label] of [['position','위치 (m)'],['rotation','회전 (°)'],['scale','크기 배율']])html+=`<h4>${label}</h4><div class="vectors">${['X','Y','Z'].map((axis,i)=>`<label>${axis}<input type="number" data-transform="${key}" data-axis="${i}" value="${Number(o[key][i].toFixed(3))}" step="${key==='rotation'?5:0.1}" ${key==='scale'?'min="0.001"':''} ${o.locked||layerLocked?'disabled':''} aria-label="${label} ${axis}"></label>`).join('')}</div>`;
 if(o.kind==='asset')html+=`<label>입력 단위 <select id="unit-scale" ${o.locked||layerLocked?'disabled':''}><option value="1" ${o.unitScale===1?'selected':''}>미터 (GLB 기본)</option><option value="0.01" ${o.unitScale===0.01?'selected':''}>센티미터 (FBX 기본)</option></select></label><p class="hint">파일의 실제 단위에 맞춰 선택하세요.<br>파일 원래 피벗을 유지합니다.</p>`;
 html+=`<div id="mesh-stats" class="stats">모델 정보 계산 중…</div><div class="actions"><button id="duplicate">복제</button><button id="remove-object" ${o.locked||layerLocked?'disabled':''}>배치 제거</button></div>`;
 }else if(a){const pinned=project?.assets[a.id],outdated=pinned&&pinned.hash!==a.hash;html=`<span class="pill">${a.projectId?'프로젝트 에셋':'공용 에셋'}</span><h3>${esc(a.name)}</h3>${previewable(a)?`<img class="texture-preview" src="${fileUrl(a)}" alt="${esc(a.name)}">`:''}<p>${a.ext.toUpperCase()} · ${(a.size/1024).toFixed(1)} KB</p><p class="hint">${model(a)?'원본 파일의 크기와 피벗을 유지하여 배치합니다.':'TGA / EXR / PSD 원본은 등록·다운로드할 수 있습니다. PSD 합성 입력은 자료 준비의 이미지 가져오기를 사용하세요. PNG·JPG·WebP는 미리보기를 지원합니다.'}</p><div class="actions"><button id="update-asset">파일 갱신</button><a class="button" href="${fileUrl(a)}&download=1&name=${encodeURIComponent(a.name)}">다운로드</a></div>${outdated?'<p class="update-note">이 프로젝트는 이전 파일을 사용 중입니다.</p><button id="apply-update">이 프로젝트에 갱신 적용</button>':''}${model(a)?'<h4>연결된 텍스처</h4><div id="attached-textures"></div><button id="attach-texture">텍스처 연결</button>':''}${pinned?'<label><input id="asset-follow-safe" type="checkbox" '+(pinned.updatePolicy!=='pinned'?'checked':' ')+'>이 프로젝트에서 승인된 에셋 변경 따라가기</label>':'<p class="hint">이 프로젝트에서는 아직 사용하지 않습니다.</p>'}<details><summary>기술 정보·변경 이력</summary><pre>${esc(JSON.stringify({history:a.history,inspection:a.metadata?.inspection,lastAcceptance:a.lastAcceptance},null,2))}</pre><p class="mono">Asset ID<br>${a.id}<br><br>파일 해시<br>${a.hash}</p></details>`;
 }else html='<div class="inspector-empty">↖<p>라이브러리의 에셋 또는<br>레벨 오브젝트를 선택하세요.</p></div>';
 $('#inspector-content').innerHTML=html;
 if(o){if($('#edit-source'))$('#edit-source').onclick=()=>{inspectorTab='design';renderInspector();renderObjects();};$('#locked').onchange=guard(e=>edit(()=>o.locked=e.target.checked));document.querySelectorAll('[data-transform]').forEach(input=>input.onchange=guard(()=>{const value=Number(input.value);if(!Number.isFinite(value)||Math.abs(value)>1e12||(input.dataset.transform==='scale'&&value<=0))throw Error('올바른 숫자를 입력하세요.');edit(()=>{o[input.dataset.transform][Number(input.dataset.axis)]=value;markOverride(o);});}));if($('#unit-scale'))$('#unit-scale').onchange=guard(e=>edit(()=>o.unitScale=Number(e.target.value)));$('#duplicate').onclick=guard(()=>edit(()=>{const n=structuredClone(o);n.id=uid();n.position[0]+=1;n.locked=false;delete n.sourceEntityId;delete n.recipeId;delete n.generation;delete n.overrides;n.ownership='Independent';project.objects.push(n);selected=n.id;}));$('#remove-object').onclick=guard(()=>edit(()=>{project.objects=project.objects.filter(x=>x.id!==o.id);selected=null;}));updateStats();if(entity)inspectorTabs($('#inspector-content'),'placement',tab=>{inspectorTab=tab;renderInspector();});else foundation?.appendCommon(o.id);
 }else if(a){if($('#asset-follow-safe'))$('#asset-follow-safe').onchange=e=>{const follow=e.target.checked;edit(()=>{project.assets[a.id].updatePolicy=follow?'follow-safe':'pinned';},'에셋 갱신 정책','common');};$('#update-asset').onclick=()=>{$('#replace-file').value='';$('#replace-file').click();};if($('#apply-update'))$('#apply-update').onclick=guard(()=>{if(confirm('새 모델의 크기·피벗·슬롯이 다르면 배치가 달라질 수 있습니다. 이 프로젝트의 에셋 참조만 갱신할까요?'))edit(()=>pin(a));});if(model(a)){
 const links=project?.textureLinks?.[a.id]||[];$('#attached-textures').innerHTML=links.map(l=>{const t=project.assets[l.assetId];return t?`<div class="texture-link">${previewable(t)?`<img src="${fileUrl(t)}" alt="">`:''}<div>${esc(t.name)}<small>${esc(l.role)}</small><a href="${fileUrl(t)}&download=1&name=${encodeURIComponent(t.name)}">다운로드</a></div></div>`:'';}).join('')||'<p class="hint">프로젝트에 연결한 텍스처가 없습니다.</p>';
 $('#attach-texture').onclick=guard(()=>{requireProject();const textures=library.assets.filter(t=>!model(t)&&(!t.projectId||t.projectId===project.id));if(!textures.length)throw Error('먼저 텍스처를 등록하세요.');showDialog(`<h2>텍스처 연결</h2><p>선택한 프로젝트의 모델 참조에만 연결합니다.<br>특수 셰이더 자동 생성은 지원하지 않습니다.</p><label>텍스처<select id="texture-choice">${textures.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label><label>용도<select id="texture-role"><option value="baseColor">BaseColor (sRGB)</option><option value="normal">Normal (data)</option><option value="orm">ORM · R:AO G:Roughness B:Metallic</option><option value="special">Special · 엔진에서 처리</option></select></label><button type="button" id="confirm-texture">연결 저장</button>`);$('#confirm-texture').onclick=guard(()=>{const t=textures.find(x=>x.id===$('#texture-choice').value),role=$('#texture-role').value;edit(()=>{if(!project.assets[a.id])pin(a);pin(t);project.textureLinks??={};project.textureLinks[a.id]??=[];const old=project.textureLinks[a.id].find(x=>x.role===role);if(old)old.assetId=t.id;else project.textureLinks[a.id].push({assetId:t.id,role});});$('#dialog').close();});});}
 }
}
function showDialog(html){$('#dialog-body').innerHTML=html;$('#dialog').showModal();}
function renderStep(){
 previewBanner($('#stage'),{step,plan:pendingPlan,onReview:()=>{step=3;render();},onCancel:()=>{pendingPlan=null;render();}});
 if(step!==1||!project)referenceWorkspace?.leave();
 const box=$('#step-content');box.className=step===3?'generation-overlay':'';box.hidden=step===4;
 if(step===4)return;
 if(!project){box.innerHTML='<div class="step-empty">프로젝트를 만들어 레벨 설계를 시작하세요.</div>';return;}
 if(step===1){referenceWorkspace.render(box);return;}
 if(step===2){planner.render(box,step);return;}
 box.innerHTML=`<div class="generation-toolbar"><div><b>생성 미리보기</b><small>공통 기본 생성 · 건축 모듈 조립은 준비 중</small></div><select id="generation-scope"><option value="all">전체 설계 객체</option><option value="selected" ${selectedEntity()?'':'disabled'}>선택한 객체만</option></select><button id="preview-generation">생성 미리보기</button><button id="apply-generation" ${pendingPlan?'':'disabled'}>적용</button><button id="cancel-generation" ${pendingPlan?'':'disabled'}>미리보기 닫기</button></div><div class="generator-kinds">${Object.entries(typeNames).map(([type,name])=>`<span style="color:${typeColors[type]}">${name} ${project.entities.filter(e=>e.type===type).length}</span>`).join('')}</div><div id="generation-summary">${pendingPlan?`미리보기: ${pendingPlan.updates.length}개 갱신 / ${pendingPlan.conflicts.length}개 보호 · 적용 전에는 기존 저장 결과를 바꾸지 않습니다.`:'설계 객체를 선택해 속성을 편집하고, 결과를 미리 본 뒤 적용하세요.'}</div>${pendingPlan?'<details><summary>검증·지원 범위</summary>'+[...pendingPlan.diagnostics,...pendingPlan.conflicts].map(d=>'<p>'+esc(project.entities.find(e=>e.id===d.entityId)?.name)+': '+esc(d.message)+'</p>').join('')+'</details>':''}<p class="generation-limits">현재 지원: 건물 볼륨 · 도로 리본 · 높이 지형과 절벽/플랫폼/기준면 연결. 건축 모듈 조립·교차로·이웃 지형 접합·엔진 출력은 준비 중입니다.</p>`;
 renderGenerationReview(box,project,pendingPlan,()=>void rebuild());
 $('#preview-generation').onclick=guard(async()=>{const scope=$('#generation-scope').value;await saveQueue;if(saveFailed)throw Error('저장 문제를 먼저 해결하세요.');pendingPlan=planGeneration(project,scope==='selected'?[selectedEntity().id]:undefined);previewNeedsFrame=world.children.length===0&&pendingPlan.updates.length>0;renderStep();rebuild();});
 $('#apply-generation').onclick=guard(()=>{const plan=pendingPlan;if(!plan)return;const selectedPlan={...plan,updates:plan.updates.filter(o=>plan.selectedIds?.includes(o.id)??true)};edit(()=>applyGeneration(project,selectedPlan));notify('선택한 생성 결과를 적용했습니다. 사용자 변형과 독립 배치를 유지했습니다.');});
 $('#cancel-generation').onclick=()=>{pendingPlan=null;renderStep();rebuild();};
}
async function init3D(){try{scene=new THREE.Scene();scene.background=new THREE.Color('#171f2d');camera=new THREE.PerspectiveCamera(45,1,.05,10000);camera.up.set(0,0,1);camera.position.set(18,-24,18);renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));$('#viewport').append(renderer.domElement);orbit=new OrbitControls(camera,renderer.domElement);orbit.target.set(0,0,2);orbit.enableDamping=true;scene.add(new THREE.HemisphereLight(0xe4f2ff,0x535c4a,2.4));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(10,-6,20);scene.add(light);const grid=new THREE.GridHelper(200,200,0x536787,0x303d53);grid.rotation.x=Math.PI/2;grid.position.z=-.05;scene.add(grid);scene.add(new THREE.AxesHelper(3));world=new THREE.Group();scene.add(world);gizmo=new TransformControls(camera,renderer.domElement);scene.add(gizmo.getHelper());gizmo.addEventListener('dragging-changed',e=>{orbit.enabled=!e.value;if(e.value)checkpoint();else{const obj=selectedObject(),mesh=meshes.get(selected);if(obj&&mesh){obj.position=mesh.position.toArray();obj.rotation=mesh.rotation.toArray().slice(0,3).map(THREE.MathUtils.radToDeg);obj.scale=mesh.scale.toArray();markOverride(obj);reconcileLegacy(project,commandHistory.drag);const result=commandHistory.end(project,'3D Transform');project=result.document;syncHistory();if(result.error){notify(result.error.message,true);render();return;}render();save();}}});gizmo.addEventListener('objectChange',()=>selectionBox?.update());
 const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();let down;renderer.domElement.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5||gizmo.dragging||gizmo.axis)return;const rect=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(mouse,camera);let hit=ray.intersectObjects(world.children,true)[0]?.object;while(hit&&!hit.userData.instanceId)hit=hit.parent;if(hit){selected=hit.userData.instanceId;assetSelection=null;renderInspector();renderObjects();selectMesh();}});
 new ResizeObserver(()=>{const el=$('#viewport');if(!el.clientWidth||!el.clientHeight)return;renderer.setSize(el.clientWidth,el.clientHeight);camera.aspect=el.clientWidth/el.clientHeight;camera.updateProjectionMatrix();}).observe($('#viewport'));renderer.setAnimationLoop(()=>{if(step>=3){orbit.update();renderer.render(scene,camera);}});
 }catch(e){$('#viewport').innerHTML='<p class="webgl-error">3D 화면을 열 수 없습니다. WebGL을 지원하는 브라우저에서 실행하세요.</p>';notify('3D 초기화 실패: '+e.message,true);}}
async function loadModel(a){const key=a.hash+':'+a.ext;if(!cache.has(key)){const promise=(async()=>{const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(url.startsWith('blob:')||url.startsWith('data:')||url.startsWith('/api/files/')||url.startsWith(location.origin+'/api/files/'))return url;throw Error('외부 텍스처 경로는 지원하지 않습니다. 텍스처를 라이브러리에 별도 등록하세요.');});let raw;if(a.ext==='glb')raw=(await new GLTFLoader(manager).loadAsync(fileUrl(a))).scene;else raw=await new FBXLoader(manager).loadAsync(fileUrl(a));return raw;})();cache.set(key,promise);promise.catch(()=>cache.delete(key));}return clone(await cache.get(key));}
function disposeGroup(group){group.traverse(n=>{if(n.userData.ownedResource){n.geometry?.dispose();for(const mat of Array.isArray(n.material)?n.material:[n.material])mat?.dispose();}});world.remove(group);}
async function rebuild(){
 if(!world)return;const token=++renderToken;gizmo.detach();
 if(selectionBox){scene.remove(selectionBox);selectionBox.geometry.dispose();selectionBox.material.dispose();selectionBox=null;}
 const outputs=new Map((project?.objects||[]).map(o=>[o.id,o]));for(const update of pendingPlan?.updates||[])if(!pendingPlan.selectedIds||pendingPlan.selectedIds.includes(update.id))outputs.set(update.id,update);
 for(const group of [...world.children])if(!outputs.has(group.userData.instanceId)){disposeGroup(group);meshVersions.delete(group.userData.instanceId);}
 meshes.clear();
 for(const o of outputs.values()){
  const entity=project.entities.find(e=>e.id===o.sourceEntityId),node=project.nodes?.find(n=>n.id===(o.sourceEntityId||o.id)),visible=node?effective(project,node,'visible'):!entity||project.layers.find(l=>l.id===entity.layerId)?.visible!==false;
  const signature=JSON.stringify(o)+(project.assets[o.assetId]?.hash||'')+(pendingPlan?.updates.some(u=>u.id===o.id)?':preview':'');
  let group=world.children.find(g=>g.userData.instanceId===o.id);
  if(group&&meshVersions.get(o.id)!==signature){disposeGroup(group);group=null;}
  if(!group){
   group=new THREE.Group();group.userData.instanceId=o.id;group.position.fromArray(o.position);group.rotation.set(...o.rotation.map(THREE.MathUtils.degToRad));group.scale.fromArray(o.scale);world.add(group);meshVersions.set(o.id,signature);
   if(o.kind==='blockout'){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...o.dimensions),new THREE.MeshStandardMaterial({color:0xa2bfae,roughness:.8}));mesh.userData.ownedResource=true;mesh.position.z=o.dimensions[2]/2;group.add(mesh);}
   else if(o.kind==='generated'&&!o.assetId)group.add(generatedMesh(o));
   else{const a=project.assets[o.assetId];try{const obj=await loadModel(a);if(!world.children.includes(group))continue;const conversion=new THREE.Group(),frame=assetFrame(a.ext,o.unitScale??1);conversion.rotation.x=frame.rotationX;conversion.scale.setScalar(frame.scale);conversion.add(obj);if(o.kind==='generated'){const pt=o.geometry.points[0];conversion.position.set(pt[0]-(o.anchor?.[0]||0),pt[1]-(o.anchor?.[1]||0),pt[2]-(o.anchor?.[2]||0)+(o.parameters.elevation||0));}group.add(conversion);}catch(error){group.userData.loadError=error.message;notify(a.name+' 미리보기 실패: '+error.message,true);}}
  }
  group.visible=visible;meshes.set(o.id,group);if(entity)meshes.set(entity.id,group);
 }
 if(token!==renderToken)return;if(project&&(framedProject!==project.id||previewNeedsFrame)&&world.children.length){framedProject=project.id;previewNeedsFrame=false;frameAll();}selectMesh();updateStats();
}
function selectMesh(){if(!gizmo)return;gizmo.detach();if(selectionBox){scene.remove(selectionBox);selectionBox.geometry.dispose();selectionBox.material.dispose();selectionBox=null;}const mesh=meshes.get(selected),o=selectedObject();if(mesh){selectionBox=new THREE.BoxHelper(mesh,0xc6ec9c);scene.add(selectionBox);if(o&&!o.locked&&!(project.nodes?.find(n=>n.id===(o.sourceEntityId||o.id))&&effective(project,project.nodes.find(n=>n.id===(o.sourceEntityId||o.id)),'locked'))&&!pendingPlan&&!project.layers.find(l=>l.id===selectedEntity()?.layerId)?.locked)gizmo.attach(mesh);}}
function updateStats(){const el=$('#mesh-stats'),obj=meshes.get(selected);if(!el||!obj)return;let vertices=0,triangles=0,uv=0,materials=new Set();obj.traverse(m=>{if(m.isMesh){vertices+=m.geometry.attributes.position?.count||0;triangles+=(m.geometry.index?.count||m.geometry.attributes.position?.count||0)/3;uv=Math.max(uv,m.geometry.attributes.uv?1:0,m.geometry.attributes.uv1?2:0);for(const mat of Array.isArray(m.material)?m.material:[m.material])materials.add(mat.uuid);}});const size=new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());el.innerHTML=obj.userData.loadError?`<p class="failed">미리보기 실패: ${esc(obj.userData.loadError)}</p>`:`<div><b>${vertices.toLocaleString()}</b><small>로드된 정점</small></div><div><b>${Math.round(triangles).toLocaleString()}</b><small>삼각형</small></div><div><b>${materials.size}</b><small>머티리얼</small></div><div><b>${uv}</b><small>확인된 UV 채널</small></div><p>${size.toArray().map(n=>n.toFixed(2)).join(' × ')} m</p><small>원본 Blender 정점·엔진 측정치는 미확인.<br>UV 겹침·LOD·충돌·Nanite 검사는 미구현.</small>`;}
function frameAll(){if(!world?.children.length)return;world.position.set(0,0,0);world.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(world);if(bounds.isEmpty())return;const absoluteCenter=bounds.getCenter(new THREE.Vector3()),radius=Math.max(bounds.getSize(new THREE.Vector3()).length(),4);renderOrigin.copy(absoluteCenter.length()>100000?absoluteCenter:new THREE.Vector3());world.position.copy(renderOrigin).negate();world.updateMatrixWorld(true);const center=absoluteCenter.clone().sub(renderOrigin);orbit.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(1,-1.5,1).normalize().multiplyScalar(radius*1.4));orbit.update();$('.viewport-badge').textContent=renderOrigin.length()?'Z ↑ · 미터 · 큰 좌표 표시 보정 · 원본 좌표 유지':'Z ↑ · 미터 · 로컬 저장';selectionBox?.update();}


function importFiles(files,replaceId=null,referenceFrame=null){if(activeImport)throw Error('이미 파일을 등록하고 있습니다. 잠시 기다려 주세요.');const asReference=!!referenceFrame||referenceImportRequested&&!replaceId;referenceImportRequested=false;activeImport=runImport(files,replaceId,asReference,referenceFrame).finally(()=>{activeImport=null;status(saveFailed?'저장 실패 · 편집 내용 유지':'저장 완료',saveFailed);});return activeImport;}
async function runImport(files,replaceId=null,asReference=false,referenceFrame=null){
 if(asReference&&[...files].some(f=>!/\.(png|jpe?g|webp|psd)$/i.test(f.name)))throw Error('자료 이미지는 PNG·JPG·WebP 또는 RGB 8비트 PSD 파일을 사용하세요.');
 requireProject();if(saveFailed)throw Error('저장 실패 상태입니다. 현재 장면 기록을 다운로드해 보존한 뒤 새로고침하세요.');
 for(const inputFile of files){
  let file=inputFile,effectiveFrame=referenceFrame;
  if(file.size>48*1024*1024)throw Error('파일당 최대 48MB입니다.');status('파일 등록 중…');
  let content=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('파일 읽기 실패'));reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(file);});
  if(asReference&&/\.psd$/i.test(file.name)){
   if(!window.studioDesktop?.flattenPsd)throw Error('PSD 합성 입력은 Windows 프로그램에서 사용할 수 있습니다.');
   status('PSD 합성 이미지 준비 중…');const converted=await window.studioDesktop.flattenPsd({content});
   const original=await api('/api/assets',{method:'POST',body:JSON.stringify({name:file.name,content,sourcePath:window.studioDesktop.filePath(file)||undefined,projectId:scope==='shared'?null:project.id,category:'Texture',kind:'Texture'})});
   library=await api('/api/state');edit(()=>pin(original),'PSD 원본 보존');await saveQueue;if(saveFailed)throw Error('PSD 원본 참조 저장 실패. 원본 파일은 보존됩니다.');
   content=converted.content;const bytes=Uint8Array.from(atob(content),c=>c.charCodeAt(0));file=new File([bytes],inputFile.name.replace(/\.[^.]+$/,'').slice(0,220)+'-flattened.png',{type:'image/png'});
   effectiveFrame={sourceSize:[converted.width,converted.height],scaleConfirmed:false,derived:{version:1,sourceAssetId:original.id,sourceHash:original.hash,sourceName:original.name,operation:{type:'psd-flatten',mode:converted.mode,layersImported:false},engine:converted.engine,coordinatePolicy:'requires-new-metric-calibration'}};
  }
  const existing=library.assets.find(a=>a.id===replaceId),isModel=model({ext:file.name.split('.').pop().toLowerCase()}),descriptor=file.name.endsWith('.json');
  const a=await api('/api/assets',{method:'POST',body:JSON.stringify({name:file.name,content,sourcePath:window.studioDesktop?.filePath(file)||undefined,projectId:existing?existing.projectId:scope==='shared'?null:project.id,assetId:replaceId,category:isModel?'Model':descriptor?(foundation?.assetKind()||'Material'):'Texture',kind:isModel?'Model':descriptor?(foundation?.assetKind()||'Material'):(foundation?.assetKind()==='Model'?'Texture':foundation?.assetKind())})});
  library=await api('/api/state');if(!replaceId){edit(()=>{if(!project.assets[a.id])pin(a);},'에셋 등록');await saveQueue;if(saveFailed)throw Error('프로젝트 참조 저장 실패. 등록 파일은 보존됩니다.');}
  assetSelection=a.id;selected=null;libraryMode=asReference?null:'assets';
  if(asReference){
   const image=new Image();image.src=fileUrl(a);await image.decode();
   edit(()=>{let ref=effectiveFrame?null:project.references.find(r=>r.assetId===a.id);if(!ref){ref={id:uid(),name:a.name,assetId:a.id,widthMeters:100,sourceSize:[image.naturalWidth,image.naturalHeight],origin:[0,0,0],rotation:0,opacity:.65,...structuredClone(effectiveFrame||{})};project.references.unshift(ref);if(effectiveFrame?.geo)project.extensions.geoReference??={version:1,anchor:[...effectiveFrame.geo.anchor],method:effectiveFrame.geo.method};}},'참조 이미지 등록');
   step=1;assetSelection=null;libraryMode=null;await saveQueue;if(saveFailed)throw Error('참조 이미지 저장 실패');
  }
  render();notify(a.updatePending?'구조 변경 검토가 필요합니다. 에셋 변경 상태에서 확인하세요.':replaceId?'에셋 갱신을 처리했습니다.':asReference?'참조 이미지를 등록했습니다.':'에셋을 등록했습니다.');
 }status('저장 완료');
}
async function editReferenceImage(id){
 if(!window.studioDesktop?.previewReference)throw Error('이미지 보정은 Windows 프로그램에서 사용할 수 있습니다.');
 await saveQueue;if(saveFailed)throw Error('저장 문제를 먼저 해결하세요.');const projectId=project.id,reference=structuredClone(project.references.find(r=>r.id===id)),asset=structuredClone(project.assets[reference.assetId]);
 const {openImageWorkspace}=await import('./image-workspace.js'),{referenceFrameSignature}=await import('../core/foundation/image-derivation.js');
 openImageWorkspace({reference,asset,fileUrl,notify,preview:request=>window.studioDesktop.previewReference({...request,projectId}),onApply:async result=>{
  const current=project?.references.find(r=>r.id===id);if(project?.id!==projectId||!current||referenceFrameSignature(current)!==referenceFrameSignature(reference)||project.assets[current.assetId]?.hash!==asset.hash)throw Error('원본이 변경됐습니다. 편집 창을 다시 여세요.');
  const bytes=Uint8Array.from(atob(result.content),c=>c.charCodeAt(0));await importFiles([new File([bytes],asset.name.replace(/\.[^.]+$/,'')+'-'+result.frame.derived.operation.type+'.png',{type:'image/png'})],null,result.frame);
 }});
}
async function editReferenceRaster(id){
 if(!window.studioDesktop?.photoCraftOpen)throw Error('PhotoCraft 편집은 Windows 프로그램에서 사용할 수 있습니다.');
 await saveQueue;if(saveFailed)throw Error('저장 문제를 먼저 해결하세요.');
 const projectId=project.id,reference=structuredClone(project.references.find(r=>r.id===id));if(!reference)throw Error('이미지를 선택하세요.');
 const asset=structuredClone(project.assets[reference.assetId]),{referenceFrameSignature}=await import('../core/foundation/image-derivation.js');
 const {referenceScaleConfirmed}=await import('../core/foundation/references.js');
 const {openPhotoCraftWorkspace}=await import('./photocraft-workspace.js');let sessionId=null;
 const engine={open:async()=>{const view=await window.studioDesktop.photoCraftOpen({projectId,referenceId:id,sourceHash:asset.hash,signature:referenceFrameSignature(reference)});sessionId=view.sessionId;return view;},command:(command,params)=>window.studioDesktop.photoCraftCommand({sessionId,command,params}),export:()=>window.studioDesktop.photoCraftExport({sessionId}),close:()=>sessionId?window.studioDesktop.photoCraftClose({sessionId}):Promise.resolve()};
 await openPhotoCraftWorkspace({reference,asset,engine,notify,onApply:async result=>{
  const current=project?.references.find(r=>r.id===id);
  if(project?.id!==projectId||!current||referenceFrameSignature(current)!==referenceFrameSignature(reference)||project.assets[current.assetId]?.hash!==asset.hash)throw Error('기준 자료가 변경됐습니다. 편집 창을 다시 여세요.');
  if(result.width!==reference.sourceSize[0]||result.height!==reference.sourceSize[1])throw Error('편집 결과의 크기가 바뀌었습니다. 좌표 확인이 필요합니다.');
  const stem=asset.name.replace(/\.[^.]+$/,'').slice(0,200);
  const native=await api('/api/assets',{method:'POST',body:JSON.stringify({name:stem+'-editable.pcraft',content:result.documentContent,projectId,category:'Texture',kind:'Texture'})});
  library=await api('/api/state');edit(()=>pin(native),'PhotoCraft 편집 문서 보존');await saveQueue;if(saveFailed)throw Error('편집 문서 저장 실패. 작업은 편집 창에 유지됩니다.');
  const previous=reference.derived?.operation?.type==='photocraft-edit'?reference.derived:null;
  const frame={sourceSize:[...reference.sourceSize],widthMeters:reference.widthMeters,origin:structuredClone(reference.origin),rotation:reference.rotation||0,opacity:reference.opacity??.65,scaleConfirmed:referenceScaleConfirmed(reference),derived:{version:1,sourceReferenceId:previous?.sourceReferenceId||reference.id,sourceAssetId:previous?.sourceAssetId||reference.assetId,sourceHash:previous?.sourceHash||asset.hash,documentAssetId:native.id,documentHash:native.hash,sourceFrame:{id:reference.id,assetId:reference.assetId,sourceSize:reference.sourceSize,widthMeters:reference.widthMeters,origin:reference.origin,rotation:reference.rotation},operation:{type:'photocraft-edit'},engine:{name:'PhotoCraft',version:'0.23.1',commit:'45066c48292e92229ada3459a83453439514c83d'},coordinatePolicy:'preserve-source-pixel-scale'}};
  for(const key of ['geo','calibration'])if(reference[key])frame[key]=structuredClone(reference[key]);
  const bytes=Uint8Array.from(atob(result.content),c=>c.charCodeAt(0));await importFiles([new File([bytes],stem+'-photocraft.png',{type:'image/png'})],null,frame);
 }});
}
async function editReferenceLegacyRaster(id){
 await saveQueue;if(saveFailed)throw Error('저장 문제를 먼저 해결하세요.');
 const projectId=project.id,reference=structuredClone(project.references.find(r=>r.id===id));
 if(!reference)throw Error('편집할 이미지를 선택하세요.');
 const asset=structuredClone(project.assets[reference.assetId]);
 const rasterSource=reference.derived?.operation?.type==='raster-edit'?reference.derived:null;
 const backingAsset=rasterSource?project.assets[rasterSource.sourceAssetId]:asset;
 const sourceAsset=backingAsset&&{...backingAsset,hash:rasterSource?.sourceHash||backingAsset.hash};
 if(!sourceAsset)throw Error('편집 원본 파일을 찾을 수 없습니다.');
 const {openRasterWorkspace}=await import('./raster-workspace.js');
 const {rasterDerivedFrame}=await import('../core/foundation/raster-edit.js');
 const {referenceFrameSignature}=await import('../core/foundation/image-derivation.js');
 await openRasterWorkspace({reference,asset,sourceAsset:structuredClone(sourceAsset),fileUrl,notify,onApply:async result=>{
  const current=project?.references.find(r=>r.id===id);
  if(project?.id!==projectId||!current||referenceFrameSignature(current)!==referenceFrameSignature(reference)||project.assets[current.assetId]?.hash!==asset.hash)throw Error('기준 자료가 변경됐습니다. 편집 창을 다시 여세요.');
  const frame=rasterDerivedFrame(reference,asset,result.document),bytes=Uint8Array.from(atob(result.content),c=>c.charCodeAt(0));
  await importFiles([new File([bytes],asset.name.replace(/\.[^.]+$/,'')+'-edited.png',{type:'image/png'})],null,frame);
 }});
}
async function analyzeReference(id,batchId=null){
 if(!window.studioDesktop?.analyzeReference)throw Error('이미지 후보 분석은 Windows 프로그램에서 사용할 수 있습니다.');
 await saveQueue;if(saveFailed)throw Error('저장 문제를 먼저 해결하세요.');const projectId=project.id,reference=structuredClone(project.references.find(r=>r.id===id)),asset=structuredClone(project.assets[reference.assetId]);
 const {openAnalysisWorkspace}=await import('./analysis-workspace.js'),{addAnalysisBatch,saveAnalysisCandidateEdits,approveAnalysisCandidates,rejectAnalysisCandidates}=await import('../core/foundation/analysis-candidates.js'),{referenceFrameSignature}=await import('../core/foundation/image-derivation.js');
 const batches=project.extensions.referenceAnalysis?.filter(b=>b.sourceReferenceId===id)||[],existing=batchId?batches.find(b=>b.id===batchId):batches.at(-1),batchCopy=bid=>structuredClone(project.extensions.referenceAnalysis.find(b=>b.id===bid));
 if(batchId&&!existing)throw Error('선택한 분석 기록이 없습니다. 자료 목록을 다시 확인하세요.');
 const sameProject=()=>{if(project?.id!==projectId)throw Error('작업 프로젝트가 변경됐습니다.');};
 openAnalysisWorkspace({reference,asset,fileUrl,notify,existing,batches,maskForBatch:b=>fileUrl(project.assets[b.maskAssetId]),maskAsset:existing&&project.assets[existing.maskAssetId],analyze:request=>window.studioDesktop.analyzeReference({...request,projectId}),onSave:async result=>{
  sameProject();if(activeImport)throw Error('파일 등록을 마친 뒤 저장하세요.');let batchId;
  activeImport=(async()=>{status('파일 등록 중…');const mask=await api('/api/assets',{method:'POST',body:JSON.stringify({name:asset.name.replace(/\.[^.]+$/,'')+'-analysis-mask.png',content:result.maskContent,projectId,category:'Mask',kind:'Mask'})});library=await api('/api/state');edit(()=>pin(mask),'분석 마스크 등록');await saveQueue;if(saveFailed)throw Error('분석 마스크 저장 실패');edit(()=>{batchId=addAnalysisBatch(project,{referenceId:id,sourceHash:asset.hash,signature:referenceFrameSignature(reference),maskAssetId:mask.id,result}).id;},'이미지 후보 저장');await saveQueue;if(saveFailed)throw Error('후보 저장 실패');})();
  try{await activeImport;return batchCopy(batchId);}finally{activeImport=null;status(saveFailed?'저장 실패 · 편집 내용 유지':'저장 완료',saveFailed);}
 },onSaveEdits:async(bid,requests)=>{sameProject();edit(()=>saveAnalysisCandidateEdits(project,bid,requests),'후보 정점·유형 수정');await saveQueue;if(saveFailed)throw Error('후보 수정 저장 실패');return batchCopy(bid);},onApprove:async(bid,requests)=>{sameProject();edit(()=>approveAnalysisCandidates(project,bid,requests),'선택 후보 승인');await saveQueue;if(saveFailed)throw Error('후보 승인 저장 실패');return batchCopy(bid);},onReject:async(bid,ids)=>{sameProject();edit(()=>rejectAnalysisCandidates(project,bid,ids),'선택 후보 제외');await saveQueue;if(saveFailed)throw Error('후보 제외 저장 실패');return batchCopy(bid);},onVisibility:async(bid,value)=>{sameProject();edit(()=>project.extensions.referenceAnalysis.find(b=>b.id===bid).visible=value,'후보 레이어 표시');await saveQueue;if(saveFailed)throw Error('표시 상태 저장 실패');return batchCopy(bid);}});
}
$('#new-project').onclick=()=>{if(activeImport){notify('파일 등록을 마친 뒤 프로젝트를 만드세요.',true);return;}showDialog('<div class="section-tag">NEW PROJECT</div><h2>새로운 레벨의 시작</h2><label>프로젝트 이름<input id="project-title" maxlength="100" placeholder="예: Castle Town" autofocus></label><p class="hint">공용 라이브러리를 재사용하며<br>프로젝트별 배치와 작업을 따로 저장합니다.</p><button type="button" id="create-project">프로젝트 만들기</button>');$('#create-project').onclick=guard(async()=>{await saveQueue;if(saveFailed)throw Error('기존 프로젝트의 저장 문제를 먼저 해결하세요.');const p=await api('/api/projects',{method:'POST',body:JSON.stringify({name:$('#project-title').value})});library=await api('/api/state');await openProject(p.id);$('#dialog').close();notify('프로젝트를 만들었습니다.');});};
$('#projects').onchange=guard(e=>openProject(e.target.value));$('#save').onclick=guard(save);$('#steps').onclick=e=>{const b=e.target.closest('[data-step]');if(b){step=Number(b.dataset.step);assetSelection=null;libraryMode=null;render();}};
document.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>{scope=b.dataset.scope;document.querySelectorAll('[data-scope]').forEach(x=>x.classList.toggle('active',x===b));renderAssets();});$('#search').oninput=renderAssets;$('#asset-filter').onchange=renderAssets;
$('#asset-list').onclick=guard(async e=>{const b=e.target.closest('[data-action]');if(!b)return;const a=library.assets.find(x=>x.id===b.dataset.id);if(b.dataset.action==='place')place(a);else if(b.dataset.action==='reference'){if(!previewable(a))throw Error('레퍼런스는 PNG·JPG·WebP 이미지를 사용하세요.');const image=new Image();image.src=fileUrl(a);await image.decode();assetSelection=null;selected=null;edit(()=>{pin(a);let ref=project.references.find(r=>r.assetId===a.id);if(!ref){ref={id:uid(),assetId:a.id,widthMeters:100,sourceSize:[image.naturalWidth,image.naturalHeight],origin:[0,0,0],rotation:0,opacity:.65};project.references.push(ref);}else ref.sourceSize=[image.naturalWidth,image.naturalHeight];project.references=[ref,...project.references.filter(r=>r.id!==ref.id)];});step=1;libraryMode=null;referenceWorkspace.choose(project.references[0].id);render();}else{assetSelection=a.id;selected=null;renderAssets();renderObjects();renderInspector();foundation?.render();selectMesh();}});
$('#objects').onclick=e=>{const entityButton=e.target.closest('[data-entity-select]');if(entityButton){selected=entityButton.dataset.entitySelect;assetSelection=null;render();return;}const b=e.target.closest('[data-object]');if(b){selected=b.dataset.object;assetSelection=null;renderObjects();renderInspector();selectMesh();planner.refreshSelection();}};$('#clear-selection').onclick=()=>{selected=null;assetSelection=null;renderObjects();renderInspector();selectMesh();planner.refreshSelection();};$('#import').onclick=guard(()=>{requireProject();$('#files').value='';$('#files').click();});$('#files').onchange=guard(e=>importFiles(e.target.files));$('#replace-file').onchange=guard(e=>importFiles(e.target.files,assetSelection));
$('.library').ondragover=e=>{e.preventDefault();};$('.library').ondrop=guard(e=>{e.preventDefault();if(step===1&&libraryMode!=='assets')referenceImportRequested=true;return importFiles(e.dataTransfer.files);});
$('#demo').onclick=guard(()=>edit(()=>{const o=newObject('blockout');project.objects.push(o);selected=o.id;assetSelection=null;}));document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>gizmo?.setMode(b.dataset.mode));$('#frame').onclick=frameAll;
$('#undo').onclick=guard(()=>{if(!history.length)return;project=commandHistory.undo(project);syncHistory();selected=null;pendingPlan=null;render();save();});$('#redo').onclick=guard(()=>{if(!future.length)return;project=commandHistory.redo(project);syncHistory();selected=null;pendingPlan=null;render();save();});
$('#manifest').onclick=()=>{const blob=new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=project.name+'-scene.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('#roadmap').onclick=()=>showDialog(supportSummary);
if(!window.studioDesktop)window.addEventListener('beforeunload',e=>{if($('#save-state').textContent==='저장 중…'||saveFailed){e.preventDefault();e.returnValue='';}});
$('#show-objects').onclick=()=>{libraryMode='objects';renderLayers();};$('#show-layers').onclick=()=>{libraryMode='layers';renderLayers();};$('#show-assets').onclick=()=>{libraryMode='assets';renderLayers();};
const planner=createPlanner({
 getProject:()=>project,getSelected:()=>selected,select:id=>{selected=id;assetSelection=null;renderObjects();renderInspector();selectMesh();},edit,fileUrl,notify,
 onReferenceImport:()=>{referenceImportRequested=true;$('#files').value='';$('#files').click();},onImageEdit:editReferenceImage,onRasterEdit:editReferenceRaster,onLegacyRasterEdit:editReferenceLegacyRaster,onAnalyze:analyzeReference,
 onReferenceIssue:id=>{step=1;assetSelection=null;libraryMode=null;referenceWorkspace.choose(id);},
 getReferenceControlsHost:()=>referenceWorkspace?.controlsHost,onReferenceSelect:id=>referenceWorkspace.choose(id),onReferenceRender:()=>referenceWorkspace?.afterImageRender(),
 onMapOpen:()=>{requireProject();referenceWorkspace.showMap();}
});
referenceWorkspace=createReferenceWorkspace({getProject:()=>project,getStep:()=>step,getSelected:()=>selected,planner,edit,render,fileUrl,notify,select:id=>{selected=id;assetSelection=null;render();},onImport:()=>{referenceImportRequested=true;$('#files').value='';$('#files').click();},importImages:(files,frame)=>{referenceImportRequested=true;return importFiles(files,null,frame);},onImageEdit:editReferenceImage,onAnalyze:analyzeReference,onSaveVector:async layer=>{const {saveReferenceVectorLayer}=await import('../core/foundation/reference-vectors.js');edit(()=>saveReferenceVectorLayer(project,layer),'지도 벡터 자료 저장');await saveQueue;if(saveFailed)throw Error('지도 벡터 저장 실패. 초안은 유지됩니다.');},onDesign:()=>{step=2;libraryMode=null;render();}});
$('#files').addEventListener('cancel',()=>{referenceImportRequested=false;});
let desktopWorkspace='';
if(window.studioDesktop){
 const info=await window.studioDesktop.info();desktopWorkspace=info.workspace;
 $('#desktop-folders').hidden=false;$('#workspace-location').textContent='저장 위치: '+info.workspace;$('#workspace-location').title=info.workspace;
 $('#show-workspace').onclick=guard(()=>window.studioDesktop.showWorkspace());
 $('#choose-workspace').onclick=guard(async()=>{if(activeImport)await activeImport;await saveQueue;if(saveFailed)throw Error('현재 편집을 보존한 뒤 저장 문제를 먼저 해결하세요.');const result=await window.studioDesktop.chooseWorkspace();if(result)location.reload();});
 window.studioDesktop.onClose(async()=>{if(activeImport)await activeImport.catch(()=>{});await saveQueue;window.studioDesktop.closeReady(!saveFailed);});
}
foundation=createFoundationShell({getProject:()=>project,getLibrary:()=>library,getSelected:()=>selected,getAssetSelected:()=>assetSelection,setSelected:id=>{selected=id;assetSelection=null;},api,guard,notify,edit,render,save,openProject,showDialog,wait:()=>saveQueue,isFailed:()=>saveFailed,clearSaveFailure:()=>{saveFailed=false;},setProject:p=>{project=p;commandHistory.reset(p);syncHistory();},refreshLibrary:async()=>{library=await api('/api/state');},selectMesh,history:commandHistory,desktopInfo:window.studioDesktop?await window.studioDesktop.info():null});
await init3D();library=await api('/api/state');render();
if(window.studioDesktop){const last=localStorage.getItem('studio:lastProject:'+desktopWorkspace);if(foundation.settings.restoreLast&&last&&library.projects.some(p=>p.id===last)){try{await openProject(last);}catch(e){notify(e.message,true);}}else foundation.home();}


let pollingAssets=false;
async function syncExternalAssets(){if(pollingAssets||activeImport||pendingSaves||saveFailed||commandHistory.drag)return;pollingAssets=true;try{const monitor=await api('/api/asset-monitor');library=await api('/api/state');if(project){const changes=library.assets.filter(a=>{const old=project.assets[a.id],key=(a.projectId||'shared')+':'+a.id;return old&&(old.projectId||null)===(a.projectId||null)&&old.hash!==a.hash&&old.updatePolicy!=='pinned'&&a.lastAcceptance?.hash===a.hash&&project.assetAutoEvents?.[key]!==a.lastAcceptance.event;});if(changes.length)edit(()=>{for(const a of changes){const policy=project.assets[a.id].updatePolicy;pin(a);project.assets[a.id].updatePolicy=policy;project.assetAutoEvents={...project.assetAutoEvents,[(a.projectId||'shared')+':'+a.id]:a.lastAcceptance.event};}},'외부 에셋 갱신','common');}foundation.render();foundation.assetStatus?.(monitor);}catch(e){foundation.log('변경 감지: '+e.message);}finally{pollingAssets=false;}}
if(window.studioDesktop){setInterval(()=>{void syncExternalAssets();},1500);void syncExternalAssets();}



