import {_electron,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('.foundation-validation','home-workflow-'+Date.now());await mkdir(root,{recursive:true});
const env={...process.env,STUDIO_WORKSPACE:path.join(root,'Workspace'),STUDIO_USER_DATA:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;
const executable=process.argv[2]?path.resolve(process.argv[2]):null,launch=()=>_electron.launch({...(executable?{executablePath:executable,args:[]}:{args:['.']}),env});
let app,page;const errors=[];const projects=[];
try{
 app=await launch();page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForURL('studio://app/');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1486,994));
 await page.evaluate(()=>document.fonts.ready);await expect(page.locator('.home-empty')).toContainText('아직 프로젝트가 없습니다');await expect(page.locator('footer')).toBeHidden();await expect(page.locator('#asset-monitor-open')).toBeHidden();
 await page.locator('#home-library').click();await expect(page.locator('#home-library-title')).toBeVisible();await expect(page.locator('#home-project-panel')).toBeHidden();await expect(page.locator('#home-library')).toHaveAttribute('aria-pressed','true');await page.locator('#home-projects').click();
 for(const [name,folder]of [['이전 작업','첫 번째'],['새 레벨','동쪽지구'],['새 레벨','서쪽지구']]){
  await page.locator('#home-new').click();await page.locator('#foundation-name').fill(name);await page.locator('#foundation-folder').fill(path.join(root,folder));await page.locator('#foundation-create').click();await expect(page.locator('#save-state')).toContainText('저장 완료');await expect(page.locator('#foundation-home')).toBeHidden();
  projects.push(await page.evaluate(async()=>await(await fetch('/api/projects/'+document.querySelector('#projects').value)).json()));await page.locator('#go-home').click();
 }
 await expect(page.locator('[data-recent]')).toHaveCount(3);assert.deepEqual(await page.locator('[data-recent]').evaluateAll(rows=>rows.map(r=>r.dataset.recent)),projects.map(p=>p.id).reverse());
 await expect(page.locator('.home-project-location').first()).toContainText('서쪽지구');await expect(page.locator('.home-project-location').nth(1)).toContainText('동쪽지구');await expect(page.locator('.home-project-path p').first()).toBeHidden();await page.locator('.home-project-path summary').first().click();await expect(page.locator('.home-project-path p').first()).toContainText(path.join(root,'서쪽지구'));await page.locator('.home-project-path summary').first().click();
 await page.locator('#recent-search').fill('동쪽지구');await expect(page.locator('[data-recent]')).toHaveCount(1);await expect(page.locator('[data-recent]')).toHaveAttribute('data-recent',projects[1].id);await page.locator('#recent-search').fill('없는 프로젝트');await expect(page.locator('.home-empty h3')).toHaveText('검색 결과가 없습니다');await page.locator('#recent-clear').click();await expect(page.locator('[data-recent]')).toHaveCount(3);await expect(page.locator('#recent-search')).toBeFocused();
 await page.screenshot({path:path.join(root,'home-desktop.png')});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1050,740));await expect(page.locator('#home-preferences')).toBeInViewport();await expect(page.locator('[data-recent]').last()).toBeInViewport();
 assert(await page.locator('#foundation-home').evaluate(e=>e.scrollWidth<=e.clientWidth));assert(await page.locator('.home-content').evaluate(e=>e.scrollWidth<=e.clientWidth));assert.equal(await page.locator('.home-project-info strong').first().evaluate(e=>getComputedStyle(e).fontSize),'17px');await page.screenshot({path:path.join(root,'home-compact.png')});
 await page.locator('#home-preferences').click();await expect(page.locator('#preferences-workspace')).toBeVisible();await page.locator('#dialog .close').click();await page.locator('#home-open').click();await expect(page.locator('#open-folder-action')).toBeVisible();await page.locator('#dialog .close').click();
 await page.locator(`[data-recent="${projects[1].id}"]`).focus();await page.keyboard.press('Enter');await expect(page.locator('#foundation-home')).toBeHidden();await expect(page.locator('#projects')).toHaveValue(projects[1].id);await expect(page.locator('footer')).toBeVisible();
 await app.close();app=null;app=await launch();page=await app.firstWindow();await page.waitForURL('studio://app/');await expect(page.locator('[data-recent]')).toHaveCount(3);await page.locator(`[data-recent="${projects[2].id}"]`).click();await expect(page.locator('#projects')).toHaveValue(projects[2].id);assert.deepEqual(errors,[]);
 const report={result:'PASS',packaged:!!executable,root,checks:['empty versus no-search-results','library navigation','recent modification ordering','duplicate names differentiated by location','expandable full path','search name and path, clear and focus','1050x740 without horizontal overflow','readable name typography','home hides editor footer and asset monitor','create, folder-open and settings entry points','keyboard open','restart and correct project identity']};await writeFile(path.join(root,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){console.log(JSON.stringify({root,errors,toast:await page?.locator('#toast').textContent().catch(()=>null)}));await page?.screenshot({path:path.join(root,'failure.png')}).catch(()=>{});throw error;}finally{await app?.close();}
