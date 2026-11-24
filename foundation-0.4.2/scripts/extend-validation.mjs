import {readFile,writeFile} from 'node:fs/promises';
let s=await readFile('scripts/test-foundation-desktop.mjs','utf8');
const anchor=' assert.deepEqual(errors,[]);';
s=s.replace(anchor,` // A failed disk request preserves edits and supports explicit retry.
 await reopen(aid);let current=await document();const target=current.nodes.find(n=>n.type==='Group');await page.locator('[data-node="'+target.id+'"]').click();
 await page.evaluate(()=>{window.realFetch=window.fetch;let fail=true;window.fetch=(url,options)=>{if(options?.method==='PUT'&&fail){fail=false;return Promise.resolve(new Response(JSON.stringify({error:'시험 저장 실패'}),{status:500}));}return window.realFetch(url,options);};});
 await page.locator('#node-name').fill('실패 후 재시도');await page.locator('#node-name').press('Tab');await expect(page.locator('#save-state')).toContainText('저장 실패');assert.notEqual((await document()).nodes.find(n=>n.id===target.id).name,'실패 후 재시도');await expect(page.locator('#node-name')).toHaveValue('실패 후 재시도');await page.locator('#save').click();await saved();assert.equal((await document()).nodes.find(n=>n.id===target.id).name,'실패 후 재시도');
 // Kill ONLY this isolated test process after recovery is durable but before PUT.
 await page.evaluate(()=>{const original=window.realFetch;window.fetch=(url,options)=>options?.method==='PUT'?new Promise(resolve=>setTimeout(()=>resolve(original(url,options)),30000)):original(url,options);});
 const recoveryWritten=page.waitForResponse(r=>r.url().includes('/recovery')&&r.request().method()==='POST');await page.locator('#node-name').fill('비정상 종료 복구');await page.locator('#node-name').press('Tab');await recoveryWritten;const closed=app.waitForEvent('close');app.process().kill();await closed;app=null;
 await launch();await reopen(aid);await expect(page.locator('#recover-auto')).toBeVisible();page.once('dialog',d=>d.accept());await page.locator('#recover-auto').click();await expect(page.locator('#dialog')).not.toBeVisible();await expect.poll(async()=> (await document()).nodes.find(n=>n.id===target.id).name).toBe('비정상 종료 복구');
 await page.locator('[data-node="'+target.id+'"]').click();await page.locator('#node-name').fill('재실행 후 수정');await page.locator('#node-name').press('Tab');await saved();await page.locator('#undo').click();await saved();assert.equal((await document()).nodes.find(n=>n.id===target.id).name,'비정상 종료 복구');await page.locator('#redo').click();await saved();assert.equal((await document()).nodes.find(n=>n.id===target.id).name,'재실행 후 수정');
 assert.deepEqual(errors,[]);`);
await writeFile('scripts/test-foundation-desktop.mjs',s);
const pkg=JSON.parse(await readFile('package.json','utf8'));pkg.build.npmRebuild=false;await writeFile('package.json',JSON.stringify(pkg,null,2)+'\n');
