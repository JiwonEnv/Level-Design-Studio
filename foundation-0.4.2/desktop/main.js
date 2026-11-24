import {AssetMonitor} from '../application/asset-monitor.js';
import { app, BrowserWindow, protocol, ipcMain, dialog, shell, Menu } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { FoundationStore as Store } from '../infrastructure/foundation-store.js';
import { Store as LegacyStore } from '../store.js';
import { createLocalHandler } from './local-service.js';
import {allowedApplicationRequest} from './network-policy.js';
import {previewReferenceImage} from '../infrastructure/image-editor.js';
import {flattenPsd} from '../infrastructure/psd-import.js';
import {PhotoCraftEditor} from '../infrastructure/photocraft-session.js';
import {analyzeReferenceImage} from '../infrastructure/image-analysis.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const appRoot=path.dirname(here);
app.setName('Level Design Studio Foundation 0.4.2');
app.setPath('userData',path.join(app.getPath('appData'),'Level Design Studio Foundation 0.4.2'));
if(process.env.STUDIO_USER_DATA) app.setPath('userData',path.resolve(process.env.STUDIO_USER_DATA));
protocol.registerSchemesAsPrivileged([{scheme:'studio',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
let win, store, monitor, photoCraftEditor, saveState='idle', closeApproved=false, closing=false;
let settings={};
async function log(error){try{await mkdir(app.getPath('userData'),{recursive:true});const {appendFile}=await import('node:fs/promises');await appendFile(path.join(app.getPath('userData'),'foundation-errors.log'),new Date().toISOString()+' '+(error.stack||error)+'\n');}catch{}}
process.on('uncaughtException',error=>{void log(error);});
process.on('unhandledRejection',error=>{void log(error);});
const settingsPath=()=>path.join(app.getPath('userData'),'studio-settings.json');
async function saveSettings(){
  await mkdir(app.getPath('userData'),{recursive:true});
  await writeFile(settingsPath()+'.tmp',JSON.stringify(settings,null,2));
  await rename(settingsPath()+'.tmp',settingsPath());
}
function trusted(event){
  if(!win || event.sender!==win.webContents || event.senderFrame!==win.webContents.mainFrame || event.senderFrame.url!=='studio://app/') throw new Error('허용하지 않는 요청입니다.');
}
async function finishClose(success){
  if(success){closeApproved=true;win.close();return;}
  const result=await dialog.showMessageBox(win,{type:'warning',title:'저장되지 않은 편집',message:'저장에 실패한 편집이 있습니다.',detail:'계속 편집하여 장면 기록을 다운로드하거나 저장 문제를 해결할 수 있습니다. 저장하지 않고 종료하면 현재 편집은 사라집니다.',buttons:['계속 편집','저장하지 않고 종료'],defaultId:0,cancelId:0});
  closing=false;
  if(result.response===1){closeApproved=true;win.close();}
}
function createWindow(){
  closeApproved=false;closing=false;saveState='idle';
  win=new BrowserWindow({title:'Level Design Studio',width:1500,height:1000,minWidth:1050,minHeight:740,backgroundColor:'#181e23',show:false,autoHideMenuBar:true,webPreferences:{preload:path.join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(url!=='studio://app/')event.preventDefault();});
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  win.webContents.on('console-message',(_event,details)=>{if(details?.level==='error')void log('Renderer: '+details.message);});
  win.webContents.on('did-fail-load',(_event,code,description)=>{void log('Load '+code+': '+description);});
  win.on('close',event=>{
    if(closeApproved || saveState==='idle')return;
    event.preventDefault();
    if(!closing){closing=true;win.webContents.send('studio:prepare-close');}
  });
  // Renderer beforeunload is an additional guard, including browser-style reloads.
  win.webContents.on('will-prevent-unload',event=>{if(closeApproved)event.preventDefault();});
  win.once('ready-to-show',()=>win.show());
  win.webContents.on('render-process-gone',(_event,details)=>{void log('Renderer stopped: '+JSON.stringify(details));saveState='idle';closing=false;});
  win.loadURL('studio://app/');
}
const single=app.requestSingleInstanceLock();
if(!single)app.quit();
else {
  app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
  app.whenReady().then(async()=>{
    await mkdir(app.getPath('userData'),{recursive:true});
    try{settings=JSON.parse(await readFile(settingsPath(),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
    const workspace=process.env.STUDIO_WORKSPACE||settings.workspace||path.join(app.getPath('documents'),'Level Design Studio Foundation 0.4.2','Workspace');
    store=new Store(workspace,{sharedRoot:process.env.STUDIO_SHARED_LIBRARY||settings.sharedRoot});await store.init();monitor=await new AssetMonitor(store).start();
    settings={...settings,workspace:store.root,sharedRoot:store.sharedRoot};await saveSettings();
    protocol.handle('studio',createLocalHandler({getStore:()=>store,getMonitor:()=>monitor,distRoot:path.join(appRoot,'dist')}));
    const session=(await import('electron')).session.defaultSession;
    session.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
    session.setPermissionCheckHandler(()=>false);
    session.on('will-download',(_event,item)=>item.setSaveDialogOptions({title:'파일 저장',defaultPath:path.join(app.getPath('documents'),path.basename(item.getFilename()))}));
    session.setUserAgent(session.getUserAgent()+' LevelDesignStudio/0.4.2');
    session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!allowedApplicationRequest(details.url)}));
    ipcMain.handle('studio:source-file',async event=>{trusted(event);const r=await dialog.showOpenDialog(win,{title:'에셋 원본 파일 다시 연결',properties:['openFile']});return r.canceled?null:r.filePaths[0];});
    const imageEditorExecutable=app.isPackaged?path.join(process.resourcesPath,'tools','photocraft','photocraft-cli.exe'):path.resolve(appRoot,'..','.tools','photocraft-0.23.1','photocraft-cli.exe');
    photoCraftEditor=new PhotoCraftEditor({store:{project:id=>store.project(id),findBlob:hash=>store.findBlob(hash)},executable:imageEditorExecutable});
    ipcMain.handle('studio:photocraft-open',async(event,request)=>{trusted(event);return photoCraftEditor.open(request);});
    ipcMain.handle('studio:photocraft-command',async(event,request)=>{trusted(event);return photoCraftEditor.command(request);});
    ipcMain.handle('studio:photocraft-export',async(event,request)=>{trusted(event);return photoCraftEditor.export(request);});
    ipcMain.handle('studio:photocraft-close',async(event,request)=>{trusted(event);return photoCraftEditor.close(request);});
    let imagePreviewBusy=false;
    ipcMain.handle('studio:psd-flatten',async(event,request)=>{trusted(event);if(imagePreviewBusy)throw Error('이미지 처리 중입니다. 잠시 기다리세요.');imagePreviewBusy=true;try{return await flattenPsd({executable:imageEditorExecutable,content:request?.content});}finally{imagePreviewBusy=false;}});
    const openCvModule=app.isPackaged?path.join(process.resourcesPath,'tools','opencv','opencv.cjs'):path.resolve(appRoot,'..','.tools','opencv-4.13.0','opencv.cjs');
    let analysisBusy=false;
    ipcMain.handle('studio:reference-analyze',async(event,request)=>{trusted(event);if(analysisBusy)throw Error('이미지 분석 중입니다. 잠시 기다리세요.');analysisBusy=true;try{return await analyzeReferenceImage({...request,store,modulePath:openCvModule});}finally{analysisBusy=false;}});
    ipcMain.handle('studio:reference-preview',async(event,request)=>{trusted(event);if(imagePreviewBusy)throw Error('이미지 처리 중입니다. 잠시 기다리세요.');imagePreviewBusy=true;try{return await previewReferenceImage({...request,store,executable:imageEditorExecutable});}finally{imagePreviewBusy=false;}});
    ipcMain.handle('studio:info',event=>{trusted(event);return {version:app.getVersion(),workspace:store.root,sharedRoot:store.sharedRoot,packaged:app.isPackaged,settings};});
    ipcMain.handle('studio:settings',async(event,next)=>{trusted(event);if(typeof next.restoreLast==='boolean')settings.restoreLast=next.restoreLast;settings.panels={...settings.panels,...next.panels};await saveSettings();return settings;});
    ipcMain.handle('studio:folder',async(event,kind)=>{trusted(event);if(saveState!=='idle')throw Error('저장을 완료한 뒤 경로를 선택하세요.');const result=await dialog.showOpenDialog(win,{title:kind==='open'?'Foundation 프로젝트 폴더 열기':kind==='legacy'?'기존 0.3 작업 폴더 선택 (원본 보존)':kind==='shared'?'공용 라이브러리 연결':'새 빈 프로젝트 폴더 선택',properties:['openDirectory','createDirectory']});if(result.canceled)return null;const folder=result.filePaths[0];if(kind==='open')return await store.openProjectFolder(folder);if(kind==='legacy'){const source=new LegacyStore(folder);return {sourceRoot:folder,...await source.state()};}if(kind==='shared'){const shared=new Store(store.root,{sharedRoot:folder});await shared.init();await monitor.stop();store=shared;monitor=await new AssetMonitor(store).start();settings.sharedRoot=folder;await saveSettings();return {path:folder};}return {path:folder};});
    ipcMain.handle('studio:show-workspace',async event=>{trusted(event);const error=await shell.openPath(store.root);if(error)throw new Error(error);});
    ipcMain.handle('studio:choose-workspace',async event=>{
      trusted(event);if(saveState!=='idle')throw new Error('저장을 완료한 뒤 작업 폴더를 바꿔 주세요.');
      const result=await dialog.showOpenDialog(win,{title:'작업 폴더 열기 — 기존 studio-workspace 또는 새 빈 폴더',defaultPath:store.root,properties:['openDirectory','createDirectory']});
      if(result.canceled)return null;
      const next=new Store(result.filePaths[0],{sharedRoot:settings.sharedRoot});await next.init();
      await store.pending;
      const previous=settings;settings={...settings,workspace:next.root,sharedRoot:next.sharedRoot};
      try{await saveSettings();}catch(error){settings=previous;throw error;}
      await monitor.stop();store=next;monitor=await new AssetMonitor(store).start();return {workspace:store.root};
    });
    ipcMain.on('studio:save-state',(event,state)=>{trusted(event);if(['idle','pending','failed'].includes(state))saveState=state;});
    ipcMain.on('studio:close-ready',(event,success)=>{trusted(event);if(closing)void finishClose(success===true);});
    Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'파일',submenu:[{label:'종료',click:()=>win.close()}]},{label:'편집',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'보기',submenu:[{role:'zoomIn'},{role:'zoomOut'},{role:'resetZoom'},{role:'togglefullscreen'},...(!app.isPackaged?[{role:'toggleDevTools'}]:[])]}]));
    createWindow();
  }).catch(error=>{dialog.showErrorBox('Level Design Studio 시작 실패',error.message+'\n기존 작업 데이터는 삭제하지 않았습니다.');app.quit();});
  app.on('window-all-closed',()=>{void(async()=>{await photoCraftEditor?.closeAll();await monitor?.stop();app.quit();})();});
}

