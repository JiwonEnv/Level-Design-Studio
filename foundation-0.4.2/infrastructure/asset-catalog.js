import path from 'node:path';
import {readdir,readFile} from 'node:fs/promises';
import {assetRegistry,atomicAssetJSON} from './asset-transactions.js';
import {AppError} from '../store.js';
export async function saveAssetCatalog(store,body){
 if(!body||typeof body.assetId!=='string'||!/^[0-9a-f-]{36}$/.test(body.assetId)||body.projectId)throw new AppError('공용 에셋을 선택하세요.');
 const c=body.catalog;if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>!['styles','tags','part','textureUsage','mapKind'].includes(k)))throw new AppError('분류 형식 오류');
 for(const key of ['styles','tags'])if(!Array.isArray(c[key])||c[key].length>20||c[key].some(v=>typeof v!=='string'||!v.trim()||v.length>40))throw new AppError('태그는 각 40자 이내, 20개까지 입력하세요.');
 if(!['','Wall','Corner','Roof','Door','Window','Column','Floor','Stair','Prop','Building'].includes(c.part)||!['','TrimSheet','Tileable','Special','Unique','Atlas','Decal','Reference'].includes(c.textureUsage)||c.mapKind!==undefined&&!['','BaseColor','Diffuse','Normal','Roughness','Metallic','AO','Height','Opacity','Emissive','Mask','ORM','Specular','Glossiness','Other'].includes(c.mapKind))throw new AppError('분류 항목을 확인하세요.');
 const registry=await assetRegistry(store,null);
 return store.withWriteLock(registry.root,async()=>{
  const conflicts=(await readdir(registry.root)).filter(n=>n.startsWith('library')&&n!=='library.json'&&!n.endsWith('.bak')&&!n.includes('.tmp'));
  if(conflicts.length)throw new AppError('라이브러리 충돌 사본을 확인한 뒤 저장하세요.',409);
  const lib=await registry.state(),baseline=JSON.stringify(lib),asset=lib.assets.find(a=>a.id===body.assetId);if(!asset)throw new AppError('에셋을 찾지 못했습니다.',404);
  if(asset.hash!==body.expectedHash||JSON.stringify(asset.metadata?.catalog||null)!==JSON.stringify(body.expectedCatalog??null))throw new AppError('에셋 또는 분류가 변경되었습니다. 다시 선택한 뒤 저장하세요.',409);
  asset.metadata={...asset.metadata,catalog:{styles:[...new Set(c.styles.map(s=>s.trim()))],tags:[...new Set(c.tags.map(s=>s.trim()))],part:c.part,textureUsage:c.textureUsage,...(c.mapKind!==undefined?{mapKind:c.mapKind}:asset.metadata?.catalog?.mapKind!==undefined?{mapKind:asset.metadata.catalog.mapKind}:{})}};
  // Classification never rewrites asset bytes, version history or project pins.
  const file=path.join(registry.root,'library.json'),current=JSON.parse(await readFile(file,'utf8'));if(JSON.stringify(current)!==baseline)throw new AppError('저장 중 외부 라이브러리 변경을 발견했습니다.',409);await atomicAssetJSON(file+'.bak',current);await atomicAssetJSON(file,lib);return {...asset,projectId:null};
 });
}
