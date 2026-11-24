import {_electron} from '@playwright/test';
import {verifyLevelWorkflow} from '../tests/level-workflow.js';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve('.desktop-test','level-run-'+Date.now());await mkdir(root,{recursive:true});
const executable=process.argv[2]?path.resolve(process.argv[2]):undefined;
const env={...process.env,STUDIO_WORKSPACE:path.join(root,'레벨 프로젝트'),STUDIO_USER_DATA:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({...(executable?{executablePath:executable,args:[]}:{args:['.']}),env,timeout:30000});
try{
 const page=await app.firstWindow();await page.context().setOffline(true);
 const requests=[];page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 const project=await verifyLevelWorkflow(page,root);assert.equal(project.schemaVersion,2);assert.deepEqual(requests,[]);
 const saved=JSON.parse(await readFile(path.join(env.STUDIO_WORKSPACE,'projects',project.id+'.json'),'utf8'));
 assert.equal(saved.entities.length,3);assert.equal(saved.objects.find(o=>o.entityType==='Building').ownership,'User Override');
 console.log(JSON.stringify({result:'PASS',packaged:!!executable,workflow:'image calibration → free road/polygon/vertex editing → 3D preview/apply/cancel → override-safe selected regeneration → disk reopen',noHttpRequests:true,artifacts:root},null,2));
}finally{await app.close();}
