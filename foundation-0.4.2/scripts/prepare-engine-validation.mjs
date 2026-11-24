import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('.engine-validation');
for(const sub of ['Unity/Assets/Editor','Unity/Packages','Unity/ProjectSettings','Unreal'])await mkdir(path.join(root,sub),{recursive:true});
await copyFile('scripts/engine-validation/CoordinateValidation.cs',path.join(root,'Unity/Assets/Editor/CoordinateValidation.cs'));
await copyFile('scripts/engine-validation/Coordinates.uproject',path.join(root,'Unreal/Coordinates.uproject'));
await writeFile(path.join(root,'Unity/Packages/manifest.json'),JSON.stringify({dependencies:{}}));
await writeFile(path.join(root,'Unity/ProjectSettings/ProjectVersion.txt'),'m_EditorVersion: 6000.6.4f1\n');
console.log(root);
