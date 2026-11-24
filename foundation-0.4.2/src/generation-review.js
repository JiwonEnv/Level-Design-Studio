export function renderGenerationReview(host,project,plan,onSelectionChange=()=>{}){
  if(!plan)return;
  plan.selectedIds??=plan.updates.map(o=>o.id);
  const box=document.createElement('section');box.id='generation-review';
  const heading=document.createElement('h4');heading.textContent='적용할 결과 선택';const count=document.createElement('span');count.id='generation-selected-count';heading.append(count);box.append(heading);
  const updateSelection=()=>{count.textContent=`${plan.selectedIds.length} / ${plan.updates.length}개`;const apply=host.querySelector('#apply-generation');if(apply){apply.disabled=!plan.selectedIds.length;apply.textContent=`선택 ${plan.selectedIds.length}개 적용`;}onSelectionChange();};
  const actions=document.createElement('div');actions.className='generation-selection-actions';for(const [label,select] of [['전체 선택',true],['선택 해제',false]]){const button=document.createElement('button');button.textContent=label;button.onclick=()=>{plan.selectedIds=select?plan.updates.map(o=>o.id):[];box.querySelectorAll('input').forEach(input=>input.checked=select);updateSelection();};actions.append(button);}box.append(actions);
  for(const update of plan.updates){
    const old=project.objects.find(o=>o.id===update.id),row=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');
    input.type='checkbox';input.dataset.outputId=update.id;input.checked=plan.selectedIds.includes(update.id);
    row.className='generation-item';input.setAttribute('aria-label',update.name+' 적용');text.textContent=update.name;
    const status=document.createElement('small');status.textContent=old?'변경':'추가';if(old?.ownership==='User Override'){const kept=document.createElement('small');kept.className='generation-kept';kept.textContent='수동 배치 보존';text.append(kept);}
    input.onchange=()=>{plan.selectedIds=input.checked?[...new Set([...plan.selectedIds,update.id])]:plan.selectedIds.filter(id=>id!==update.id);updateSelection();};row.append(input,text,status);box.append(row);
  }
  if(!plan.updates.length){const empty=document.createElement('p');empty.textContent='적용할 변경이 없습니다. 검사 결과나 보호된 항목을 확인하세요.';box.append(empty);}
  const note=document.createElement('p');note.className='hint';note.textContent='체크한 결과를 3D로 미리 봅니다. 적용 전에는 저장된 결과를 바꾸지 않습니다.';box.append(note);host.append(box);count.textContent=`${plan.selectedIds.length} / ${plan.updates.length}개`;const apply=host.querySelector('#apply-generation');if(apply){apply.disabled=!plan.selectedIds.length;apply.textContent=`선택 ${plan.selectedIds.length}개 적용`;}
}
