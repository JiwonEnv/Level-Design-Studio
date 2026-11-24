const {parentPort,workerData}=require('node:worker_threads');
const pending=require(workerData.modulePath);
pending.then(cv=>{
 delete cv.then;
 const owned=[],take=m=>(owned.push(m),m);
 try{
  const {width,height,threshold,minArea,mode}=workerData,rgba=new Uint8Array(workerData.rgba),src=take(cv.matFromArray(height,width,cv.CV_8UC4,rgba)),gray=take(new cv.Mat()),mask=take(new cv.Mat());
  cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);cv.threshold(gray,mask,threshold,255,cv.THRESH_BINARY_INV);for(let i=0;i<width*height;i++)if(rgba[i*4+3]===0)mask.data[i]=0;
  const proposals=[];
  if(mode==='lines'){
   const edges=take(new cv.Mat()),lines=take(new cv.Mat());cv.Canny(mask,edges,50,150);cv.HoughLinesP(edges,lines,1,Math.PI/180,20,20,5);
   for(let i=0;i<Math.min(lines.rows,100);i++){const v=lines.data32S.slice(i*4,i*4+4);proposals.push({points:[[v[0],v[1]],[v[2],v[3]]],evidence:{method:'HoughLinesP',lengthPixels:Math.hypot(v[2]-v[0],v[3]-v[1])}});}
  }else{
   const contours=take(new cv.MatVector()),hierarchy=take(new cv.Mat()),copy=take(mask.clone());cv.findContours(copy,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
   for(let i=0;i<Math.min(contours.size(),5000);i++){
    const contour=contours.get(i),poly=new cv.Mat();try{const area=Math.abs(cv.contourArea(contour));if(area<minArea||area>width*height*.95)continue;cv.approxPolyDP(contour,poly,Math.max(1,cv.arcLength(contour,true)*.01),true);if(poly.rows<3||poly.rows>256)continue;const points=[];for(let j=0;j<poly.rows;j++)points.push([poly.data32S[j*2],poly.data32S[j*2+1]]);proposals.push({points,evidence:{method:'threshold-external-contour',areaPixels:area}});}finally{poly.delete();contour.delete();}
   }
   proposals.sort((a,b)=>b.evidence.areaPixels-a.evidence.areaPixels);proposals.splice(100);
  }
  const pixels=Uint8Array.from(mask.data);parentPort.postMessage({mask:pixels,candidates:proposals,engine:{name:'OpenCV',version:'4.13.0'},parameters:{threshold,minArea,mode}},[pixels.buffer]);
 }catch(e){parentPort.postMessage({error:String(e.message||e)});}finally{for(const m of owned.reverse())m.delete();}
});
