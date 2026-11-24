export function terrainPointInside(point,ring){
 let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[j],b=ring[i],cross=(b[0]-a[0])*(point[1]-a[1])-(b[1]-a[1])*(point[0]-a[0]);
  if(Math.abs(cross)<1e-8&&point[0]>=Math.min(a[0],b[0])-1e-8&&point[0]<=Math.max(a[0],b[0])+1e-8&&point[1]>=Math.min(a[1],b[1])-1e-8&&point[1]<=Math.max(a[1],b[1])+1e-8)return false;
  if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside;
}
export function pointOnTerrainSegment(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;if(length2<1e-16)return Math.hypot(p[0]-a[0],p[1]-a[1])<1e-7?0:null;const t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length2;return t>=-1e-8&&t<=1+1e-8&&Math.abs(dx*(p[1]-a[1])-dy*(p[0]-a[0]))<1e-7*Math.sqrt(length2)?Math.max(0,Math.min(1,t)):null;}
export function terrainSegmentIntersections(a,b,c,d){
 const rx=b[0]-a[0],ry=b[1]-a[1],sx=d[0]-c[0],sy=d[1]-c[1],denominator=rx*sy-ry*sx;
 if(Math.abs(denominator)>1e-10){const t=((c[0]-a[0])*sy-(c[1]-a[1])*sx)/denominator,u=((c[0]-a[0])*ry-(c[1]-a[1])*rx)/denominator;return t>=-1e-8&&t<=1+1e-8&&u>=-1e-8&&u<=1+1e-8?[{t:Math.max(0,Math.min(1,t)),u:Math.max(0,Math.min(1,u))}]:[];}
 const result=[];for(const p of [c,d]){const t=pointOnTerrainSegment(p,a,b);if(t!==null)result.push({t,u:pointOnTerrainSegment(p,c,d)});}for(const p of [a,b]){const u=pointOnTerrainSegment(p,c,d);if(u!==null)result.push({t:pointOnTerrainSegment(p,a,b),u});}return result;
}
