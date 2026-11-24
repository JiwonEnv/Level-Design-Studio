import {_electron,expect} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve('.foundation-validation','psd-reference-'+Date.now());await mkdir(root,{recursive:true});
const env={...process.env,STUDIO_WORKSPACE:path.join(root,'Workspace'),STUDIO_USER_DATA:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;
const executable=process.argv[2]?path.resolve(process.argv[2]):null;
const launch=()=>_electron.launch({...(executable?{executablePath:executable,args:[]}:{args:['.']}),env});
let app,page;const errors=[];
try{
 app=await launch();page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForURL('studio://app/');
 const saved=()=>expect(page.locator('#save-state')).toContainText('저장 완료');
 const doc=()=>page.evaluate(async()=>await(await fetch('/api/projects/'+document.querySelector('#projects').value)).json());
 const importFile=async(name,buffer)=>{const chooser=page.waitForEvent('filechooser');await page.locator('#reference-import').click();await(await chooser).setFiles([{name,mimeType:'image/vnd.adobe.photoshop',buffer}]);};
 await page.locator('#home-new').click();await page.locator('#foundation-name').fill('PSD Reference');await page.locator('#foundation-create').click();await saved();await page.locator('[data-step="1"]').click();
 const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=100;c.height=80;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,100,80);g.fillStyle='red';g.fillRect(10,10,30,30);return c.toDataURL().split(',')[1];}),'base64');
 const input=path.join(root,'fixture.png'),psdFile=path.join(root,'fixture.psd');await writeFile(input,png);
 await promisify(execFile)(path.resolve('../.tools/photocraft-0.23.1/photocraft-cli.exe'),['convert',input,psdFile,'--no-gpu'],{windowsHide:true,timeout:60000});
 const psd=await readFile(psdFile),hash=createHash('sha256').update(psd).digest('hex');
 await importFile('drawing.psd',psd);await expect.poll(async()=>(await doc()).references.length).toBe(1);await saved();
 let p=await doc();const reference=p.references[0],original=p.assets[reference.derived.sourceAssetId];
 assert.equal(original.ext,'psd');assert.equal(original.hash,hash);assert.equal(reference.derived.sourceHash,hash);assert.equal(reference.derived.operation.type,'psd-flatten');assert.equal(reference.derived.operation.layersImported,false);assert.deepEqual(reference.sourceSize,[100,80]);assert.equal(reference.scaleConfirmed,false);assert.equal(p.assets[reference.assetId].ext,'png');
 const stored=await page.evaluate(async hash=>{const r=await fetch('/api/files/'+hash+'?ext=psd');return Array.from(new Uint8Array(await r.arrayBuffer()));},hash);assert.deepEqual(Buffer.from(stored),psd);
 await page.locator('#reference-raster-edit').click();await expect(page.locator('#photocraft-workspace')).toBeVisible();await expect(page.locator('#photocraft-apply')).toBeEnabled();
 await expect.poll(()=>page.locator('#photocraft-canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(20,20,1,1).data))).toEqual([255,0,0,255]);
 await page.locator('#photocraft-close').click();assert.deepEqual((await doc()).references,p.references);
 const invalid=Buffer.from(psd);invalid.writeUInt16BE(16,22);await importFile('unsupported-depth.psd',invalid);await expect(page.locator('#toast')).toContainText('8비트');assert.deepEqual((await doc()).references,p.references);assert.deepEqual((await doc()).assets,p.assets);
 await importFile('broken.psd',psd.subarray(0,26));await expect(page.locator('#toast')).toContainText('합성하지 못했습니다');assert.deepEqual((await doc()).references,p.references);assert.deepEqual((await doc()).assets,p.assets);
 const badSignature=Buffer.from(psd);badSignature.write('XXXX');await importFile('wrong-header.psd',badSignature);await expect(page.locator('#toast')).toContainText('서명');assert.deepEqual((await doc()).assets,p.assets);
 await page.screenshot({path:path.join(root,'psd-source-preserved.png')});
 await app.close();app=null;app=await launch();page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForURL('studio://app/');await page.locator(`[data-recent="${p.id}"]`).click();await saved();assert.deepEqual((await doc()).references,p.references);assert.deepEqual((await doc()).assets,p.assets);assert.deepEqual(errors,[]);
 const result={result:'PASS',packaged:!!executable,root,sourceHash:hash,referenceId:reference.id,scope:'RGB8 PSD flattened input; original PSD bytes preserved; native PSD layers not imported',checks:['actual PhotoCraft PSD conversion','flattened pixel color','original bytes and source hash','unsupported depth before asset registration','corrupt body before asset registration','invalid signature before asset registration','cancel without mutation','save/restart']};await writeFile(path.join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){console.log(JSON.stringify({errors,toast:await page?.locator('#toast').textContent().catch(()=>null)}));await page?.screenshot({path:path.join(root,'failure.png')}).catch(()=>{});throw e;}finally{await app?.close();}
