import {_electron,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('.foundation-validation','selection-'+Date.now());await mkdir(root,{recursive:true});
const env={...process.env,STUDIO_WORKSPACE:path.join(root,'Workspace'),STUDIO_USER_DATA:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;
let app;const errors=[];
try{
 app=await _electron.launch({args:['.'],env});const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForURL('studio://app/');
 const saved=()=>expect(page.locator('#save-state')).toContainText('저장 완료');
 const doc=()=>page.evaluate(async()=>await(await fetch('/api/projects/'+document.querySelector('#projects').value)).json());
 await page.locator('#home-new').click();await page.locator('#foundation-name').fill('Selection');await page.locator('#foundation-create').click();await saved();
 await page.locator('[data-step="2"]').click();await page.locator('#clear-selection').click();await page.locator('#add-footprint').click();await saved();await page.locator('#clear-selection').click();await page.locator('#add-footprint').click();await saved();
 const source=await doc();assert.equal(source.entities.length,2);
 await page.locator('[data-step="3"]').click();await page.locator('#preview-generation').click();await expect(page.locator('#generation-review input')).toHaveCount(2);
 await page.locator('#generation-review input').first().uncheck();await page.locator('#apply-generation').click();await saved();
 let p=await doc();assert.equal(p.objects.length,1);assert.equal(p.objects[0].sourceEntityId,source.entities[1].id);const kept=structuredClone(p.objects[0]);
 await page.locator('#preview-generation').click();await expect(page.locator('#generation-review input')).toHaveCount(1);await page.locator('#cancel-generation').click();assert.deepEqual((await doc()).objects,[kept]);
 await page.locator('#preview-generation').click();await page.locator('#apply-generation').click();await saved();p=await doc();assert.equal(p.objects.length,2);assert.deepEqual(p.objects.find(o=>o.id===kept.id),kept);
 await page.screenshot({path:path.join(root,'selection.png')});assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',root,objects:p.objects.map(o=>o.id)}));
}finally{await app?.close();}
