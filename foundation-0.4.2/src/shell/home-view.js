const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=path=>`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const folder=icon('<path d="M3 7V5h7l2 2h9v13H3z"/>');
const plus=icon('<path d="M12 5v14M5 12h14"/>');
const library=icon('<path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>');
const settings=icon('<path d="M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M9 15v6"/>');

export const homeMarkup=`<section id="foundation-home" aria-label="시작 화면">
 <aside class="home-sidebar" aria-label="시작 메뉴">
  <p class="home-sidebar-label">시작하기</p>
  <div class="home-actions"><button id="home-new">${plus}<span><b>새 프로젝트</b><small>새 레벨 작업 시작</small></span></button><button id="home-open">${folder}<span><b>프로젝트 열기</b><small>저장한 폴더에서 열기</small></span></button></div>
  <div class="home-navigation"><button id="home-projects" aria-pressed="true">${folder}<span>프로젝트</span></button><button id="home-library" aria-pressed="false">${library}<span>공용 에셋</span></button></div>
  <div class="home-sidebar-bottom"><button id="home-preferences">${settings}<span>환경설정</span></button><span class="home-version">버전 0.4.2 · 로컬 저장</span></div>
 </aside>
 <div class="home-content">
  <section id="home-project-panel" aria-labelledby="home-project-title">
   <div class="home-heading"><div><h1 id="home-project-title">프로젝트</h1><p>최근 수정한 프로젝트부터 이어서 작업하세요.</p></div><label class="home-search" for="recent-search"><span>프로젝트 검색</span><input id="recent-search" type="search" placeholder="이름 또는 저장 위치 검색"></label></div>
   <div class="home-list-heading"><h2>최근 프로젝트 <span id="recent-count" aria-live="polite"></span></h2><span>최근 수정순</span></div>
   <div id="recent-projects"></div>
  </section>
  <section id="home-library-panel" hidden aria-labelledby="home-library-title"><div class="home-heading"><div><h1 id="home-library-title">공용 에셋</h1><p>여러 프로젝트에서 함께 사용할 모델과 이미지를 관리합니다.</p></div><button id="home-library-import">파일 등록</button></div><input id="home-library-files" type="file" multiple hidden accept=".glb,.fbx,.png,.jpg,.jpeg,.webp"><label for="home-asset-search">에셋 검색<input id="home-asset-search" type="search" placeholder="이름으로 검색"></label><div id="home-assets"></div></section>
  <p id="home-warning" role="alert" hidden></p>
  <details class="home-storage"><summary>저장 위치 확인</summary><div id="home-paths"></div></details>
 </div>
</section><section id="foundation-bottom"><details><summary>작업 기록 · 로컬 저장 / 동기화 별도</summary><pre id="foundation-log"></pre></details></section>`;

export function recentProjectsMarkup(projects,query){
 const normalized=query.trim().toLocaleLowerCase();
 const results=[...projects].filter(a=>(a.name+' '+(a.path||'')).toLocaleLowerCase().includes(normalized)).sort((a,b)=>(Date.parse(b.updatedAt)||0)-(Date.parse(a.updatedAt)||0)||a.name.localeCompare(b.name,'ko'));
 if(!results.length)return {count:0,html:`<div class="home-empty">${folder}<h3>${normalized?'검색 결과가 없습니다':'아직 프로젝트가 없습니다'}</h3><p>${normalized?'다른 이름이나 저장 위치로 검색해 보세요.':'왼쪽에서 새 프로젝트를 만들거나 저장한 프로젝트를 여세요.'}</p>${normalized?'<button id="recent-clear">검색 지우기</button>':''}</div>`};
 return {count:results.length,html:results.map(a=>{
  const parts=String(a.path||'').split(/[\\/]/).filter(Boolean);const parent=parts.slice(0,-1);const location=parent.slice(-2).join(' / ')||'저장 위치 정보 없음';
  const date=Date.parse(a.updatedAt),modified=Number.isFinite(date)?new Date(date).toLocaleString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'기록 없음';
  return `<article class="home-project-row"><button class="home-project-open" data-recent="${esc(a.id)}" title="${esc(a.name)} 열기"><span class="home-project-icon">${folder}</span><span class="home-project-info"><strong>${esc(a.name)}</strong><span class="home-project-location">${esc(location)}</span>${a.status&&a.status!=='정상'?`<span class="home-project-warning">${esc(a.status)}</span>`:''}</span><span class="home-project-modified"><small>마지막 수정</small><time ${Number.isFinite(date)?`datetime="${esc(new Date(date).toISOString())}"`:''}>${esc(modified)}</time></span><span class="home-project-arrow" aria-hidden="true">→</span></button><details class="home-project-path"><summary>전체 경로</summary><p>${esc(a.path||'저장 위치 정보 없음')}</p></details></article>`;
 }).join('')};
}
