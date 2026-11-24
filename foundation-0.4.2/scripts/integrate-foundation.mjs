import {readFile,writeFile} from 'node:fs/promises';
const file='src/main.js';let s=await readFile(file,'utf8');
function replace(a,b){if(!s.includes(a))throw Error('Missing integration anchor: '+a.slice(0,100));s=s.replace(a,b);}
replace("import './style.css';",`import './style.css';
import './shell/foundation.css';
import {createFoundationShell} from './shell/foundation.js';
import {reconcileLegacy,projectLegacy,effective} from '../core/foundation/document.js';
import {CommandHistory} from '../core/foundation/history.js';
const commandHistory=new CommandHistory();let foundation=null;
function syncHistory(){history=commandHistory.past;future=commandHistory.future;}`);
replace('DESKTOP WORKSPACE · MVP 0.3','DESKTOP WORKSPACE · FOUNDATION 0.4');
replace('function checkpoint(){history.push(snapshot());if(history.length>40)history.shift();future=[];}','function checkpoint(){commandHistory.begin(project);}');
const start=s.indexOf('function save(){'),end=s.indexOf('async function openProject',start);
s=s.slice(0,start)+`function save(){if(!project)return Promise.resolve();const data=snapshot(),id=project.id;pendingSaves++;status('저장 중…');saveQueue=saveQueue.then(async()=>{await api('/api/foundation/'+id+'/recovery',{method:'POST',body:JSON.stringify({project:data})});const result=await api('/api/projects/'+id,{method:'PUT',body:JSON.stringify({project:data,expectedRevision:project.revision})});if(project?.id===id){project.revision=result.revision;project.updatedAt=result.updatedAt;commandHistory.markSaved(data);}saveFailed=false;}).catch(e=>{saveFailed=true;status('저장 실패 · 편집 내용 유지 · 저장 버튼으로 재시도',true);notify(e.message,true);}).finally(()=>{pendingSaves--;if(!saveFailed)status(pendingSaves?'저장 중…':'로컬에 저장됨 · 원격 동기화 미설정');});return saveQueue;}
function edit(fn,label='편집',source='legacy'){requireProject();const result=commandHistory.execute(project,label,()=>{fn();if(source==='legacy')reconcileLegacy(project);else projectLegacy(project);});project=result.document;syncHistory();if(result.error)throw result.error;pendingPlan=null;render();save();}
`+s.slice(end);
replace('history=[];future=[];render();if(project)', 'commandHistory.reset(project);syncHistory();foundation?.onOpen();render();if(project)');
replace("$('#empty').hidden=step!==4||!!project?.objects.length;", "$('#empty').hidden=true;");
replace('renderAssets();renderLayers();renderObjects();renderInspector();renderStep();if(step>=3)rebuild();','renderAssets();renderLayers();renderObjects();renderInspector();renderStep();foundation?.render();if(step>=3)rebuild();');
replace('function renderInspector(){const o=', 'function renderInspector(){if(foundation?.inspect())return;const o=');
replace("const entity=project.entities.find(e=>e.id===o.sourceEntityId),visible=!entity||project.layers.find(l=>l.id===entity.layerId)?.visible!==false;", "const entity=project.entities.find(e=>e.id===o.sourceEntityId),node=project.nodes?.find(n=>n.id===(o.sourceEntityId||o.id)),visible=node?effective(project,node,'visible'):!entity||project.layers.find(l=>l.id===entity.layerId)?.visible!==false;");
replace("markOverride(obj);renderInspector();renderObjects();save();", "markOverride(obj);reconcileLegacy(project);const result=commandHistory.end(project,'3D Transform');project=result.document;syncHistory();renderInspector();renderObjects();save();");
const a=s.indexOf("$('#undo').onclick="),b=s.indexOf("$('#manifest').onclick",a);
s=s.slice(0,a)+`$('#undo').onclick=guard(()=>{if(!history.length)return;project=commandHistory.undo(project);syncHistory();selected=null;pendingPlan=null;render();save();});$('#redo').onclick=guard(()=>{if(!future.length)return;project=commandHistory.redo(project);syncHistory();selected=null;pendingPlan=null;render();save();});
`+s.slice(b);
replace("await init3D();library=await api('/api/state');render();",`foundation=createFoundationShell({getProject:()=>project,getLibrary:()=>library,getSelected:()=>selected,setSelected:id=>{selected=id;assetSelection=null;},api,guard,notify,edit,render,save,openProject,showDialog,wait:()=>saveQueue,isFailed:()=>saveFailed,setProject:p=>{project=p;commandHistory.reset(p);syncHistory();},refreshLibrary:async()=>{library=await api('/api/state');},selectMesh,history:commandHistory,desktopInfo:window.studioDesktop?await window.studioDesktop.info():null});
await init3D();library=await api('/api/state');render();`);
replace("if(last&&library.projects.some(p=>p.id===last))await openProject(last);", "if(foundation.settings.restoreLast&&last&&library.projects.some(p=>p.id===last)){try{await openProject(last);}catch(e){notify(e.message,true);}}else foundation.home();");
// Keep original STEP creation handler available in source, replace only its binding.
replace("const info=await window.studioDesktop.info();desktopWorkspace=info.workspace;", "const info=await window.studioDesktop.info();desktopWorkspace=info.workspace;");
await writeFile(file,s);
const pkg=JSON.parse(await readFile('package.json','utf8'));pkg.version='0.4.0';pkg.build.appId='com.leveldesignstudio.foundation';pkg.build.productName='Level Design Studio Foundation';pkg.build.directories.output='release-foundation';pkg.build.files.push('infrastructure/**/*','application/**/*','adapters/**/*');pkg.scripts['test:foundation']='node --test tests/foundation/*.test.js';pkg.scripts['test:foundation:desktop']='node scripts/test-foundation-desktop.mjs';await writeFile('package.json',JSON.stringify(pkg,null,2)+'\n');
