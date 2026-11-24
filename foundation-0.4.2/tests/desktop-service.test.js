import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../store.js';
import { createLocalHandler, CSP } from '../desktop/local-service.js';

test('desktop protocol creates, imports and persists without an HTTP server',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'lds-desktop-service-'));
  let store=new Store(root);await store.init();
  const handle=createLocalHandler({getStore:()=>store,distRoot:path.resolve('dist')});
  const request=(url,method='GET',data)=>handle(new Request('studio://app'+url,{method,...(data?{body:JSON.stringify(data)}:{})}));
  const created=await request('/api/projects','POST',{name:'오프라인 작업'});assert.equal(created.status,201);const p=await created.json();
  const imported=await request('/api/assets','POST',{name:'model.glb',content:Buffer.from('model data').toString('base64')});const asset=await imported.json();
  p.assets[asset.id]=asset;p.objects.push({id:crypto.randomUUID(),kind:'asset',assetId:asset.id,name:asset.name,position:[7,2,3],rotation:[0,0,90],scale:[1,1,1],unitScale:1});
  assert.equal((await request('/api/projects/'+p.id,'PUT',{project:p,expectedRevision:0})).status,200);
  store=new Store(root);await store.init();const reopened=await (await request('/api/projects/'+p.id)).json();assert.deepEqual(reopened.objects[0].position,[7,2,3]);
  const blob=await request('/api/files/'+asset.hash+'?ext=glb');assert.equal(await blob.text(),'model data');
  assert.equal((await request('/api/projects/'+p.id,'PUT',{project:p,expectedRevision:0})).status,409);
  assert.equal(JSON.parse(await readFile(path.join(root,'projects',p.id+'.json'),'utf8')).revision,1);
});
test('desktop protocol restricts origins, file paths, malformed writes and executable content',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'lds-desktop-boundary-'));const store=new Store(root);await store.init();
  const handle=createLocalHandler({getStore:()=>store,distRoot:path.resolve('dist')});
  assert.equal((await handle(new Request('studio://other/api/state'))).status,403);
  assert.equal((await handle(new Request('studio://app/api/state',{headers:{origin:'https://outside.example'}}))).status,403);
  assert.equal((await handle(new Request('studio://app/api/projects',{method:'POST',body:'broken'}))).status,400);
  assert.equal((await handle(new Request('studio://app/assets/%2e%2e%2fpackage.json'))).status,404);
  assert.equal((await handle(new Request('studio://app/store.js'))).status,404);
  const page=await handle(new Request('studio://app/'));assert.equal(page.status,200);assert.equal(page.headers.get('content-security-policy'),CSP);
  assert.equal((await handle(new Request('studio://app/api/assets',{method:'POST',body:JSON.stringify({name:'unsafe.exe',content:'eA=='})}))).status,400);
});
