import unreal, os, json
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','.engine-validation'))
unreal.SystemLibrary.execute_console_command(None,'Interchange.FeatureFlags.Import.FBX 0')
task=unreal.AssetImportTask()
task.filename=os.path.join(root,'fixtures','ten-metres.fbx')
task.destination_path='/Game/CoordinateValidation'
task.automated=True;task.replace_existing=True;task.save=True
options=unreal.FbxImportUI()
options.import_mesh=True;options.import_as_skeletal=False;options.import_materials=False;options.import_textures=False
options.static_mesh_import_data.combine_meshes=True
options.static_mesh_import_data.convert_scene=True
options.static_mesh_import_data.convert_scene_unit=True
options.static_mesh_import_data.transform_vertex_to_absolute=False
options.static_mesh_import_data.bake_pivot_in_vertex=False
task.options=options
task.factory=unreal.FbxFactory()
unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
paths=task.imported_object_paths
if not paths: raise RuntimeError('No imported mesh')
mesh=unreal.load_asset(paths[0]);bounds=mesh.get_bounds()
size=[bounds.box_extent.x*2,bounds.box_extent.y*2,bounds.box_extent.z*2]
centre=[bounds.origin.x,bounds.origin.y,bounds.origin.z]
assert all(abs(a-b)<0.5 for a,b in zip(sorted(size),[300,400,1000])),size
assert any(abs(v)>1 for v in centre),centre
assert all(abs(a-b)<0.5 for a,b in zip(size,[1000,400,300])),size
assert all(abs(a-b)<0.5 for a,b in zip(centre,[700,-300,150])),centre
report={'engine':unreal.SystemLibrary.get_engine_version(),'sizeCentimetres':size,'localBoundsCentre':centre,'asset':paths[0],'result':'PASS'}
with open(os.path.join(root,'unreal-report.json'),'w') as f:json.dump(report,f,indent=2)
unreal.log('LDS_COORDINATES_PASS '+json.dumps(report))
