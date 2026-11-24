import {compose,worldTransform,rotate} from './document.js';
// Poses are local metres/quaternions, never renderer display coordinates.
export function socketIssues(d){
  const list=d.extensions?.sockets;if(list===undefined)return [];
  if(!Array.isArray(list))return [{code:'SOCKET_FORMAT'}];
  const issues=[],ids=new Set([d.id,...(d.nodes||[]).map(n=>n.id),...(d.objects||[]).map(o=>o.id),...(d.entities||[]).map(e=>e.outputId),...Object.keys(d.assets||{}),...(d.extensions?.productionIdentity?.records||[]).map(r=>r.id)]),keys=new Set(),finite=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
  list.forEach((s,index)=>{
    const issue=code=>issues.push({code,path:`extensions.sockets[${index}]`});
    if(!s||!s.pose){issue('SOCKET_FORMAT');return;}
    if(typeof s.id!=='string'||!/^[0-9a-f-]{36}$/.test(s.id)||ids.has(s.id))issue('SOCKET_ID');ids.add(s.id);
    const key=JSON.stringify([s.ownerType,s.ownerId,s.key]);if(keys.has(key)||typeof s.key!=='string'||!s.key.trim())issue('SOCKET_KEY');keys.add(key);
    if(s.ownerType==='node'){if(!d.nodes?.some(n=>n.id===s.ownerId))issue('SOCKET_OWNER');}
    else if(s.ownerType==='asset'){if(!d.assets?.[s.ownerId])issue('SOCKET_OWNER');}
    else issue('SOCKET_OWNER_TYPE');
    if(typeof s.type!=='string'||!s.type.trim()||!Array.isArray(s.accepts)||s.accepts.some(t=>typeof t!=='string'||!t.trim()))issue('SOCKET_TYPE');
    const t=s.pose;if(!finite(t.position,3)||!finite(t.rotation,4)||Math.abs(Math.hypot(...t.rotation)-1)>1e-6||!finite(t.scale,3)||t.scale.some(v=>v<=0))issue('SOCKET_POSE');
  });return issues;
}
export function defineSocket(d,descriptor){
  const next=structuredClone(d);next.extensions??={};next.extensions.sockets??=[];
  const list=next.extensions.sockets,old=list.find(s=>s.ownerType===descriptor.ownerType&&s.ownerId===descriptor.ownerId&&s.key===descriptor.key);
  const socket={...structuredClone(descriptor),id:old?.id||crypto.randomUUID()};
  if(old)list[list.indexOf(old)]=socket;else list.push(socket);
  const issues=socketIssues(next);if(issues.length)throw Error('Socket 계약 오류: '+issues.map(i=>i.code).join(', '));
  d.extensions=next.extensions;return structuredClone(socket);
}
export function socketWorldPose(d,socket,instanceNodeId){
  const owner=d.nodes.find(n=>n.id===(socket.ownerType==='node'?socket.ownerId:instanceNodeId));
  if(!owner)throw Error('Socket 배치 객체가 필요합니다.');
  if(socket.ownerType==='asset'&&!owner.assetRefs.some(a=>a.assetId===socket.ownerId))throw Error('Socket 에셋과 배치 객체가 일치하지 않습니다.');
  return compose(worldTransform(d,owner),socket.pose);
}
// Local +X is the outward connection normal. Tolerances belong to the
// connection rule; callers must supply them rather than inherit hidden defaults.
export function inspectSocketConnection(d,a,b,{distanceMetres,angleRadians,nodeA,nodeB}){
  if(!Number.isFinite(distanceMetres)||distanceMetres<0||!Number.isFinite(angleRadians)||angleRadians<0||angleRadians>Math.PI)throw Error('Socket 연결 허용 오차가 필요합니다.');
  const poseA=socketWorldPose(d,a,nodeA),poseB=socketWorldPose(d,b,nodeB),normalA=rotate([1,0,0],poseA.rotation),normalB=rotate([1,0,0],poseB.rotation);
  const distance=Math.hypot(...poseA.position.map((v,i)=>v-poseB.position[i])),dot=normalA.reduce((sum,v,i)=>sum+v*normalB[i],0),reasons=[];
  if(a.id===b.id&&nodeA===nodeB)reasons.push('SAME_SOCKET');
  if(!a.accepts.includes(b.type)||!b.accepts.includes(a.type))reasons.push('INCOMPATIBLE_TYPES');
  if(distance>distanceMetres)reasons.push('DISTANCE');
  if(dot> -Math.cos(angleRadians)+1e-9)reasons.push('DIRECTION');
  return {compatible:reasons.length===0,distanceMetres:distance,oppositionDot:dot,reasons};
}
