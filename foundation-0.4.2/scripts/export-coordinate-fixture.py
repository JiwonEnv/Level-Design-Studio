import bpy, sys, os
out = sys.argv[sys.argv.index('--') + 1]
os.makedirs(out, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
verts = [(x,y,z) for x in (2,12) for y in (1,5) for z in (0,3)]
faces = [(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)]
mesh=bpy.data.meshes.new('TenMetresMesh');mesh.from_pydata(verts,[],faces);mesh.update()
obj=bpy.data.objects.new('TenMetres',mesh);bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active=obj;obj.select_set(True)
bpy.context.scene.unit_settings.system='METRIC'
bpy.context.scene.unit_settings.scale_length=1
bpy.ops.export_scene.fbx(filepath=os.path.join(out,'ten-metres.fbx'),use_selection=True,axis_forward='-Z',axis_up='Y',apply_unit_scale=True,add_leaf_bones=False)
bpy.ops.export_scene.gltf(filepath=os.path.join(out,'ten-metres.glb'),export_format='GLB',use_selection=True)
