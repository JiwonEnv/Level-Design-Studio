import {readFile,writeFile,cp,mkdir,mkdtemp,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {FoundationStore} from '../infrastructure/foundation-store.js';
import {createNode} from '../core/foundation/document.js';
const source=path.resolve(process.argv[2]||'../foundation-work/.foundation-validation/1794720620733/Workspace');
const root=await mkdtemp(path.join(os.tmpdir(),'lds-04-migration-'));const output=path.resolve(process.argv[3]||path.join(root,'migration-result.json'));
const index=JSON.parse(await readFile(path.join(source,'foundation-index.json'),'utf8'));await cp(process.argv[4]?path.resolve(process.argv[4]):path.join(source,'SharedLibrary'),path.join(root,'SharedLibrary'),{recursive:true});
const store=new FoundationStore(root);await store.init();const results=[];
for(const item of index.projects){const head=JSON.parse(await readFile(path.join(item.path,'.studio','HEAD'),'utf8')),file=path.join(item.path,'.studio','commits',head.generation,'document.json'),bytes=await readFile(file),old=JSON.parse(bytes);const folder=path.join(root,'Projects',item.id);await cp(item.path,folder,{recursive:true});let doc=await store.openProjectFolder(folder);assert.equal(doc.schemaVersion,old.schemaVersion);assert.equal(doc.id,old.id);assert.deepEqual(doc.nodes.map(n=>n.id),old.nodes.map(n=>n.id));assert.deepEqual(doc.assets,old.assets);for(const object of old.objects){const value=doc.objects.find(o=>o.id===object.id);assert.ok(value);for(const key of ['position','rotation','scale'])object[key].forEach((v,i)=>assert.ok(Math.abs(value[key][i]-v)<1e-7));}
 doc.nodes.push(createNode('Group',{name:'변환 확인'}));doc=await store.saveProject(doc.id,doc,doc.revision);const reopened=new FoundationStore(root);await reopened.init();const restored=await reopened.project(doc.id);assert.deepEqual(restored.nodes,doc.nodes);assert.deepEqual(restored.assets,old.assets);assert.deepEqual(await readFile(file),bytes);results.push({id:doc.id,sourceRevision:old.revision,savedRevision:doc.revision,nodesBefore:old.nodes.length,nodesAfter:restored.nodes.length,result:'PASS',sourceSha256:createHash('sha256').update(bytes).digest('hex')});
}
await writeFile(output,JSON.stringify({result:'PASS',source,isolatedRoot:root,projects:results},null,2));console.log(JSON.stringify({result:'PASS',projects:results.length,output},null,2));
