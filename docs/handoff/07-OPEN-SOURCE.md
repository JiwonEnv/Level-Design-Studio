# 07. 오픈소스·기존 소스 활용 계획

단계별로 어떤 오픈소스·기존 소스를 왜, 어떻게 쓰는지 정리한다. "현재"는 지금 코드(`foundation-0.4.2`)의 상태다.

## 쓰는 방식 네 가지
| 방식 | 뜻 | 예 |
|---|---|---|
| **라이브러리** | npm 패키지로 설치해 코드에서 직접 호출 | MapLibre, Terra Draw, Turf.js, three.js, earcut |
| **외부 프로그램 연동** | 프로그램 밖에서 실행하고 명령·파일로 주고받음 | PhotoCraft CLI, Blender(Python) |
| **재구현** | 방식·알고리즘을 참고해 Studio 데이터 구조에 맞게 새로 만듦 | CityGenerator, RoadForge, Houdini 도로·지형 기능 |
| **참고만** | 구조·아이디어만 본다. 소스는 쓰지 않음 | BlenderGIS, OSM2World |

**라이선스 규칙**: GPL·AGPL 소스는 코드를 가져다 쓰지 않는다(프로그램 전체 공개 의무가 생길 수 있음). 쓰기 전에 라이선스와 버전을 다시 확인하고 `vendor/licenses`에 사본을 둔다.

---

## STEP 1 Reference
| 이름 | 쓰는 이유 | 방식 | 현재 |
|---|---|---|---|
| MapLibre GL JS (BSD-3) | 실제 지도 표시 | 라이브러리 | 사용 중 |
| Terra Draw (MIT) + MapLibre 어댑터 | 지도 위 선·폴리곤 그리기 | 라이브러리 | 사용 중. 그린 결과가 설계 객체로 이어지지 않음, 실사용 시 그려지지 않는 문제 있음 |
| Turf.js (MIT) | 길이·면적 계산 | 라이브러리 | 사용 중 |
| OpenCV.js | 선·영역 후보 추출, 원근 보정 | 외부 모듈(별도 worker) | 사용 중. 후보를 도로 중심선·폭으로 바꾸는 부분 없음 |
| PhotoCraft (Rust) | 이미지 편집(브러시·레이어·선택), PSD 합성, 자르기·원근 보정 | 외부 프로그램 연동(CLI). Fork하지 않음 | 사용 중 |
| Potrace | 이미지 선을 벡터로 바꾸기 | 라이브러리 또는 외부 프로그램 | 후속 |
| SAM 2 / SamGeo | 클릭 선택 영역 분할, 위성·지도 의미 분할 | 외부 프로그램 연동 | 후속 |
| BlenderGIS (GPL-3.0) | GIS·DEM 처리 방식 | 참고만 | — |
| Mapforge (AGPL-3.0) | GeoJSON/KML/GPX 지도 편집 방식 | 참고만 | — |

## STEP 2 2D 설계
| 이름 | 쓰는 이유 | 방식 | 현재 |
|---|---|---|---|
| Terra Draw | STEP 1과 같은 그리기 도구(정점 편집·스냅·Undo)를 2D 설계에도 사용 | 라이브러리 | **쓰지 않음.** 2D 설계는 직접 만든 SVG 편집기. 곡선 미지원·Ctrl+Z 문제가 이 편집기에 있음 |
| Turf.js / JSTS | 면적·거리·버퍼·교차 판정 | 라이브러리 | Turf 일부만 사용 |

> 2D 설계 편집기를 Terra Draw 기반으로 바꿀지, 지금 편집기에 곡선·실행 취소를 보강할지는 [06](06-OPEN-DECISIONS.md) 9번에서 정한다.

## M3·M4 지형·도로 연결과 연결 규칙
맞는 오픈소스가 없어 **직접 개발**한다: 도로-지형 상호작용, 평탄화·절토·성토, 교차로, 옹벽·계단·경사로·다리 자동 생성, 경계·보행 경로 검사.

| 이름 | 쓰는 이유 | 방식 | 현재 |
|---|---|---|---|
| three.js (MIT) | 3D 표시·편집 | 라이브러리 | 사용 중 |
| earcut | 폴리곤 삼각분할 | 라이브러리 | 사용 중(지형) |
| CGAL | 복잡한 메시 분할·불리언 | 필요할 때 검토 | — |
| RoadForge (Unreal C++) | 도로 중심선·단면·교차로·차선 연결 구조 | **재구현** (Unreal 전용이라 그대로 못 씀) | — |
| ProceduralCityGeneration (MIT) | Perlin·Diamond-Square 지형, Voronoi 구획 | 재구현 / 초기 프로토타입 참고 | — |
| OSM2World | OSM 데이터를 3D로 바꾸는 방식 | 참고만 | — |

## M5 출력
| 이름 | 쓰는 이유 | 방식 | 현재 |
|---|---|---|---|
| glTF/GLB (기본), FBX (선택) | 장면·모델 교환 형식 | 파일 형식 | 등록(가져오기)만 됨, 내보내기 없음 |
| Blender Python API | 내보낸 장면 정리·검사, 실제 형상화 단계(포장·경계석·축대 등) | 외부 프로그램 연동 | 좌표 검증 스크립트만 있음 |
| Blender Geometry Nodes | 도로 단면·건물 모듈 반복 같은 실제 형상 만들기 | Blender 쪽에서 실행 | — |
| Unreal Editor Python / Unity Editor 스크립트 | 엔진 가져오기(배치·머티리얼·텍스처 연결) | 직접 개발 | 좌표 검증용만 있음 |

## M6 모듈 건물
| 이름 | 쓰는 이유 | 방식 | 현재 |
|---|---|---|---|
| CityGenerator (MIT, UE5 + Houdini) | 도시·건물 생성 흐름 | **부분 재사용 + 재구현** | — |
| BlenderLevelArchitect | Blender 레벨 블록아웃 방식 | 참고만 | — |
| Gorani Blender Extension | 한국 건물 높이·층수 데이터 | 참고 / 데이터 활용 검토 | — |
| Blender Road Builder | 도로 생성 방식 | 참고만 (상용) | — |

건축 규칙 엔진(모듈 조립·남는 길이 처리·Recipe)은 직접 개발한다.

---

## Blender 애드온

Blender 안에서 Studio와 바로 주고받는 애드온을 **직접 개발**한다(Blender Python API). 애드온 없이도 모든 작업을 FBX/GLB 파일로 할 수 있어야 하며, 애드온은 그 과정을 편하게 해 주는 도구다. 파일 가져오기를 먼저 만들고 애드온은 그다음이다.

| 기능 | 하는 일 |
|---|---|
| Send to Studio / Register Asset | 선택한 오브젝트·그룹을 Studio 에셋으로 등록. 등록 단위(개별 모듈 / 그룹 / 완성형)를 고른다. 등록할 때 FBX를 자동으로 만들고, 원본 .blend는 따로 연결한다(FBX에는 Blender 편집 정보가 남지 않으므로) |
| Update Asset | 수정한 모델로 기존 에셋 갱신. Asset ID 유지, 파일만 갱신 |
| Validate Asset | 등록 전 검사: 치수·피벗·Socket·머티리얼 슬롯·UV 등 |
| Open in Studio | 이 에셋이 쓰이는 Studio 프로젝트 열기 |

- 오브젝트마다 고유 ID를 붙여 이름이 바뀌어도 추적한다. Blender에서 복제하면 ID도 복제되므로, 중복 ID를 감지하면 새 ID 발급 여부를 묻는다.
- 방향은 **Blender → Studio 한 방향**이다. Studio가 .blend 파일을 자동으로 고치지 않는다(양방향 편집은 하지 않기로 함).
- Studio → Blender 방향(장면 출력, M5)은 파일과 Blender Python 정리 스크립트로 한다. 애드온에 "Studio 장면 불러오기"를 넣을지는 [06](06-OPEN-DECISIONS.md) 11번.

### 기존 애드온·Blender 기능 재사용

**라이선스 구분이 핵심이다.** Blender 애드온은 Blender의 GPL 라이선스를 따른다. 그래서
- **Studio 프로그램 본체**에는 GPL 소스를 넣지 않는다.
- **Studio용 Blender 애드온**은 Studio와 따로 배포하는 GPL 애드온으로 만들면, 다른 GPL 애드온의 코드를 가져다 쓸 수 있다.
- 사용자가 이미 설치한 다른 애드온과 **함께 쓰는 것**(코드를 가져오지 않고 그 애드온의 기능을 호출하거나 결과 파일을 받는 것)은 라이선스와 상관없이 가능하다.

| 대상 | 재사용 방법 | 판정 |
|---|---|---|
| Blender 기본 FBX·glTF 가져오기/내보내기 | 애드온에서 그대로 호출. 직접 만들지 않는다 | **재사용** |
| Blender Geometry Nodes | 도로 단면·모듈 반복 같은 실제 형상 만들기에 사용 | **재사용** |
| BlenderGIS (GPL-3.0) | 지형(DEM)·지도 데이터를 Blender로 가져오는 기능. Studio 애드온과 함께 쓰거나, 애드온 안에 코드 일부 재사용 가능. Studio 본체에는 넣지 않음 | 애드온 쪽 **부분 재사용 가능** |
| BlenderLevelArchitect | Blender 안 레벨 블록아웃 도구 구성 | 라이선스 확인 후 판단 (확인 전에는 참고만) |
| Gorani Blender Extension | 건물 높이·층수 데이터 | 라이선스·데이터 이용 조건 확인 후 판단 |
| Blender Road Builder | 도로 생성 방식 | 상용이라 재사용 불가, 참고만 |
| Blender MCP | AI가 Blender를 조작하는 방식 | 라이선스 확인 후 AI 기능과 함께 검토 |

대화에서는 이 애드온들을 이름과 용도 수준으로만 검토했고, 코드 단위로 재사용할 수 있는지는 확인하지 않았다. 애드온 개발을 시작할 때 각 애드온의 라이선스·Blender 지원 버전·코드 구조를 확인하고 위 판정을 확정한다.

---

## Houdini·Unreal 전용 기능을 바꿔서 쓰기

Houdini·Unreal에서만 되는 기능을 Blender·Unity·Studio 자체 기능으로 다시 만들 수 있는지 검토한 결과다. **결론: 가능하다. 특정 엔진에 묶이지 않는 독립 프로그램 + Blender + 엔진 출력으로 다시 구성한다.**

| 원래 기능 | 바꿔서 만드는 방법 | 난이도 |
|---|---|---|
| OSM 지도 데이터 수집 | OSM 데이터 직접 사용 (OSMnx·Overpass 방식) | 낮음 |
| 위성 사진 위 평면도 | MapLibre + Terra Draw | 낮음 |
| Houdini 도로 커브 | Studio 자체 도로 그래프 + Blender Curve | 중간 |
| 도로 메시 | Blender Geometry Nodes 또는 Studio 생성기 | 중간 |
| 건물 볼륨 | 폴리곤 돌출(Extrusion) | 낮음 |
| 건축 모듈 조립 | Studio 규칙 엔진 + Blender Geometry Nodes | 높음 |
| Houdini 지형 | Heightmap + Blender/Unity Terrain | 중간 |
| Unreal PCG(절차적 배치) | Studio 규칙 엔진 + Unity Prefab / Unreal Actor 출력 | 중간 |
| 교차로 | 직접 개발 (교차 판정 + 삼각분할) | 높음 |
| 교량 | 직접 개발 | 높음 |
| 차량·보행 경로 | 직접 개발 (도로 위상 그래프) | 높음 |

### 기존 소스별 판정
| 소스 | 판정 | 이유 |
|---|---|---|
| CityGenerator | 부분 재사용 + 재구현 | 흐름은 가장 비슷하지만 Unreal·Houdini 기반 |
| RoadForge | 재구현 | Unreal Spline·ProceduralMeshComponent 전용 |
| ProceduralCityGeneration | 초기 프로토타입에 참고 | 알고리즘 위주라 옮기기 쉬움 |
| OSM2World | 참고 | STEP 1 지도 데이터를 3D로 해석하는 방식 |

### 바꿔 쓸 때 주의할 점
- 검토 당시 Python 도구(OSMnx, NetworkX, Shapely)를 전제로 했다. 지금 프로그램은 JavaScript(Electron)다. Python을 별도 프로세스로 붙일지, JavaScript 대체(Turf.js, JSTS 등)를 쓸지 정해야 한다 → [06](06-OPEN-DECISIONS.md) 10번.
- Blender Geometry Nodes를 쓰는 기능은 Studio 안에서 바로 미리보기가 안 된다. Studio는 빠른 블록아웃 미리보기, Blender는 실제 형상화로 나눈다(01 명세의 "빠른 미리보기 → Blender" 흐름).
- 라이선스와 버전은 쓰기 직전에 다시 확인한다. RoadForge·OSM2World·BlenderLevelArchitect의 라이선스는 확인 필요.
