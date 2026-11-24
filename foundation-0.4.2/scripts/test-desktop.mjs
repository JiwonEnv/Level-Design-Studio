import { _electron, expect } from '@playwright/test';
import { triangleGLB } from '../tests/fixtures.js';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve('.desktop-test','run-'+Date.now());await mkdir(root,{recursive:true});
const executable=process.argv[2]?path.resolve(process.argv[2]):undefined;
const env={...process.env,STUDIO_WORKSPACE:path.join(root,'작업 폴더'),STUDIO_USER_DATA:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;
const errors=[],requests=[];
async function launch(){
  const app=await _electron.launch({...(executable?{executablePath:executable,args:[]}:{args:['.']}),env,timeout:30000});
  const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await page.waitForURL('studio://app/');await expect(page.locator('#new-project')).toBeVisible();
  return {app,page};
}
let app;
try{
  let run=await launch();app=run.app;let page=run.page;
  await page.context().setOffline(true);
  const info=await page.evaluate(()=>window.studioDesktop.info());assert.equal(info.workspace,env.STUDIO_WORKSPACE);
  assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
  await page.getByRole('button',{name:'＋ 새 프로젝트'}).click();await page.locator('#project-title').fill('설치형 오프라인 검증');await page.locator('#create-project').click();
  await expect(page.locator('#save-state')).toHaveText('로컬에 저장됨');
  await page.locator('#files').setInputFiles([{name:'검증 모델.glb',mimeType:'model/gltf-binary',buffer:triangleGLB(4)}]);await expect(page.locator('.asset')).toHaveCount(1);
  await page.locator('[data-action="place"]').click();await expect(page.locator('#mesh-stats b').first()).toHaveText('3');
  await page.getByLabel('위치 (m) X',{exact:true}).fill('5');await page.getByLabel('위치 (m) X',{exact:true}).press('Tab');await expect(page.locator('#save-state')).toHaveText('로컬에 저장됨');
  const id=await page.locator('#projects').inputValue();
  const saved=JSON.parse(await readFile(path.join(env.STUDIO_WORKSPACE,'projects',id+'.json'),'utf8'));assert.equal(saved.objects[0].position[0],5);
  await page.screenshot({path:path.join(root,'desktop-before-close.png')});
  // Delay the last write to prove that closing waits for disk persistence.
  await page.evaluate(()=>{const original=window.fetch;window.fetch=(url,options)=>options?.method==='PUT'?new Promise(resolve=>setTimeout(()=>resolve(original(url,options)),350)):original(url,options);});
  await page.getByLabel('위치 (m) X',{exact:true}).fill('7');await page.getByLabel('위치 (m) X',{exact:true}).press('Tab');await expect(page.locator('#save-state')).toHaveText('저장 중…');
  const closed=app.waitForEvent('close');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await closed;app=null;
  assert.equal(JSON.parse(await readFile(path.join(env.STUDIO_WORKSPACE,'projects',id+'.json'),'utf8')).objects[0].position[0],7);
  run=await launch();app=run.app;page=run.page;await page.context().setOffline(true);
  await expect(page.locator('#projects')).toHaveValue(id);await expect(page.locator('.object-row')).toHaveCount(1);await page.locator('.object-row').click();await expect(page.getByLabel('위치 (m) X',{exact:true})).toHaveValue('7');await expect(page.locator('#mesh-stats b').first()).toHaveText('3');
  // Reload restores the last project and disk-pinned model; renderers have no Node API.
  await page.reload();await expect(page.locator('#projects')).toHaveValue(id);await expect(page.locator('.object-row')).toHaveCount(1);
  await page.locator('.object-row').click();await expect(page.getByLabel('위치 (m) X',{exact:true})).toHaveValue('7');
  await page.screenshot({path:path.join(root,'desktop-reopened.png')});
  // Exercise folder selection without changing any real user project directory.
  const other=path.join(root,'다른 작업 폴더');await mkdir(other,{recursive:true});
  await app.evaluate(({dialog},target)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[target]});},other);
  await page.locator('#choose-workspace').click();await expect(page.locator('.object-row')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(async()=> (await window.studioDesktop.info()).workspace)).toBe(other);
  await app.evaluate(({dialog},target)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[target]});},env.STUDIO_WORKSPACE);
  await page.locator('#choose-workspace').click();await expect(page.locator('#projects')).toHaveValue(id);await expect(page.locator('.object-row')).toHaveCount(1);
  await page.locator('.object-row').click();await expect(page.getByLabel('위치 (m) X',{exact:true})).toHaveValue('7');
  // A stale renderer must retain its edits and block an accidental window close.
  await page.evaluate(async projectId=>{const p=await (await fetch('/api/projects/'+projectId)).json();p.objects[0].position[0]=15;const r=await fetch('/api/projects/'+projectId,{method:'PUT',body:JSON.stringify({project:p,expectedRevision:p.revision})});if(!r.ok)throw Error('conflict fixture failed');},id);
  await page.getByLabel('위치 (m) X',{exact:true}).fill('99');await page.getByLabel('위치 (m) X',{exact:true}).press('Tab');await expect(page.locator('#save-state')).toContainText('저장 실패');
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async(_win,options)=>{globalThis.closeWarning=options;return {response:0};};});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
  await expect.poll(()=>app.evaluate(()=>globalThis.closeWarning?.message)).toBe('저장에 실패한 편집이 있습니다.');
  assert.equal(page.isClosed(),false);await expect(page.getByLabel('위치 (m) X',{exact:true})).toHaveValue('99');
  assert.equal(JSON.parse(await readFile(path.join(env.STUDIO_WORKSPACE,'projects',id+'.json'),'utf8')).objects[0].position[0],15);
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  console.log(JSON.stringify({result:'PASS',executable:executable||'development Electron',packaged:info.packaged,workspace:env.STUDIO_WORKSPACE,projectId:id,checks:['offline create/import/GLB render','transform saved to disk','app close and reopen','last project restored','reload restores scene','workspace switch and return','stale-save conflict preserves disk and screen','failed-save close protection','no HTTP requests','renderer Node isolation'],screenshots:root},null,2));
}finally{if(app)await app.close();}
