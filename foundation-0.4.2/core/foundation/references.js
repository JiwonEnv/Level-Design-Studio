import {effective,projectLegacy} from './document.js';
export const referenceScaleConfirmed=ref=>ref.scaleConfirmed===true||ref.scaleConfirmed!==false&&!!(ref.calibration||ref.geo);
export function referenceScaleIssues(d,entity){return (entity.referenceIds||[]).map(id=>d.references.find(r=>r.id===id)).filter(ref=>ref&&!referenceScaleConfirmed(ref)).map(ref=>`${ref.name||d.assets[ref.assetId]?.name||'참조 이미지'}: 실제 축척을 먼저 확정하세요.`);}
// references[0] is the top layer; SVG draws bottom-to-top.
export function visibleReferenceLayers(d){return [...d.references].reverse().filter(ref=>{
  const node=d.nodes?.find(n=>n.id===ref.id);return !!d.assets[ref.assetId]&&(!node||effective(d,node,'visible'));
});}
export function moveReferenceLayer(d,id,delta){
  if(![-1,1].includes(delta))throw Error('레이어 이동 방향 오류');
  const refs=[...d.references],index=refs.findIndex(r=>r.id===id),target=index+delta;
  if(index<0)throw Error('참조 이미지를 찾을 수 없습니다.');if(target<0||target>=refs.length)return;
  const a=d.nodes.find(n=>n.id===id),b=d.nodes.find(n=>n.id===refs[target].id);
  if(!a||!b)throw Error('참조 이미지 node 누락');
  if(effective(d,a,'locked')||effective(d,b,'locked'))throw Error('잠긴 이미지의 순서는 변경할 수 없습니다.');
  [refs[index],refs[target]]=[refs[target],refs[index]];
  for(const [order,ref] of refs.entries())d.nodes.find(n=>n.id===ref.id).extensions.referenceOrder=order;
  projectLegacy(d);
}
