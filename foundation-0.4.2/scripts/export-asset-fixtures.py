import bpy, sys, os
out=sys.argv[sys.argv.index('--')+1]
os.makedirs(out,exist_ok=True)
for mode in ['baseline','mesh','uv','pivot','slots','hierarchy']:
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for block in list(bpy.data.meshes): bpy.data.meshes.remove(block)
    for block in list(bpy.data.materials): bpy.data.materials.remove(block)
    bpy.ops.mesh.primitive_cube_add(size=2)
    obj=bpy.context.object; obj.name='FoundationCube'; obj.data.name='FoundationMesh'
    mat=bpy.data.materials.new('FoundationSurface'); obj.data.materials.append(mat)
    # Stable names across independent exports (remove previous orphan datablocks).
    mat.name='Surface_'+mode if mode=='slots' else 'Surface'
    if mode=='mesh': obj.data.vertices[0].co.z+=0.75
    if mode=='uv':
        for loop in obj.data.uv_layers.active.data: loop.uv.x*=0.7
    if mode=='pivot': obj.location.x=2
    if mode=='slots':
        obj.data.materials.append(bpy.data.materials.new('SecondSlot')); obj.data.polygons[0].material_index=1
    if mode=='hierarchy':
        bpy.ops.object.empty_add(); parent=bpy.context.object; parent.name='Assembly'; obj.parent=parent
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out,mode+'.blend'))
    bpy.ops.export_scene.gltf(filepath=os.path.join(out,mode+'.glb'),export_format='GLB',export_animations=False)
    bpy.ops.export_scene.fbx(filepath=os.path.join(out,mode+'.fbx'),bake_anim=False,path_mode='COPY',embed_textures=True)
print('FOUNDATION_FIXTURES_COMPLETE')

