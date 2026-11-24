import * as THREE from 'three';
import {typeColors} from './planner.js';

export function generatedMesh(object){
  const anchor=object.anchor||[0,0,0],points=object.geometry.points.map(pt=>pt.map((n,i)=>n-anchor[i])),p=object.parameters,type=object.entityType,root=new THREE.Group();
  const material=new THREE.MeshStandardMaterial({color:typeColors[type],roughness:.85,side:THREE.DoubleSide,transparent:type==='Water'||type==='Zone',opacity:type==='Water'?.65:type==='Zone'?.25:1});
  function add(geometry){const mesh=new THREE.Mesh(geometry,material);mesh.userData.ownedResource=true;root.add(mesh);return mesh;}
  if(type==='Terrain'&&object.terrainMesh){
    const resolved=object.terrainMesh;for(const part of resolved.parts||[{name:'surface',start:0,count:resolved.indices.length}]){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(resolved.positions.flatMap(pt=>pt.map((v,i)=>v-anchor[i])),3));geometry.setIndex(resolved.indices.slice(part.start,part.start+part.count));geometry.computeVertexNormals();const mesh=add(geometry);mesh.name=part.name;mesh.userData.materialSlot=part.materialSlot||'terrain.surface';if(['cliff','side','bottom'].includes(part.name))mesh.material=new THREE.MeshStandardMaterial({color:part.name==='bottom'?'#5c6854':'#79816b',roughness:.95,side:THREE.DoubleSide,flatShading:true});}
  }else if(type==='Road'){
    // Each segment is an explicit ribbon. Junction/terrain solving is intentionally separate.
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!length)continue;
      const nx=-(b[1]-a[1])/length*p.width/2,ny=(b[0]-a[0])/length*p.width/2,z=p.elevation||0;
      const positions=new Float32Array([a[0]+nx,a[1]+ny,a[2]+z,a[0]-nx,a[1]-ny,a[2]+z,b[0]+nx,b[1]+ny,b[2]+z,b[0]-nx,b[1]-ny,b[2]+z]);
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setIndex([0,1,2,2,1,3]);geometry.computeVertexNormals();add(geometry);
    }
  }else if(type==='Prop'){
    const mesh=add(new THREE.BoxGeometry(p.size||1,p.size||1,p.size||1));mesh.position.set(points[0][0],points[0][1],points[0][2]+(p.elevation||0)+(p.size||1)/2);
  }else{
    const shape=new THREE.Shape(points.map(pt=>new THREE.Vector2(pt[0],pt[1])));
    const geometry=type==='Building'?new THREE.ExtrudeGeometry(shape,{depth:p.floors*p.floorHeight,bevelEnabled:false}):new THREE.ShapeGeometry(shape);
    if(type==='Terrain'||type==='Zone'){
      const positions=geometry.attributes.position;
      for(let i=0;i<positions.count;i++){const pt=points.find(pt=>Math.abs(pt[0]-positions.getX(i))<1e-4&&Math.abs(pt[1]-positions.getY(i))<1e-4);positions.setZ(i,pt?.[2]||0);}geometry.computeVertexNormals();
    }
    const mesh=add(geometry);mesh.position.z=(['Terrain','Zone'].includes(type)?0:points[0][2]||0)+(p.elevation||0);
  }
  return root;
}
