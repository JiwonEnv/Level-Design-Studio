import {createRasterDocument} from '../core/foundation/raster-edit.js';

// Reproduce a stored legacy edit document, not the default PhotoCraft workflow.
// Writes only the isolated test project through its normal persistence API.
export async function seedLegacyRasterDocument(page){
 const project=await page.evaluate(async()=>await(await fetch('/api/projects/'+document.querySelector('#projects').value)).json());
 const reference=project.references[0],asset=project.assets[reference.assetId];
 const derived={version:1,sourceAssetId:asset.id,sourceHash:asset.hash,operation:{type:'raster-edit',document:createRasterDocument(reference)},engine:{name:'Studio Raster',version:'1'},coordinatePolicy:'preserve-source-pixel-scale'};
 reference.derived=derived;project.nodes.find(n=>n.id===reference.id).properties.referenceData.derived=structuredClone(derived);
 await page.evaluate(async project=>{const headers={'content-type':'application/json'};const recovery=await fetch('/api/foundation/'+project.id+'/recovery',{method:'POST',headers,body:JSON.stringify({project})});if(!recovery.ok)throw Error(await recovery.text());const r=await fetch('/api/projects/'+project.id,{method:'PUT',headers,body:JSON.stringify({project,expectedRevision:project.revision})});if(!r.ok)throw Error(await r.text());},project);
 await page.reload();await page.waitForURL('studio://app/');await page.locator(`[data-recent="${project.id}"]`).click();await page.locator('[data-step="1"]').click();
}
