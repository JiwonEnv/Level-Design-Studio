import {readFile,writeFile} from 'node:fs/promises';
let s=await readFile('src/main.js','utf8');
s=s.replace("category:model({ext:file.name.split('.').pop().toLowerCase()})?'Model':'Texture'", "category:model({ext:file.name.split('.').pop().toLowerCase()})?'Model':file.name.endsWith('.json')?(foundation?.assetKind()||'Material'):'Texture',kind:model({ext:file.name.split('.').pop().toLowerCase()})?'Model':file.name.endsWith('.json')?(foundation?.assetKind()||'Material'):(foundation?.assetKind()==='Model'?'Texture':foundation?.assetKind())");
s=s.replace("if(!replaceId){checkpoint();if(!project.assets[a.id])pin(a);await save();", "if(!replaceId){edit(()=>{if(!project.assets[a.id])pin(a);},'에셋 등록');await saveQueue;");
s=s.replace("function pin(a){project.assets[a.id]=structuredClone(a);}", "function pin(a){project.assets[a.id]=structuredClone(a);for(const n of project.nodes||[])for(const r of n.assetRefs)if(r.assetId===a.id)r.hash=a.hash;}");
s=s.replace("model(a)?'place':'reference'", "model(a)?'place':previewable(a)?'reference':'inspect'");
s=s.replace("model(a)?'＋ 배치':'레퍼런스로 사용'", "model(a)?'＋ 배치':previewable(a)?'레퍼런스로 사용':'상세 정보'");
// Common node edit handlers are validated and must report errors without losing the document.
await writeFile('src/main.js',s);
let shell=await readFile('src/shell/foundation.js','utf8');shell=shell.replaceAll('h.edit(', 'safeEdit(');shell=shell.replace('const p=h.getProject;',"const p=h.getProject;\n const safeEdit=(...args)=>{try{return h.edit(...args);}catch(error){h.notify(error.message,true);h.render();}};");
await writeFile('src/shell/foundation.js',shell);
