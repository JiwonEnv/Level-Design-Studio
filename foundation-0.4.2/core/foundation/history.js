import {validateDocument} from './document.js';
const clone=x=>structuredClone(x);
export function contentKey(p){const c=clone(p);delete c.revision;delete c.updatedAt;delete c.storage;delete c.recovery;return JSON.stringify(c);}
export class CommandHistory{
 constructor(limit=100){this.limit=limit;this.reset();}
 reset(document=null){this.past=[];this.future=[];this.saved=document?contentKey(document):null;this.drag=null;}
 execute(document,label,mutate){const before=clone(document);try{mutate(document);validateDocument(document);}catch(e){return {document:before,error:e};}if(contentKey(before)!==contentKey(document)){this.past.push({label,before,after:clone(document)});if(this.past.length>this.limit)this.past.shift();this.future=[];}return {document};}
 begin(document){this.drag=clone(document);}
 end(document,label){if(!this.drag)return {document};const before=this.drag;this.drag=null;return this.execute(before,label,d=>Object.assign(d,clone(document)));}
 undo(document){const e=this.past.at(-1);if(!e)return document;const next={...clone(e.before),assetAutoEvents:document.assetAutoEvents,revision:document.revision,storage:document.storage};validateDocument(next);this.past.pop();this.future.push(e);return next;}
 redo(document){const e=this.future.at(-1);if(!e)return document;const next={...clone(e.after),assetAutoEvents:document.assetAutoEvents,revision:document.revision,storage:document.storage};validateDocument(next);this.future.pop();this.past.push(e);return next;}
 markSaved(document){this.saved=contentKey(document);}
 dirty(document){return contentKey(document)!==this.saved;}
}
