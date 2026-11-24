import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {FoundationStore} from '../../infrastructure/foundation-store.js';
import {saveAssetCatalog} from '../../infrastructure/asset-catalog.js';
import {triangleGLB} from '../fixtures.js';
const setup=async()=>{const root=await mkdtemp(path.join(os.tmpdir(),'lds-catalog-')),s=new FoundationStore(root);await s.init();const asset=await s.importAsset({name:'wall.glb',content:triangleGLB().toString('base64'),category:'Model'});return {s,asset};};
test('catalog saves preserve bytes, identity, history and project pins across restart and file update',async()=>{
 const {s,asset}=await setup(),p=await s.createProject('사용 프로젝트');p.assets[asset.id]=structuredClone(asset);await s.saveProject(p.id,p,p.revision);const before=await s.project(p.id),bytes=await readFile(await s.findBlob(asset.hash));
 const c={styles:['고딕 석조','중세 성곽','고딕 석조'],tags:['석재'],part:'Wall',textureUsage:''};const saved=await saveAssetCatalog(s,{assetId:asset.id,expectedHash:asset.hash,expectedCatalog:null,catalog:c});
 assert.equal(saved.id,asset.id);assert.equal(saved.hash,asset.hash);assert.deepEqual(saved.history,asset.history);assert.equal(saved.updatedAt,asset.updatedAt);assert.deepEqual(saved.metadata.catalog.styles,['고딕 석조','중세 성곽']);assert.deepEqual(await readFile(await s.findBlob(asset.hash)),bytes);assert.deepEqual(await s.project(p.id),before);
 const restarted=new FoundationStore(s.root);await restarted.init();assert.deepEqual((await restarted.state()).assets[0].metadata.catalog,saved.metadata.catalog);
 const updated=await s.importAsset({assetId:asset.id,name:'wall.glb',content:triangleGLB(2).toString('base64'),category:'Model',metadata:{catalog:{styles:['stale']}}});assert.deepEqual(updated.metadata.catalog,saved.metadata.catalog);assert.equal((await s.project(p.id)).assets[asset.id].hash,asset.hash);
});
test('invalid or stale catalog edits cannot alter library classification',async()=>{
 const {s,asset}=await setup(),base={assetId:asset.id,expectedHash:asset.hash,expectedCatalog:null,catalog:{styles:[],tags:[],part:'Wall',textureUsage:''}};
 await assert.rejects(saveAssetCatalog(s,{...base,catalog:{...base.catalog,tags:['x'.repeat(41)]}}));await assert.rejects(saveAssetCatalog(s,{...base,expectedHash:'changed'}),/변경/);await assert.rejects(saveAssetCatalog(s,{...base,projectId:'private'}),/공용/);
 const saved=await saveAssetCatalog(s,base);await assert.rejects(saveAssetCatalog(s,{...base,catalog:{...base.catalog,part:'Roof'}}),/변경/);assert.deepEqual((await s.state()).assets[0].metadata.catalog,saved.metadata.catalog);
});
test('image map kind and usage persist independently; older catalog edits retain map classification',async()=>{
 const {s}=await setup(),a=await s.importAsset({name:'normal.png',category:'Texture',content:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='}),c={styles:[],tags:[],part:'',textureUsage:'TrimSheet',mapKind:'Normal'};
 const saved=await saveAssetCatalog(s,{assetId:a.id,expectedHash:a.hash,expectedCatalog:null,catalog:c});assert.equal(saved.metadata.catalog.mapKind,'Normal');assert.equal(saved.metadata.catalog.textureUsage,'TrimSheet');assert.equal(saved.hash,a.hash);
 const restarted=new FoundationStore(s.root);await restarted.init();assert.deepEqual((await restarted.state()).assets.find(x=>x.id===a.id).metadata.catalog,c);
 const legacy={...c,textureUsage:'Tileable'};delete legacy.mapKind;const next=await saveAssetCatalog(s,{assetId:a.id,expectedHash:a.hash,expectedCatalog:c,catalog:legacy});assert.equal(next.metadata.catalog.mapKind,'Normal');assert.equal(next.metadata.catalog.textureUsage,'Tileable');
 await assert.rejects(saveAssetCatalog(s,{assetId:a.id,expectedHash:a.hash,expectedCatalog:next.metadata.catalog,catalog:{...c,mapKind:'Invalid'}}));
});
