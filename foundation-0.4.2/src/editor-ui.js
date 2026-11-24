export function inspectorTabs(host,active,onChange){
 const tabs=document.createElement('div');tabs.className='inspector-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','객체 속성');
 for(const [key,label] of [['design','설계 속성'],['placement','생성 결과 배치']]){const button=document.createElement('button');button.id='inspect-'+key;button.textContent=label;button.setAttribute('role','tab');button.setAttribute('aria-selected',String(active===key));button.classList.toggle('active',active===key);button.onclick=()=>onChange(key);tabs.append(button);}host.prepend(tabs);
}
export function emptyScene(host,{project,step,pending,onStep}){
 host.hidden=true;if(!project||step!==4||project.objects.length||pending?.updates.length)return;
 host.hidden=false;const hasDesign=project.entities.length>0;host.innerHTML=`<span>◇</span><h2>${hasDesign?'3D 결과를 아직 생성하지 않았습니다':'첫 레벨을 만들어 보세요'}</h2><p>${hasDesign?`설계 객체 ${project.entities.length}개가 저장되어 있습니다.<br>생성할 결과를 미리 보고 선택해 적용하세요.`:'이미지·지도를 준비하거나 2D에서 지형·도로·건물을 설계하세요.'}</p><button id="empty-next">${hasDesign?'생성 미리보기로 이동':'자료 준비 시작'}</button>`;host.querySelector('button').onclick=()=>onStep(hasDesign?3:1);
}
const toolPaths={select:'m5 3 12 9-6 1-3 6Z',pan:'M8 10V5a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v9c0 5-3 7-7 7H11l-6-7a2 2 0 0 1 3-3l2 2',rectangle:'M4 5h16v14H4Z',Terrain:'m3 18 6-12 5 8 3-5 4 9ZM8 8l3 3',Road:'m7 3-3 18m13-18 3 18M12 4v4m0 4v3m0 4v2',Building:'M6 21V4h12v17M3 21h18M9 8h1m4 0h1m-6 4h1m4 0h1m-5 9v-5h4v5',Water:'M3 9q3-4 6 0t6 0 6 0M3 15q3-4 6 0t6 0 6 0',Zone:'M4 4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5m0-6V4',Prop:'m12 3 8 5v9l-8 5-8-5V8Zm-8 5 8 5 8-5m-8 5v9',fit:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5'};
function toolIcon(key){return `<svg class="editor-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${toolPaths[key]||toolPaths.select}"/></svg>`;}
export function structureEntityInspector(host,{entity,metrics,typeName,hasOutput}){
 const heading=document.createElement('section');heading.className='entity-heading';
 const type=host.querySelector('.pill');type.className='entity-kind';type.insertAdjacentHTML('afterbegin',toolIcon(entity.type));
 const name=host.querySelector('#entity-name').closest('label');name.className='entity-name-field';
 host.querySelector('h3').remove();heading.append(type,name);
 const state=document.createElement('span');state.className='entity-output-state';state.textContent=hasOutput?'3D 결과 연결됨':'설계 중 · 아직 생성하지 않음';heading.append(state);host.prepend(heading);
 const specification=document.createElement('section');specification.className='property-group';const title=document.createElement('h4');title.textContent=typeName+' 규격';specification.append(title);
 const fields=document.createElement('div');fields.className='property-fields';for(const input of host.querySelectorAll('[data-param],#prop-asset'))fields.append(input.closest('label'));specification.append(fields);
 if(metrics){const measures=document.createElement('div');measures.className='entity-measures';const values=entity.geometry.type==='polyline'?[['길이',metrics.length,'m'],['폭',entity.parameters.width,'m']]:[['가로',metrics.width,'m'],['세로',metrics.depth,'m'],...(metrics.area===null?[]:[['면적',metrics.area,'m²']])];for(const [label,value,unit]of values){const cell=document.createElement('div'),caption=document.createElement('span'),number=document.createElement('strong');caption.textContent=label;number.textContent=Number(value.toFixed(2)).toLocaleString()+' '+unit;cell.append(caption,number);measures.append(cell);}specification.append(measures);}
 heading.after(specification);
 const help=host.querySelector('#entity-vertices').nextElementSibling;if(help?.matches('.hint')){const details=document.createElement('details');details.className='inspector-help';details.innerHTML='<summary>편집 안내</summary>';help.before(details);details.append(help);}
 const stateHint=host.querySelector(':scope > p.hint');if(stateHint)stateHint.remove();
}
export function plannerToolbar({step,snap,typeNames,typeColors}){
 const button=(key,label)=>`<button data-tool="${key}" title="${label}" aria-label="${label}" aria-pressed="false" style="--tool-color:${typeColors[key]||'var(--editor-accent)'}">${toolIcon(key)}<span>${label}</span></button>`;
 const drawing=button('rectangle','사각형 건물')+Object.entries(typeNames).map(([key,label])=>button(key,label)).join('');
 return `<div class="planner-tools editor-tool-strip" role="toolbar" aria-label="${step===1?'자료 준비 도구':'2D 설계 도구'}"><div class="tool-group navigation-tools" role="group" aria-label="선택과 이동">${button('select','선택')}${button('pan','화면 이동')}</div>${step===1?`<details id="reference-trace-tools" class="trace-tools"><summary>이미지 윤곽 따라 설계하기</summary><p class="hint">완성하면 STEP 2 설계 객체로 저장합니다. 이미지에 선을 그리려면 이미지 편집의 선·도형 도구를 사용하세요.</p><div>${drawing}</div></details>`:`<div class="tool-group drawing-tools" role="group" aria-label="도형 만들기">${drawing}</div>`}</div><div class="planner-context"><span id="active-tool-name">선택</span><span id="active-tool-hint">객체와 정점을 선택하세요</span><div class="drawing-actions"><button id="finish-drawing" disabled>그리기 완료</button><button id="cancel-drawing" disabled>입력 취소</button></div><div class="plan-view-options"><label><input id="planner-snap" type="checkbox" ${snap?'checked':''}>스냅 1m</label><button id="fit-plan" title="설계 전체를 화면에 맞추기">${toolIcon('fit')}전체 보기</button></div></div>`;
}
export function previewBanner(host,{step,plan,onReview,onCancel}){
 let banner=host.querySelector('#preview-status');if(!banner){banner=document.createElement('div');banner.id='preview-status';host.append(banner);}banner.hidden=step!==4||!plan;if(banner.hidden)return;
 banner.innerHTML=`<span>적용 전 미리보기 · 선택 ${plan.selectedIds?.length??plan.updates.length}개</span><button id="return-generation">생성 검토로 돌아가기</button><button id="dismiss-preview">미리보기 닫기</button>`;banner.querySelector('#return-generation').onclick=onReview;banner.querySelector('#dismiss-preview').onclick=onCancel;
}
