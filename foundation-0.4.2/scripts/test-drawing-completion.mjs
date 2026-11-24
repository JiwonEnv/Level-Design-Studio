import {_electron,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('.foundation-validation','drawing-completion-'+Date.now());await mkdir(root,{recursive:true});
const env={...process.env,STUDIO_WORKSPACE:path.join(root,'Workspace'),STUDIO_USER_DATA:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;
const executable=process.argv[2]?path.resolve(process.argv[2]):null;let app,page;
try{
 app=await _electron.launch({...(executable?{executablePath:executable,args:[]}:{args:['.']}),env});page=await app.firstWindow();await page.waitForURL('studio://app/');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1050,740));
 const saved=()=>expect(page.locator('#save-state')).toContainText('저장 완료'),doc=()=>page.evaluate(async()=>await(await fetch('/api/projects/'+document.querySelector('#projects').value)).json());
 await page.locator('#home-new').click();await page.locator('#foundation-name').fill('Drawing Closure');await page.locator('#foundation-create').click();await saved();await page.locator('[data-step="1"]').click();
 const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1600;c.height=1000;c.getContext('2d').fillRect(0,0,1600,1000);return c.toDataURL().split(',')[1];}),'base64');const chooser=page.waitForEvent('filechooser');await page.locator('#reference-import').click();await(await chooser).setFiles([{name:'large-drawing.png',mimeType:'image/png',buffer:png}]);await saved();
 await page.locator('#reference-trace-tools').evaluate(e=>e.open=true);await page.locator('[data-tool="Zone"]').click();
 const at=async p=>page.locator('#planner-canvas').evaluate((svg,p)=>{const a=new DOMPoint(p[0],-p[1]).matrixTransform(svg.getScreenCTM());return {x:a.x,y:a.y};},p);
 for(const p of [[15,15],[55,15],[55,45]]){const a=await at(p);await page.mouse.click(a.x,a.y);}await expect(page.locator('[data-draft-point]')).toHaveCount(3);const first=await at([15,15]);await page.mouse.click(first.x+5,first.y+2);await saved();assert.equal((await doc()).entities.length,1);assert.equal((await doc()).entities[0].geometry.points.length,3);await expect(page.locator('[data-draft-point]')).toHaveCount(0);await expect(page.locator('#active-tool-name')).toContainText('선택');
 const style=()=>page.locator('#planner-canvas [data-entity]').first().evaluate(e=>({width:getComputedStyle(e).strokeWidth,effect:getComputedStyle(e).vectorEffect}));const before=await style();assert(parseFloat(before.width)>=2);assert.equal(before.effect,'non-scaling-stroke');const b=await page.locator('#planner-canvas').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.wheel(0,400);assert.deepEqual(await style(),before);
 await page.screenshot({path:path.join(root,'closed-visible-outline.png')});
 await page.locator('#reference-trace-tools').evaluate(e=>e.open=true);await page.locator('[data-tool="Road"]').click();for(const p of [[20,20],[35,35]]){const a=await at(p);await page.mouse.click(a.x,a.y);}const last=await at([45,40]);await page.mouse.dblclick(last.x,last.y);await saved();assert.equal((await doc()).entities.length,2);assert.equal((await doc()).entities[1].type,'Road');await expect(page.locator('[data-draft-point]')).toHaveCount(0);
 const result={result:'PASS',packaged:!!executable,root,style:before,checks:['first point hit closes polygon with pixel tolerance','no duplicate closing vertex','returns to select','outline >=2px independent of zoom','road double-click finishes','large image minimum window']};await writeFile(path.join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){console.log(JSON.stringify({root,toast:await page?.locator('#toast').textContent().catch(()=>null)}));await page?.screenshot({path:path.join(root,'failure.png')}).catch(()=>{});throw e;}finally{await app?.close();}
