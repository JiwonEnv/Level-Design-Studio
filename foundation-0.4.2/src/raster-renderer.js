// Replay a single layer at full opacity, then transform/composite it once.
// A reusable scratch canvas and one lazily-sized selection buffer bound memory.
export function applyRasterLayerTransform(context,layer,[width,height]){
 context.translate(width/2+layer.offsetX,height/2+layer.offsetY);
 context.rotate((layer.rotation||0)*Math.PI/180);
 context.scale(layer.scaleX??1,layer.scaleY??1);
 context.translate(-width/2,-height/2);
}

export function createRasterRenderer(source,width,height){
 const scratch=document.createElement('canvas'),buffer=document.createElement('canvas');scratch.width=width;scratch.height=height;
 const layerContext=scratch.getContext('2d');
 function command(context,entry){
  if(entry.type==='selection-transfer'){
   buffer.width=entry.width;buffer.height=entry.height;const capture=buffer.getContext('2d');
   // Capture before clearing: this also preserves overlapping moves and alpha.
   capture.drawImage(context.canvas,entry.x,entry.y,entry.width,entry.height,0,0,entry.width,entry.height);
   if(!entry.copy)context.clearRect(entry.x,entry.y,entry.width,entry.height);
   context.drawImage(buffer,entry.x+entry.dx,entry.y+entry.dy);
   return;
  }
  context.save();context.globalCompositeOperation=entry.type==='eraser'||entry.type==='clear-rect'?'destination-out':'source-over';context.fillStyle=entry.color||'#000000';context.strokeStyle=entry.color||'#000000';
  if(entry.type==='brush'||entry.type==='eraser'){
   context.lineWidth=entry.size;context.lineCap='round';context.lineJoin='round';
   if(entry.points.length===1){context.beginPath();context.arc(entry.points[0][0],entry.points[0][1],entry.size/2,0,Math.PI*2);context.fill();}
   else{context.beginPath();entry.points.forEach((point,index)=>index?context.lineTo(...point):context.moveTo(...point));context.stroke();}
  }else if(entry.type==='ellipse'){context.beginPath();context.ellipse(entry.x+entry.width/2,entry.y+entry.height/2,entry.width/2,entry.height/2,0,0,Math.PI*2);context.fill();}
  else context.fillRect(entry.x,entry.y,entry.width,entry.height);
  context.restore();
 }
 return {
  render(target,documentData,preview=null){
   target.clearRect(0,0,width,height);
   for(const layer of documentData.layers){
    if(!layer.visible)continue;layerContext.clearRect(0,0,width,height);if(layer.source)layerContext.drawImage(source,0,0);
    for(const entry of layer.commands)command(layerContext,entry);
    if(preview?.command&&preview.layerId===layer.id)command(layerContext,preview.command);
    target.save();target.globalAlpha=layer.opacity;applyRasterLayerTransform(target,layer,[width,height]);target.drawImage(scratch,0,0);target.restore();
   }
  },
  dispose(){scratch.width=scratch.height=buffer.width=buffer.height=1;}
 };
}
