import {terrainSegmentIntersections,pointOnTerrainSegment} from './terrain-domain.js';
// Cut existing triangle faces along each clipped contour. Both neighbours of an
// intersected edge receive the same vertex, preserving a conforming surface.
export function conformContourMesh(positions,indices,keys,segments,heightAt,maxVertices){
 let work=0;
 const area=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const vertex=(point,segment)=>{let index=positions.findIndex(p=>Math.hypot(p[0]-point[0],p[1]-point[1])<1e-7);if(index>=0)return index;if(positions.length>=maxVertices)throw Error('등고선 접합 정점 한도를 초과했습니다. 계산 간격을 늘리세요.');index=positions.length;positions.push([point[0],point[1],heightAt(...point,true)]);keys.push(`contour-cut:${segment.contourId}:${segment.index}:${index}`);return index;};
 for(const segment of segments){const result=[];
  for(let i=0;i<indices.length;i+=3){if(++work>2000000)throw Error('등고선 메시 접합 계산 한도를 초과했습니다. 기준선을 나누세요.');const face=indices.slice(i,i+3),polygon=[],cuts=[];
   for(let j=0;j<3;j++){const a=face[j],b=face[(j+1)%3];polygon.push(a);if(pointOnTerrainSegment(positions[a],segment.a,segment.b)!==null)cuts.push(a);const intersections=terrainSegmentIntersections(positions[a],positions[b],segment.a,segment.b).filter(hit=>hit.t>1e-8&&hit.t<1-1e-8).sort((a,b)=>a.t-b.t);
    for(const hit of intersections){const point=[positions[a][0]+(positions[b][0]-positions[a][0])*hit.t,positions[a][1]+(positions[b][1]-positions[a][1])*hit.t],id=vertex(point,segment);if(polygon.at(-1)!==id)polygon.push(id);cuts.push(id);}
   }
   const unique=[...new Set(cuts)];if(unique.length!==2){result.push(...face);continue;}const a=polygon.indexOf(unique[0]),b=polygon.indexOf(unique[1]),lo=Math.min(a,b),hi=Math.max(a,b);
   for(const part of [polygon.slice(lo,hi+1),[...polygon.slice(hi),...polygon.slice(0,lo+1)]])for(let j=1;j<part.length-1;j++)if(Math.abs(area(positions[part[0]],positions[part[j]],positions[part[j+1]]))>1e-12)result.push(part[0],part[j],part[j+1]);
  }
  indices=result;
 }
 return indices;
}
