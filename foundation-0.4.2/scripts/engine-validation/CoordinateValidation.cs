using System;
using System.IO;
using UnityEditor;
using UnityEngine;

public static class CoordinateValidation {
    [Serializable] class Report {
        public string engine;
        public Vector3 sizeMetres;
        public Vector3 localBoundsCentre;
        public Vector3 worldBoundsCentre;
        public string result;
    }
    public static void Run() {
        var root=Path.GetFullPath(Path.Combine(Application.dataPath,"../.."));
        var assetPath="Assets/ten-metres.fbx";
        File.Copy(Path.Combine(root,"fixtures/ten-metres.fbx"),assetPath,true);
        AssetDatabase.ImportAsset(assetPath,ImportAssetOptions.ForceSynchronousImport);
        var importer=(ModelImporter)AssetImporter.GetAtPath(assetPath);
        importer.globalScale=1f;importer.useFileScale=true;
        importer.SaveAndReimport();
        var model=AssetDatabase.LoadAssetAtPath<GameObject>(assetPath);
        var instance=(GameObject)PrefabUtility.InstantiatePrefab(model);
        try {
            var filters=instance.GetComponentsInChildren<MeshFilter>();
            if(filters.Length!=1)throw new Exception("Expected one fixture mesh");
            var bounds=filters[0].sharedMesh.bounds;
            var renderer=filters[0].GetComponent<MeshRenderer>();
            var size=renderer.bounds.size;
            float[] sorted={Math.Abs(size.x),Math.Abs(size.y),Math.Abs(size.z)};Array.Sort(sorted);
            float[] expected={3,4,10};for(int i=0;i<3;i++)if(Math.Abs(sorted[i]-expected[i])>.005f)throw new Exception("Size mismatch: "+size);
            if(bounds.center.sqrMagnitude<.001f)throw new Exception("Pivot offset lost");
            if(Math.Abs(size.y-3)>.005f)throw new Exception("Expected Z-up source height to become Y-up: "+size);
            if((renderer.bounds.center-new Vector3(-7,1.5f,-3)).sqrMagnitude>.0001f)throw new Exception("Pivot/basis mismatch: "+renderer.bounds.center);
            var report=new Report{engine=Application.unityVersion,sizeMetres=size,localBoundsCentre=bounds.center,worldBoundsCentre=renderer.bounds.center,result="PASS"};
            File.WriteAllText(Path.Combine(root,"unity-report.json"),JsonUtility.ToJson(report,true));
            Debug.Log("LDS_COORDINATES_PASS "+JsonUtility.ToJson(report));
        } finally {UnityEngine.Object.DestroyImmediate(instance);}
    }
}
