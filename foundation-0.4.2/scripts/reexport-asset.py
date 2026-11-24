import bpy,sys,os
args=sys.argv[sys.argv.index('--')+1:]
source,output,mode=args
bpy.ops.wm.open_mainfile(filepath=os.path.abspath(source))
obj=bpy.data.objects['FoundationCube']
if mode=='mesh': obj.data.vertices[0].co.z+=0.75
if mode=='uv':
    for loop in obj.data.uv_layers.active.data: loop.uv.x*=0.7
if mode=='pivot': obj.location.x=2
if mode=='slots':
    obj.data.materials.append(bpy.data.materials.new('ExtraSlot')); obj.data.polygons[0].material_index=1
if output.lower().endswith('.glb'): bpy.ops.export_scene.gltf(filepath=os.path.abspath(output),export_format='GLB',export_animations=False)
else: bpy.ops.export_scene.fbx(filepath=os.path.abspath(output),bake_anim=False,path_mode='COPY',embed_textures=True)
print('FOUNDATION_REEXPORT_COMPLETE',mode)
