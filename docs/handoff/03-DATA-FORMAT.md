# 03. 데이터 형식 명세

현재 코드(`foundation-0.4.2`)가 실제로 읽고 쓰는 형식이다. 새 기능은 이 형식을 확장해야 하며, 기존 필드의 의미를 바꾸면 안 된다(바꿀 때는 schemaVersion을 올리고 마이그레이션을 추가한다).


### D.1 디스크 레이아웃

```
<userData>/                                   (%APPDATA%/Level Design Studio Foundation 0.4.2, STUDIO_USER_DATA로 변경)
  studio-settings.json                        { workspace, sharedRoot, restoreLast?, panels? }
  foundation-errors.log

<Workspace>/                                  (FoundationStore.root)
  foundation-index.json                       { version:1, projects:[{ id, name, path(절대경로), createdAt, updatedAt }] }
  .index-backups/index-<uuid>.json            (손상 인덱스 백업)
  .asset-monitor/state.json                   { version:1, rows:{ "<projectId|shared>:<assetId>": Row } }  — 캐시, 권위 아님
  Projects/<이름>-<id앞8자>/ ...              (기본 생성 위치; 사용자 지정 폴더 가능)
  Projects/Imported-<id>/ ...                 (0.3 가져오기)
  SharedLibrary/ ...                          (sharedRoot 기본값; 다른 경로 지정 가능)

<프로젝트 폴더>/
  project.lds.json                            locator { format:"LevelDesignStudio", schemaVersion:3, id, name, head:".studio/HEAD" } — 열기용, 권위 아님
  .gitattributes / .gitignore                 (없을 때만 생성; LFS 대상 assets/blobs/**, blobs/**; .studio/recovery/, .studio/cache/, *.log 무시)
  .studio/HEAD                                { generation:"<uuid>" }   ← 커밋 지점
  .studio/commits/<generation uuid>/document.json   프로젝트 문서(JSON, 2칸 들여쓰기)
  .studio/commits/<generation uuid>/complete.json   { hash: sha256(document.json 바이트), revision }
  .studio/recovery/candidate.json             { savedAt, token, baseGeneration, project }
  .studio/recovery/entries/<token>.json       (동일 형식, 누적)
  .studio/backups/                            legacy-original.json(0.3 원본), head-before-recovery-*.json, stale-lock-*.json
  .studio/write.lock                          { pid, token } (저장 중에만)
  assets/library.json                         프로젝트 전용 에셋 레지스트리 (형식은 D.6). 구버전 registry.json도 읽기 허용
  assets/blobs/<sha256>                       전용 에셋 바이트
  assets/.asset-history/<assetId>/<tx>.json   에셋 트랜잭션 journal
  assets/.studio/                             레지스트리 잠금용

<SharedLibrary>/
  library.json, library.json.bak             공용 에셋 레지스트리
  blobs/<sha256>
  .asset-history/<assetId>/<tx>.json
  projects/                                   (0.3 Store init이 만드는 빈 폴더, 사용 안 함)
  .studio/, .gitattributes, .gitignore
```

- 원자 쓰기: 임시 파일(`<file>.tmp-<uuid>`) 작성 + `fsync` → `replaceFile`(rename, Windows 일시 잠금 재시도). 대상 파일을 먼저 지우지 않는다.
- 프로젝트 저장 순서: `document.json` → `complete.json` → (expectedGeneration/checksum 재확인) → `HEAD` 교체(커밋 지점) → `project.lds.json` 갱신(실패해도 저장은 성공, 경고만).
- 읽기: HEAD의 generation → complete.hash와 document 바이트 SHA-256 비교 → `validateDocument` → `normalizeDocument`. HEAD 실패 시 모든 commit 중 revision 최대(동률이면 updatedAt) 정상본을 `recovery.requiresConfirmation=true`로 제시(자동 채택 안 함).
- blob 탐색 순서(`findBlob`): 공용 `blobs/` → 인덱스에 등록된 각 프로젝트의 `assets/blobs/`.

### D.2 프로젝트 문서 (schemaVersion 3)

최상위 필드 (`validateDocument` 기준 필수 = ●, 생성 시 항상 존재 = ○, 선택 = △):

| 필드 | 형식 | 비고 |
|---|---|---|
| `schemaVersion` ● | `3` | |
| `id` ● | UUID 소문자 `/^[0-9a-f-]{36}$/` | 폴더 이동·저장에도 불변. 복제 시 새 ID |
| `name` ● | 문자열 1~100자 (trim 후 비어 있지 않음) | |
| `revision` ● | 정수 ≥0 | 저장마다 +1 (서버가 부여) |
| `createdAt`, `updatedAt` ○ | ISO 문자열 | updatedAt은 저장 시 서버가 부여 |
| `metadata` ○ | `{ description:string, tags:string[] }` | |
| `coordinateSystem` ● | `{ unit:'meter', up:'Z', handedness:'right', origin:[x,y,z], originMode:'auto'|'user', frameVersion:int }` | unit/up/handedness 외 값은 거부 |
| `assets` ● | 객체 `{ [assetId]: AssetPin }` | 키 = asset.id, `hash` 64자 hex 필수 |
| `nodes` ● | Node[] (≤10000) | **권위 데이터** |
| `layers` ● | `[{ id, name, visible, locked }]` | 기본 8개: id = 각 NODE_TYPE 이름 |
| `entities` ● | Entity[] (≤10000) | nodes의 월드 좌표 projection |
| `objects` ● | OutputObject[] | 생성 결과(권위) + 독립 배치(projection) |
| `references` ● | Reference[] | Reference node의 projection |
| `footprints`, `recipes` ● | 배열 (보통 빈 배열) | v1 레거시. recipe.footprintId → footprint 필수 |
| `sync` ○ | `{ project:{state:'unconfigured'}, shared:{state:'unconfigured'} }` | 자리표시자 |
| `extensions` ○ | 객체 | `sceneAuthority:1` (D.3 참고) 및 선택 확장 |
| `sceneVersion` ○ | `1` | v2부터 |
| `migration` △ | `{ fromVersion:1, policy:'preserve-original-on-first-save' }` | v1 변환 문서 |
| `textureLinks` △ | `{ [modelAssetId]: [{ assetId, role:'baseColor'|'normal'|'orm'|'special' }] }` | UI가 role당 1개로 교체. **0.4.2 `validateDocument`는 검증하지 않음**(0.3 Store만 검증) |
| `assetAutoEvents` △ | `{ ["<projectId|shared>:<assetId>"]: <transaction uuid> }` | 이미 반영한 자동 갱신 이벤트(Undo 후 재적용 방지) |
| `exportProfile` △ | `{ engine:'unreal', version:'미설정', implemented:false }` | 0.3에서 만든 프로젝트에만 존재 |
| `storage` (일시) | `{ generation, checksum, path }` | 읽을 때 부여, 저장 시 제거 |
| `recovery` (일시) | `{ reason, candidate, requiresConfirmation:true }` | 복구 후보 표시용, 저장 시 제거. 존재하면 저장 거부 |

### D.3 Node (권위 객체) — `createNode`

```
{
  id: UUID,                        // 고유, 레이어/계층 이동에도 불변
  type: 'Terrain'|'Road'|'Building'|'Water'|'Zone'|'Prop'|'Reference'|'Group',
  name: string (≤100),
  transform: { position:[x,y,z], rotation:[x,y,z,w] (정규화 quaternion, |q|=1±1e-6), scale:[sx,sy,sz] (>0) },  // 부모 기준 로컬
  parentId: UUID|null,             // 부모는 반드시 type 'Group', 순환 금지
  layerId: string,                 // layers[].id 중 하나
  visible: boolean, locked: boolean,   // 실효값은 레이어·부모와 결합(effective)
  properties: object,              // 설계 노드: Entity.parameters 사본(Prop은 assetId 제외)
                                   // Reference 노드: { referenceId, referenceData:{...Reference payload, widthMeters(기준 폭)} }
  assetRefs: [{ assetId, hash }],  // hash는 project.assets[assetId].hash와 같아야 함
  referenceIds: UUID[],            // 대상은 type 'Reference' 노드여야 함
  generation: { status:'none'|'ready'|'dirty', outputIds:[UUID] },
  modification: { ownership:'Independent'|'User Override'|..., patches:[{ path:'transform', value, baseRevision }] },
  extensions: {
    legacyKind?: 'entity'|'object'|'reference',   // 어떤 호환 배열로 투영되는지
    projection?: object,           // 호환 배열의 비권위 필드 보존(kind, dimensions, unitScale, analysisOrigin 등)
    referenceOrder?: int,          // references 배열 순서(0 = 최상위)
    detachedAsset?: true,          // 모델 연결 해제된 배치(draft)
    previousUnappliedTransform?: Transform   // 0.4 Reference의 적용 안 됐던 transform 보존
  },
  geometry?: { type, points:[[x,y,z]] (노드 로컬), vertexIds:[UUID] }   // legacyKind 'entity'만
}
```

- 필수 검증: properties 객체, assetRefs/referenceIds 배열, generation/modification 존재, ID 형식·중복, NODE_TYPES, transform 유한성, 레이어 존재, 에셋 pin hash 일치, 부모 Group 존재, 비균일 축척+회전으로 shear가 생기면 거부.

### D.4 호환 projection 배열

`extensions.sceneAuthority === 1`이면 `validateProjection`이 `projectLegacy(nodes)` 재계산 결과와 저장된 `entities/objects/references`가 **완전히 같지 않으면 저장·로드를 거부**한다. 편집 경로는 두 가지다: 공통 명령(`applyNodeCommand`) → `projectLegacy`, 또는 기존 STEP 편집(배열 수정) → `reconcileLegacy(p, before)`(바뀐 행만 노드에 반영).

**Entity** (`createEntity`, 월드 좌표, 노드와 같은 id)
```
{ id, outputId (UUID, 생성 전 예약; 노드 ID로 재사용 불가),
  name, type (6종), layerId,
  geometry: { type: 'polyline'(Road)|'point'(Prop)|'polygon'(그 외),
              points: [[x,y,z], ...]  // Prop ≥1, Road ≥2, polygon ≥3, 최대 2000, 인접 점 XY 거리 ≥1e-6
              vertexIds: [UUID]       // points와 같은 길이, 중복 금지 },
  parameters: { ...타입별 },
  referenceIds: [referenceId],
  analysisOrigin?: { batchId, candidateId, sourceHash, approvedFrame },  // 후보 승인으로 생성된 경우
  legacyFootprintId?: UUID }
```
타입별 parameters 기본값과 범위:
| 타입 | 기본값 | 검증 |
|---|---|---|
| Building | `{floors:2, floorHeight:3}` | floors 정수 1~100, floorHeight (0,100]. 외곽 점 Z 동일 |
| Road | `{width:6, elevation:0.06}` | width (0,1000] |
| Terrain | `{elevation:0}` + 선택 `terrain`(D.8) | |
| Water | `{elevation:0.02, depth:0.3}` | depth (0,1000], 외곽 점 Z 동일 |
| Zone | `{elevation:0.1}` | |
| Prop | `{elevation:0, size:1}` + 선택 `assetId` | size (0,1000] |
공통: 폴리곤 면적>0, 자기 교차 금지, 숫자 파라미터 |v|≤1e7.

**OutputObject** (`objects[]`)
- 생성 결과 (`kind:'generated'`, 권위):
```
{ id: entity.outputId, kind:'generated', sourceEntityId: entityId, name, entityType,
  anchor:[x,y,z] (XY bbox 중심, Z 최소), position, rotation:[deg x,y,z] (Euler 도), scale,
  locked:false, ownership:'Generated'|'User Override',
  overrides?: { position, rotation, scale },          // markOverride가 기록
  geometry, parameters,                                // 생성 시점 사본
  generation: { generator: entityType, version:'level-basic-1' 또는 'level-basic-1/<TERRAIN_ALGORITHM>', seed:0, sourceSignature },
  terrainMesh?: (D.8),  assetId?, unitScale?: 0.01(fbx)|1,  recipeId? (레거시) }
```
- 독립 배치 (`sourceEntityId` 없음, 노드 projection, 같은 id):
```
{ id, kind:'asset'|'blockout', name, position, rotation(deg), scale, locked, ownership:'Independent'|'User Override',
  assetId? (kind 'asset' 필수), unitScale (asset: 0<x≤1000, 기본 fbx 0.01 / glb 1), dimensions? (blockout: [4,4,3] 기본) }
```
- ownership 허용값: `Generated`, `User Override`, `Independent`.

**Reference** (`references[]`, 배열 앞쪽이 위 레이어)
```
{ id (= Reference node id), name, assetId (project.assets에 존재),
  widthMeters (>0, 실제 가로 길이), sourceSize:[w,h] 픽셀 (>0),
  origin:[x,y,z] = 이미지 왼쪽 아래 모서리의 월드 위치, rotation: Z 회전(도),
  opacity (기본 0.65),
  scaleConfirmed?: boolean,         // 명시 false가 아니면 calibration 또는 geo가 있으면 확정으로 간주
  calibration?: { pixels:[[x,y],[x,y]], distanceMeters },
  geo?: { version:1, crs:'EPSG:3857', geographicCRS:'EPSG:4326', anchor:[lon,lat], bounds:[w,s,e,n], zoom, rotation:0,
          metresPerPixel, scaleErrorBound, method:'web-mercator-scaled-at-anchor', source, attribution, licenseUrl, tileTemplate },
  derived?: { version:1, sourceReferenceId?, sourceAssetId, sourceHash, sourceFrame?, sourceName?,
              operation: { type:'crop'|'perspective'|'raster-edit'|'photocraft-edit'|'psd-flatten', ... },
              engine:{ name, version, commit? }, documentAssetId?, documentHash? (photocraft-edit),
              coordinatePolicy:'preserve-source-pixel-scale'|'requires-new-metric-calibration' },
  sourceSizeInferred?: true }       // v1 변환 시 크기 미상
```
픽셀 규약: 픽셀 원점 왼쪽 위, +x 오른쪽, +y 아래. 월드 변환 `scale = widthMeters / sourceSize[0]`, `y_world_local = (H - py) * scale`, Z 회전 후 origin 더함(`referenceToWorld`).

### D.5 Asset pin (`project.assets[assetId]`)
레지스트리 레코드(D.6)의 **사본**(`structuredClone`) + 선택 `updatePolicy: 'follow-safe'|'pinned'`(없으면 따라가기). `projectId`는 공용이면 null, 전용이면 프로젝트 ID. 프로젝트는 이 hash의 바이트를 사용하며, 레지스트리 최신 hash로 자동 교체되지 않는다(사용자 적용 또는 follow-safe 정책의 승인 이벤트만).

### D.6 에셋 레지스트리 (`library.json`, 공용/전용 공통)

```
{ schemaVersion: 1, projects: [], assets: [AssetRecord] }
```
AssetRecord (`importAssetAtomic` 기준; 0.3 시절 레코드는 kind/metadata/sourceFiles/history가 없을 수 있음):
```
{ id: UUID (논리 에셋, 파일 갱신에도 불변),
  name: 파일 이름 (≤255), ext: 소문자 확장자, hash: SHA-256 hex, size: bytes (≤48MB),
  kind / category: 'Model'|'Material'|'Texture'|'TrimSheet'|'Decal'|'Mask'|'ModularKit'|'Recipe'|'Rule',
  textureRole: 기본 'baseColor',
  projectId: null (파일 안에서는 항상 null; API 응답에서 전용이면 프로젝트 ID 부여),
  createdAt, updatedAt,
  sourceFiles: [{ path: 절대경로, lastHash, size, mtimeMs }],   // 원본 감시 대상(최대 1개 사용)
  metadata: { ...사용자 메타,
              inspection: { status:'ok'|'unsupported'|'error', hash, summary? | reason? },
              catalog?: { styles:string[≤20,각≤40], tags:string[≤20,각≤40],
                          part:''|'Wall'|'Corner'|'Roof'|'Door'|'Window'|'Column'|'Floor'|'Stair'|'Prop'|'Building',
                          textureUsage:''|'TrimSheet'|'Tileable'|'Special'|'Unique'|'Atlas'|'Decal'|'Reference',
                          mapKind?: ''|'BaseColor'|'Diffuse'|'Normal'|'Roughness'|'Metallic'|'AO'|'Height'|'Opacity'|'Emissive'|'Mask'|'ORM'|'Specular'|'Glossiness'|'Other' },
              descriptor?: object (json descriptor 등록 시) },
  history: [{ hash: 이전 hash, updatedAt, transaction }],
  lastAcceptance?: { decision:'automatic'|'approved', reasons:string[], event: transaction uuid, hash } }
```
- 허용 확장자: fbx, glb, png, jpg, jpeg, webp, tga, exr, psd, pcraft, json(Material/ModularKit/Recipe/Rule/TrimSheet/Decal/Mask 분류일 때만).
- 중복: `assetId` 미지정 시 같은 레지스트리의 같은 hash+ext 레코드를 재사용.
- 갱신: 같은 ext 유지 필수, `expectedHash`로 경쟁 갱신 차단(409).
- inspection.summary (GLB/FBX): `{ format, identity, frame, slots, topology, meshCount, materialCount, animated, extensions|units }` — 변경 분류 비교 대상.
- Journal (`.asset-history/<assetId>/<tx>.json`): `{ transaction, state:'prepared'|'committed'|'committed-recovered'|'interrupted-preserved'|'conflict-preserved', at, before, after, registryHash }`.
- Asset monitor row: `{ key, assetId, projectId, name, path, libraryHash, status:'latest'|'detected'|'updating'|'review'|'deferred'|'cancelled'|'error'|'missing'|'moved', reason, candidate?:{hash,baseHash,reasons,safe,projectCount,placementCount,unscanned}, accepted?, projects?:[{projectId,status:'updated'|'deferred',reason?}], suggestions?, manualPath?, observed* }`.

### D.7 extensions 하위 스키마 (schema 3 안의 선택 확장; 없는 문서는 그대로 유효)

| 키 | 형식 | 규칙 |
|---|---|---|
| `sceneAuthority` | `1` | 있으면 nodes가 권위, projection 일치 검사 |
| `productionIdentity` | `{ version:1, records:[{ id:UUID, kind:'Recipe'|'Variant'|'Instance'|'Slot'|'Part', state:'active'|'retired', data:object, overrides?:object, recipeId?, variantId?, nodeId?, instanceId?, slotId?, semanticKey?, assetId? }] }` | ID는 문서/노드/객체/outputId/에셋/레거시 recipe와 충돌 금지. Variant→Recipe, Instance→Recipe(+Variant 일치)+기존 node, Slot→Instance+semanticKey(인스턴스 내 유일), Part→Slot(활성 Part는 Slot당 1개)+assetId 존재. active는 retired를 참조 불가. 모든 변경은 copy→validate→commit |
| `sockets` | `[{ id:UUID, ownerType:'node'|'asset', ownerId, key, type, accepts:string[], pose:{position,rotation(quat),scale} }]` | (ownerType,ownerId,key) 유일, 같은 key 재정의 시 ID 유지. 로컬 +X가 연결 법선 |
| `referenceAnalysis` | `[{ id, createdAt, sourceReferenceId, sourceAssetId, sourceHash, sourceFrame, signature, maskAssetId, engine, parameters:{mode:'regions'|'lines', threshold, minArea...}, visible, candidates:[{ id, type, points:[[px,py]] (원본 픽셀), confidence:null, evidence, status:'pending'|'approved'|'rejected', entityId? }] }]` | 배치/후보 ID UUID, 다른 ID와 충돌 금지, 후보 ≤100. 마스크 이미지는 별도 에셋 |
| `referenceVectors` | `{ version:1, layers:[{ version:1, id, name, anchor:[lon,lat], features:[GeoJSON Feature(LineString|Polygon), id:/^[-\w]{1,128}$/, properties:{mode}], sourceEngine, source, measurements:[{id,lengthMeters,areaSquareMeters}] }] }` | 레이어 ≤256, 피처 ≤1000, 정점 ≤20000, 모든 레이어 anchor 동일 |
| `geoReference` | `{ version:1, anchor:[lon,lat], method:'web-mercator-scaled-at-anchor' }` | 프로젝트 공통 지도 기준점(최초 지도 캡처/벡터 저장 시 설정) |
| `calibrationEvents` | `[{ at, referenceId, fromWidth, toWidth, entityIds, policy }]` | 축척 보정 이력 |

### D.8 지형 데이터

`Entity.parameters.terrain` (= Terrain 노드 `properties.terrain`, **노드 로컬 미터 좌표**):
```
{ version: 1,
  cellSize: 0.1~1000 (기본 5),
  baseMode: 'flat'|'idw' (기본 'idw'), baseHeight: number (기본 0),
  controlPoints: [{ id:UUID, position:[x,y,z] }]                 // ≤256, 경계 내부
  contours: [{ id:UUID, points:[[x,y]] (2~128), vertexIds:[UUID], height, closed:boolean }]   // ≤32, 닫힌 경우 끝점 중복 금지
  profiles: [{ id:UUID, name?, kind:'level'|'offset', mode:'base'|'absolute', shape?:'circle'|'stroke',
               center:[x,y], points?:[[x,y]] (stroke, 1~256), radius:(0,1e7], height }]           // ≤64
  modifiers: [{ id:UUID, profileId, enabled?:boolean, strength:0~1, falloff:≥0 }]                // ≤128, 배열 순서 = 적용 순서
  boundary?: { mode:'none'|'cliff'|'blend'|'platform', depth:(0,10000] (기본 5), width:(0,10000] (기본 8),
               slopeDegrees:0~75, baseHeight, smoothness:0~1 } }
```
- 지형 내부 모든 구성 ID는 정식 UUID 형식이며 서로 중복 금지.
- 계산 순서: Base(경계·제어점·등고선 IDW 또는 평면) → Profile 목표 높이(Base만 참조, 수정된 높이를 다시 읽지 않음) → Modifier 순차 블렌드(smoothstep falloff) → 그리드 샘플 + earcut + Delaunay 정제 + 등고선 절단 → 경계 띠.
- 생성 결과 `objects[].terrainMesh`:
```
{ version:1, algorithm:'base-profile-modifier-earcut-boundary-6', coordinateSpace:'world',
  positions:[[x,y,z]], indices:[int], vertexKeys:[ 'boundary:<vertexId>' | 'control:<id>' | 'contour:...' | 'grid:<ix>:<iy>' | 'junction:...' | 'edge:<mode>:...' ],
  parts:[{ name:'surface'|'cliff'|'side'|'blend'|'bottom', materialSlot:'terrain.surface'|'terrain.side'|'terrain.blend'|'terrain.bottom', start, count }],
  profiles:[{ id, targetHeight, kind }],
  stats:{ vertexCount, boundaryVertexCount, triangleCount, contourSegments, minHeight, maxHeight, localMinHeight, localMaxHeight, modifiers:[...영향 범위], boundaryMode?, ... } }
```
- 한도: 메시 정점 4096(경계 포함 12000), 그리드 검사 20000, 등고선 재샘플 1024점.
- 높이 계산이 없는 Terrain은 경계 폴리곤 면(점 Z 사용)만 표시.

### D.9 ID 규칙 요약
- 생성: `crypto.randomUUID()` (UUID v4). 저장 형식 검사는 대부분 `/^[0-9a-f-]{36}$/`(소문자), production/지형/분석 ID는 8-4-4-4-12 엄격 형식.
- 의도된 별칭(같은 ID): Node ↔ Entity, Node ↔ Reference, Node ↔ 독립 Object.
- 별도 ID: 생성 결과 Object의 id = `entity.outputId`(생성 전부터 예약). 노드 ID와 충돌 시 오류(`OUTPUT_NODE_ID_COLLISION`, `RESERVED_OUTPUT_NODE_ID_COLLISION`).
- Asset ID: 논리 에셋 단위, 내용 변경에도 불변. 내용 식별은 SHA-256 hash.
- Vertex ID: 도형 정점마다 UUID, 정점 이동에도 유지. 지형 경계에 높이점을 삽입하면 새 vertex ID만 추가.
- 의존성 그래프 주소(저장되지 않음): `<entityId>:terrain-base`, `:terrain-control:<id>`, `:terrain-contour:<id>`, `:terrain-profile:<id>`, `:terrain-modifier:<id>`.
- 지도 벡터 피처 ID: `/^[-\w]{1,128}$/` (UUID 아님). 래스터 레이어 ID: 문자열 ≤128. PhotoCraft 레이어 ID: 엔진의 양의 정수.

### D.10 좌표·단위 규약
- 설계 공간: 미터, 오른손 좌표계, XY 지면, Z 위. `coordinateSystem.origin`은 절대 오프셋이며 `rebaseOrigin`은 루트 노드·Reference·생성 결과 좌표를 이동해 월드 위치를 보존(`originMode:'user'`, `frameVersion++`).
- Node 회전: quaternion `[x,y,z,w]`. 호환 배열(objects)의 회전: Euler 도 단위 `[x,y,z]`(`fromEuler`/`toEuler`).
- 에셋 프레임(배치 Transform과 분리): GLB는 X축 +90° 회전(Y-up→Z-up), 점 매핑 `[x,-z,y]·scale`; FBX는 축 변환 없음, 기본 scale 0.01(cm). 원본 피벗 유지, 재중심화 없음.
- 엔진 프로필(검증된 FBX 수송 프로필 한정): Unreal 5.8 `[100x, -100y, 100z]` cm, Unity 6 `[-x, z, -y]` m. 회전은 `studioPoseToEngine` 사용.
- 지도: EPSG:4326 경위도 → 프로젝트 anchor 위도에서 축척한 Web Mercator 지역 미터(동=+X, 북=+Y).
- 이미지 픽셀: D.4 Reference 참조.

### D.11 스키마 버전과 마이그레이션 규칙
| 원본 | 처리 |
|---|---|
| schemaVersion 1 (0.3 이전 웹 MVP) | `upgradeProject`: footprints/recipes → Building Entity(같은 ID), 기존 결과에 `sourceEntityId`·ownership·`generation:{generator:'legacy-box',version:1,legacyBasePosition}` 부여, Reference 기본값(origin/rotation/sourceSize 추정). 이어서 v3 |
| schemaVersion 2 (0.3) | `upgradeFoundation`: schemaVersion 3, createdAt/updatedAt/metadata/origin/originMode/frameVersion/nodes/sync 추가 후 `reconcileLegacy`로 nodes 생성, `sceneAuthority:1` |
| schemaVersion 3, `sceneAuthority` 없음 (0.4 / 0.4.1) | 읽을 때 메모리에서 `reconcileLegacy`. 적용 안 됐던 Reference transform은 `previousUnappliedTransform`으로 보존(사용자 검토 UI) |
| 원본 보존 | 변환은 메모리에서만. 첫 저장은 **새 commit**으로 기록하고 이전 commit 바이트는 변경하지 않음. 0.3 가져오기는 원본 JSON을 `.studio/backups/legacy-original.json`에 복사하고 원본 Workspace는 수정하지 않음 |
| 미래/알 수 없는 버전 | `upgradeProject`가 오류(원본 보존). 알려지지 않은 필드는 projection 보존 영역(`extensions.projection`)에서 유지 |
| 하위 호환 | 0.4.2에서 저장한 문서를 이전 버전으로 다시 편집하는 것은 보장하지 않음 |

### D.12 로컬 API (`studio://app`, renderer ↔ main)
GET `/api/state`, `/api/projects/<id>`, `/api/foundation/<id>/{inspect|recovery|usages|versions}`, `/api/files/<sha256>?ext=&download&name=`, `/api/asset-monitor`.
POST `/api/projects`(생성: name, folder, folderMode 'child'|'itself'), `/api/foundation/import`, `/api/foundation/duplicate`, `/api/foundation/<id>/recovery`(body.project = 복구 후보 기록 / body.mode = 'disk'|'autosave'|'version'), `/api/assets`(등록·갱신), `/api/assets/catalog`, `/api/asset-monitor/{active|scan|decision|relink}`.
PUT `/api/projects/<id>` `{ project, expectedRevision }`.
렌더러 저장 흐름: 편집마다 recovery 기록 → PUT(revision·generation·checksum 검사) → 응답의 revision/storage 반영.
