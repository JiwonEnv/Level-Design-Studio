export class ModuleRegistry{
 constructor(){this.modules=new Map();}
 register(module){if(!module.id||module.contractVersion!==1||this.modules.has(module.id))throw Error('모듈 계약/ID 오류');this.modules.set(module.id,module);}
 capabilities(){return [...this.modules.values()].map(({run,...m})=>m);}
 async run(id,input){const module=this.modules.get(id);if(!module?.available)return {status:'unsupported',diagnostics:[{code:'UNAVAILABLE',message:module?.reason||'등록되지 않은 모듈'}]};if(input.signal?.aborted)return {status:'cancelled',diagnostics:[]};try{const result=await module.run(input);return input.signal?.aborted?{status:'cancelled',diagnostics:[]}:result;}catch(error){return {status:'failed',diagnostics:[{code:'MODULE_FAILED',message:error.message}]};}}
}
export const extensionRegistry=new ModuleRegistry();
export async function stagedModuleRun(registry,id,input,current,apply){
 if(input.sourceRevision!==current.revision)return {status:'failed',diagnostics:[{code:'STALE_REVISION',message:'프로젝트가 변경되었습니다.'}]};
 const result=await registry.run(id,input);
 if(result.status!=='success')return result;
 if(input.signal?.aborted)return {status:'cancelled',diagnostics:[]};
 if(input.sourceRevision!==current.revision)return {status:'failed',diagnostics:[{code:'STALE_REVISION',message:'작업 중 프로젝트가 변경되었습니다.'}]};
 // `apply` must be a CommandHistory transaction; modules cannot mutate the document.
 return apply(result);
}
for(const kind of ['Reference','Generation','AssetImporter','Blender','Unreal','Unity','Exporter','Validation'])extensionRegistry.register({id:kind.toLowerCase(),kind,contractVersion:1,available:false,reason:'외부 확장 모듈 호출 미연결. 앱에 내장된 기능의 지원 상태와는 별도입니다.'});
