import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rename} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {replaceFile} from '../../infrastructure/replace-file.js';
test('transient replacement locks keep old complete bytes until the new file can replace them',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'lds-replace-')),source=path.join(root,'new'),dest=path.join(root,'current');await writeFile(source,'new complete');await writeFile(dest,'old complete');let attempts=0,waited=0;
  await replaceFile(source,dest,{renameFile:async(a,b)=>{if(attempts++<12)throw Object.assign(Error('locked'),{code:'EPERM'});return rename(a,b);},wait:async ms=>{waited+=ms;assert.equal(await readFile(dest,'utf8'),'old complete');assert.equal(await readFile(source,'utf8'),'new complete');}});
  assert.ok(waited>720);assert.equal(await readFile(dest,'utf8'),'new complete');
});
test('permanent locks and non-retryable failures propagate without deleting destination',async()=>{
  const locked=Object.assign(Error('locked'),{code:'EBUSY'});let calls=0;
  await assert.rejects(()=>replaceFile('source','dest',{renameFile:async()=>{calls++;throw locked;},wait:async()=>{}}),e=>e===locked);assert.equal(calls,21);
  calls=0;await assert.rejects(()=>replaceFile('source','dest',{renameFile:async()=>{calls++;throw Object.assign(Error('missing'),{code:'ENOENT'});},wait:async()=>assert.fail('must not wait')}),/missing/);assert.equal(calls,1);
});
