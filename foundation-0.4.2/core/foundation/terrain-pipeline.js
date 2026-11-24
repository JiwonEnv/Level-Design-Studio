import earcut,{deviation,refine} from 'earcut';
import {entityIssues} from '../scene-model.js';
import {terrainPointInside,pointOnTerrainSegment} from './terrain-domain.js';
import {prepareTerrainConstraints} from './terrain-constraints.js';
import {conformContourMesh} from './terrain-contour-mesh.js';
import {applyTerrainBoundary} from './terrain-boundary.js';
export {terrainPointInside} from './terrain-domain.js';
export const TERRAIN_ALGORITHM='base-profile-modifier-earcut-boundary-6';
export function terrainProfileDistance(profile,x,y){
 if(profile.shape!=='stroke')return Math.hypot(x-profile.center[0],y-profile.center[1]);
 const points=profile.points;if(points.length===1)return Math.hypot(x-points[0][0],y-points[0][1]);let distance=Infinity;
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy,t=length2?Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/length2)):0;distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy));}return distance;
}
function conformTriangles(positions,indices,keys,cellSize,heightAt,maxVertices){
 // Restore boundary points that Earcut omitted on collinear edges.
 // Split every affected triangle edge at its existing points, then fan from an
 // interior centroid. New centroids cannot create junctions on neighbouring edges.
 const originalCount=positions.length,buckets=new Map(),edgeCache=new Map(),result=[];
 const key=(x,y)=>`${Math.floor(x/cellSize)}:${Math.floor(y/cellSize)}`;
 for(let i=0;i<originalCount;i++){const p=positions[i],k=key(p[0],p[1]);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(i);}
 function splits(a,b){const cacheKey=a<b?`${a}/${b}`:`${b}/${a}`,cached=edgeCache.get(cacheKey);if(cached)return cached.a===a?cached.ids:[...cached.ids].reverse();
  const p=positions[a],q=positions[b],dx=q[0]-p[0],dy=q[1]-p[1],length2=dx*dx+dy*dy,length=Math.sqrt(length2),found=[],epsilon=Math.max(1e-8,cellSize*1e-8);
  for(let iy=Math.floor((Math.min(p[1],q[1])-epsilon)/cellSize);iy<=Math.floor((Math.max(p[1],q[1])+epsilon)/cellSize);iy++)for(let ix=Math.floor((Math.min(p[0],q[0])-epsilon)/cellSize);ix<=Math.floor((Math.max(p[0],q[0])+epsilon)/cellSize);ix++)for(const id of buckets.get(`${ix}:${iy}`)||[]){if(id===a||id===b)continue;const r=positions[id],t=((r[0]-p[0])*dx+(r[1]-p[1])*dy)/length2;if(t>epsilon/length&&t<1-epsilon/length&&Math.abs(dx*(r[1]-p[1])-dy*(r[0]-p[0]))<=epsilon*length)found.push({id,t});}
  const ids=found.sort((a,b)=>a.t-b.t||a.id-b.id).map(v=>v.id);edgeCache.set(cacheKey,{a,ids});return ids;
 }
 for(let i=0;i<indices.length;i+=3){const a=indices[i],b=indices[i+1],c=indices[i+2],polygon=[a,...splits(a,b),b,...splits(b,c),c,...splits(c,a)];if(polygon.length===3){result.push(a,b,c);continue;}if(positions.length>=maxVertices)throw Error('틈 없는 지형 메시의 정점 한도를 초과했습니다. 계산 간격을 늘리세요.');const x=(positions[a][0]+positions[b][0]+positions[c][0])/3,y=(positions[a][1]+positions[b][1]+positions[c][1])/3,index=positions.length;positions.push([x,y,heightAt(x,y,true)]);keys.push('junction:'+ [keys[a],keys[b],keys[c]].sort().join('/'));for(let j=0;j<polygon.length;j++)result.push(index,polygon[j],polygon[(j+1)%polygon.length]);}
 return result;
}
function incrementalTriangles(positions,indices){
 const faces=new Map(),edges=new Map();let serial=0,last=null,searches=0;
 const edgeKey=(a,b)=>a<b?`${a}/${b}`:`${b}/${a}`,cross=(a,b,p)=>(positions[b][0]-positions[a][0])*(p[1]-positions[a][1])-(positions[b][1]-positions[a][1])*(p[0]-positions[a][0]);
 function add(a,b,c){if(cross(a,b,positions[c])<0)[b,c]=[c,b];const id=serial++,v=[a,b,c];faces.set(id,v);for(let i=0;i<3;i++){const key=edgeKey(v[i],v[(i+1)%3]);if(!edges.has(key))edges.set(key,new Set());edges.get(key).add(id);}return id;}
 function remove(id){const v=faces.get(id);if(!v)return;for(let i=0;i<3;i++){const key=edgeKey(v[i],v[(i+1)%3]),set=edges.get(key);set.delete(id);if(!set.size)edges.delete(key);}faces.delete(id);}
 for(let i=0;i<indices.length;i+=3)last=add(indices[i],indices[i+1],indices[i+2]);
 function contains(v,p){return v.every((a,i)=>cross(a,v[(i+1)%3],p)>=-1e-7*Math.max(1,Math.hypot(positions[v[(i+1)%3]][0]-positions[a][0],positions[v[(i+1)%3]][1]-positions[a][1])));}
 return {insert(index){
  const p=positions[index],visited=new Set();let found=null,current=faces.has(last)?last:faces.keys().next().value;
  while(current!==undefined&&!visited.has(current)){if(++searches>2000000)throw Error('지형 삼각분할 검색 한도를 초과했습니다. 경계를 나누세요.');visited.add(current);const v=faces.get(current);if(contains(v,p)){found=current;break;}let next;for(let i=0;i<3;i++)if(cross(v[i],v[(i+1)%3],p)<0){const other=[...(edges.get(edgeKey(v[i],v[(i+1)%3]))||[])].find(id=>id!==current&&!visited.has(id));if(other!==undefined){next=other;break;}}current=next;}
  if(found===null)for(const [id,v] of faces){if(++searches>2000000)throw Error('지형 삼각분할 검색 한도를 초과했습니다.');if(contains(v,p)){found=id;break;}}
  if(found===null)throw Error('내부 높이 점이 지형 메시 범위와 일치하지 않습니다.');
  const v=faces.get(found);let on=-1;for(let i=0;i<3;i++)if(pointOnTerrainSegment(p,positions[v[i]],positions[v[(i+1)%3]])!==null){on=i;break;}
  if(on>=0){const a=v[on],b=v[(on+1)%3],neighbours=[...edges.get(edgeKey(a,b))];for(const id of neighbours){const triangle=faces.get(id),other=triangle.find(i=>i!==a&&i!==b);remove(id);last=add(a,index,other);add(index,b,other);}}
  else{remove(found);last=add(v[0],v[1],index);add(v[1],v[2],index);add(v[2],v[0],index);}
 },indices:()=>[...faces.values()].flat()};
}
export function resolveTerrain(entity,{maxVertices=4096,maxGridChecks=20000}={}){
 const issues=entityIssues(entity);if(issues.length)throw Error(issues.join(', '));const t=entity.parameters.terrain;if(!t)throw Error('높이 계산을 먼저 사용하도록 설정하세요.');
 const prepared=t.baseMode==='idw'?prepareTerrainConstraints(entity):{boundary:entity.geometry.points,boundaryKeys:entity.geometry.vertexIds.map(id=>'boundary:'+id),controls:[...entity.geometry.points,...t.controlPoints.map(c=>c.position)],segments:[],meshPoints:t.controlPoints.map(c=>({position:c.position,key:'control:'+c.id}))},boundary=prepared.boundary,controls=prepared.controls;
 const elevation=entity.parameters.elevation||0;
 function baseAt(x,y){if(t.baseMode==='flat')return t.baseHeight+elevation;for(const s of prepared.segments)if(pointOnTerrainSegment([x,y],s.a,s.b)!==null)return s.height+elevation;let weights=0,total=0;for(const p of controls){const distance=(p[0]-x)**2+(p[1]-y)**2;if(distance<1e-16)return p[2]+elevation;const w=1/distance;weights+=w;total+=p[2]*w;}return total/weights+elevation;}
 // Profiles are evaluated against BaseTerrain only, never against a prior modifier.
 const profiles=t.profiles.map(p=>({...p,targetHeight:p.kind==='offset'?p.height:p.mode==='base'?baseAt(...p.center)+p.height:p.height})),byId=new Map(profiles.map(p=>[p.id,p]));
 const impact=t.modifiers.map(m=>({id:m.id,profileId:m.profileId,enabled:m.enabled!==false,affectedVertices:0,minDelta:0,maxDelta:0,bounds:(()=>{const p=byId.get(m.profileId),r=p.radius+m.falloff,points=p.shape==='stroke'?p.points:[p.center];return [Math.min(...points.map(p=>p[0]))-r,Math.min(...points.map(p=>p[1]))-r,Math.max(...points.map(p=>p[0]))+r,Math.max(...points.map(p=>p[1]))+r];})()}));
 let operations=0;
 function heightAt(x,y,track=false){operations+=controls.length;let z=baseAt(x,y);t.modifiers.forEach((m,index)=>{if(m.enabled===false||m.strength===0)return;const p=byId.get(m.profileId);operations+=p.shape==='stroke'?p.points.length:1;if(operations>32000000)throw Error('지형 변형 계산량 한도를 초과했습니다. 경로를 나누거나 계산 간격을 늘리세요.');const distance=terrainProfileDistance(p,x,y);let weight=distance<=p.radius?1:m.falloff>0?Math.max(0,1-(distance-p.radius)/m.falloff):0;weight=weight*weight*(3-2*weight)*m.strength;if(weight===0)return;const before=z;z=p.kind==='offset'?z+p.targetHeight*weight:z+(p.targetHeight-z)*weight;if(track){const delta=z-before,r=impact[index];r.affectedVertices++;r.minDelta=Math.min(r.minDelta,delta);r.maxDelta=Math.max(r.maxDelta,delta);}});if(!Number.isFinite(z))throw Error('높이 계산이 유효 범위를 벗어났습니다.');return z;}
 const min=[0,1].map(axis=>Math.min(...boundary.map(p=>p[axis]))),max=[0,1].map(axis=>Math.max(...boundary.map(p=>p[axis]))),first=min.map(v=>Math.ceil(v/t.cellSize)),last=max.map(v=>Math.floor(v/t.cellSize));
 if(Math.max(0,last[0]-first[0]+1)*Math.max(0,last[1]-first[1]+1)>maxGridChecks)throw Error('지형 계산점이 너무 많습니다. 계산 간격을 늘리거나 경계를 나누세요.');
 const positions=boundary.map(p=>[p[0],p[1],heightAt(p[0],p[1],true)]),keys=[...prepared.boundaryKeys];
 if(positions.length>maxVertices)throw Error('지형 경계 계산점 한도를 초과했습니다.');
 const flat=positions.flatMap(p=>[p[0]-min[0],p[1]-min[1]]);let indices=earcut(flat,undefined,2);
 if(!indices.length||deviation(flat,undefined,2,indices)>1e-7)throw Error('지형 경계를 안전하게 삼각분할하지 못했습니다. 기존 결과를 유지합니다.');
 indices=conformTriangles(positions,indices,keys,t.cellSize,heightAt,maxVertices);
 const triangulation=incrementalTriangles(positions,indices);
 function insert(x,y,key){const existing=positions.findIndex(p=>Math.abs(p[0]-x)<1e-7&&Math.abs(p[1]-y)<1e-7);if(existing>=0){if(keys[existing].startsWith('junction:')&&(key.startsWith('control:')||key.startsWith('contour:')))keys[existing]=key;return;}if(positions.length>=maxVertices)throw Error('지형 정점 한도를 초과했습니다. 계산 간격을 늘리세요.');const index=positions.length;positions.push([x,y,heightAt(x,y,true)]);keys.push(key);triangulation.insert(index);}
 for(const c of prepared.meshPoints)if(terrainPointInside(c.position,boundary))insert(c.position[0],c.position[1],c.key);
 for(let iy=first[1];iy<=last[1];iy++)for(let ix=first[0];ix<=last[0];ix++){const x=ix*t.cellSize,y=iy*t.cellSize;if(terrainPointInside([x,y],boundary))insert(x,y,`grid:${ix}:${iy}`);}
 indices=triangulation.indices();
 refine(indices,positions.flatMap(p=>[p[0]-min[0],p[1]-min[1]]),2);
 indices=conformContourMesh(positions,indices,keys,prepared.segments,(x,y,track)=>heightAt(x,y,track),maxVertices);
 const used=new Set(indices);if(positions.some((_,i)=>!used.has(i)))throw Error('일부 높이 점이 메시에서 누락됐습니다. 중복/너무 가까운 경계·제어점을 확인하세요.');
 const boundaryArea=Math.abs(boundary.reduce((sum,p,i)=>{const q=boundary[(i+1)%boundary.length];return sum+(p[0]-min[0])*(q[1]-min[1])-(q[0]-min[0])*(p[1]-min[1]);},0))/2;let meshArea=0;
 for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3).map(i=>positions[i]);meshArea+=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;}if(Math.abs(meshArea-boundaryArea)>Math.max(1,boundaryArea)*1e-7)throw Error('최종 지형 메시가 경계 면적과 일치하지 않습니다.');
 return applyTerrainBoundary(entity,{version:1,algorithm:TERRAIN_ALGORITHM,positions,indices,vertexKeys:keys,profiles:profiles.map(p=>({id:p.id,targetHeight:p.targetHeight,kind:p.kind})),stats:{vertexCount:positions.length,boundaryVertexCount:boundary.length,triangleCount:indices.length/3,contourSegments:prepared.segments.length,minHeight:Math.min(...positions.map(p=>p[2])),maxHeight:Math.max(...positions.map(p=>p[2])),modifiers:impact}});
}
