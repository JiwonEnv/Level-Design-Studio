// Local metric approximation of EPSG:3857, scaled at a fixed project latitude.
// The anchor is shared by every map capture in the project. XY is east/north.
const R=6378137,rad=Math.PI/180,limit=85.0511287798066;
export function mercator(point){
 if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||Math.abs(point[0])>180||Math.abs(point[1])>limit)throw Error('경도는 -180~180, 위도는 ±85.0511 범위로 입력하세요.');
 return [R*point[0]*rad,R*Math.log(Math.tan(Math.PI/4+point[1]*rad/2))];
}
export function inverseMercator(point){return [point[0]/R/rad,(2*Math.atan(Math.exp(point[1]/R))-Math.PI/2)/rad];}
export function geographicToLocal(point,anchor){const p=mercator(point),a=mercator(anchor),scale=Math.cos(anchor[1]*rad);return p.map((v,i)=>(v-a[i])*scale);}
export function localToGeographic(point,anchor){const a=mercator(anchor),scale=Math.cos(anchor[1]*rad);return inverseMercator(point.map((v,i)=>a[i]+v/scale));}
export function mapReferenceFrame({west,south,east,north,width,height,anchor,zoom}){
 if(![west,south,east,north,width,height,zoom].every(Number.isFinite)||west>=east||south>=north||width<1||height<1)throw Error('지도 캡처 범위를 확인하세요.');
 const sw=geographicToLocal([west,south],anchor),ne=geographicToLocal([east,north],anchor),w=ne[0]-sw[0],h=ne[1]-sw[1];
 if(Math.max(w,h)>10000)throw Error('정확한 레벨 설계를 위해 가로·세로 10km 이내로 확대하세요.');
 const scaleError=Math.max(...[south,north].map(lat=>Math.abs(Math.cos(anchor[1]*rad)/Math.cos(lat*rad)-1)));
 if(scaleError>.005)throw Error('프로젝트 기준 위치에서 너무 멉니다. 새 프로젝트로 이 지역을 시작하세요.');
 if(Math.abs(w/h-width/height)>.005*Math.max(w/h,width/height))throw Error('지도 화면 비율과 좌표 범위가 다릅니다. 회전·원근 없이 캡처하세요.');
 return {widthMeters:w,sourceSize:[width,height],origin:[...sw,0],rotation:0,opacity:.65,scaleConfirmed:true,geo:{version:1,crs:'EPSG:3857',geographicCRS:'EPSG:4326',anchor:[...anchor],bounds:[west,south,east,north],zoom,rotation:0,metresPerPixel:w/width,scaleErrorBound:scaleError,method:'web-mercator-scaled-at-anchor',source:'OpenStreetMap Standard',attribution:'© OpenStreetMap contributors',licenseUrl:'https://www.openstreetmap.org/copyright',tileTemplate:'https://tile.openstreetmap.org/{z}/{x}/{y}.png'}};
}
