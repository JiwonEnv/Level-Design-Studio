# 02. 현재 구현 현황

코드 기준 소스와 남은 작업. 데이터 형식은 [03-DATA-FORMAT.md](03-DATA-FORMAT.md).

- 기준 소스: `foundation-0.4.2/` (package `level-design-studio` 0.4.2). 아래 경로는 별도 표기가 없으면 이 폴더 기준 상대 경로다.
- 루트의 `src/`, `store.js`, `server.js`, `release-0.3/` 등은 0.3 계열 이력이다. 단, `foundation-0.4.2/store.js`(0.3 저장 형식 클래스)는 0.4.2에서도 **공용 라이브러리 저장과 0.3 가져오기**에 계속 사용된다.
- 판정은 코드를 직접 대조한 결과다. 문서와 코드가 다르면 코드를 따랐다.

---

## A. 기술 구성

### 런타임 스택 (package.json 고정 버전)

| 구분 | 패키지 / 도구 | 버전 | 실제 용도 |
|---|---|---|---|
| 데스크톱 셸 | electron | 45.3.1 | `desktop/main.js` (진입점 `main`), 커스텀 프로토콜 `studio://app/`, HTTP 서버 없음 |
| 패키징 | electron-builder | 26.18.0 | NSIS x64 설치 파일, asar, 출력 `release-0.4.2/` |
| 번들러 | vite | 8.3.8 | `vite build` → `dist/` (별도 vite.config 없음, 기본 설정) |
| 3D | three | 0.180.0 | 3D 뷰, GLTFLoader/FBXLoader/OrbitControls/TransformControls/SkeletonUtils |
| 지도 | maplibre-gl | 6.18.0 | STEP 1 지도 화면, OSM 래스터 타일 |
| 지도 벡터 입력 | terra-draw / terra-draw-maplibre-gl-adapter | 1.40.0 / 1.5.0 | 지도 위 선·폴리곤 입력 |
| 측정 | @turf/area, @turf/length | 7.4.0 | 지도 벡터 길이·면적 |
| 삼각분할 | earcut | 3.2.4 | 지형 메시, 플랫폼 바닥 |
| UI 테스트 | @playwright/test | 1.56.1 | `tests/*.pw.js` (웹 미리보기 경로) |
| 이미지 편집 엔진(외부 실행 파일) | PhotoCraft CLI | 0.23.1 (commit 45066c48292e92229ada3459a83453439514c83d) | 래스터 편집 세션(`serve`), PSD 합성(`convert`), 크롭/원근(`run`) |
| 이미지 분석(외부 모듈) | OpenCV.js | 4.13.0 (`opencv.cjs`) | 명암 영역/선 후보 추출 (worker thread) |

- PhotoCraft·OpenCV는 npm 의존성이 아니다. 개발 시 `../.tools/photocraft-0.23.1/photocraft-cli.exe`, `../.tools/opencv-4.13.0/opencv.cjs`(기준 폴더의 상위)를 사용하고, 패키징 시 `extraResources`로 `resources/tools/photocraft`, `resources/tools/opencv`에 복사한다. 이 폴더가 없으면 패키징·해당 기능이 실패한다.
- PhotoCraft 0.23.1 소스 사본: `vendor/photocraft-0.23.1` (참조용, 재컴파일하지 않음). 라이선스 사본: `vendor/licenses`.
- Node.js 요구 버전: 0.4.2 문서에 명시 없음 (0.3 README는 22.12+ 또는 24 LTS) — 확인 필요.
- package.json `build.files`에 `adapters/**/*`가 있으나 폴더가 존재하지 않는다(무해하지만 정리 대상).

### 실행 (npm scripts)

| 명령 | 내용 |
|---|---|
| `npm run desktop` | `vite build` 후 `electron .` (개발용 데스크톱 실행) |
| `npm start` | `electron .` (이미 빌드된 `dist/` 필요) |
| `npm run build` | `vite build` → `dist/` |
| `npm run package:dir` / `package:win` | 빌드 후 electron-builder `--dir` / NSIS 설치 파일 |
| `npm run dev`, `dev:web`, `start:web` | `node server.js` 웹 미리보기. **주의: `server.js`는 0.3 `Store`(store.js)를 사용하며 FoundationStore가 아니다.** 0.4.2 저장 계약 검증용이 아님 |
| `Start-Foundation.cmd`, `Start-Studio.cmd`, `Start-Current.cmd`(루트) | 배포 빌드 실행기. 유지하는 배포 빌드는 `release-0.4.2/library-home-current` 하나이며, `Start-Foundation.cmd`는 그 안의 `win-unpacked` 실행 파일을 연다 |

환경 변수: `STUDIO_WORKSPACE`(Workspace 경로), `STUDIO_SHARED_LIBRARY`(공용 라이브러리 경로), `STUDIO_USER_DATA`(설정 폴더).
기본 경로: 설정 `%APPDATA%/Level Design Studio Foundation 0.4.2/studio-settings.json`, Workspace `문서/Level Design Studio Foundation 0.4.2/Workspace`, 공용 라이브러리 기본값 `<Workspace>/SharedLibrary`.

### 테스트

| 명령 | 범위 |
|---|---|
| `npm test` | `node --test` 로 `tests/store.test.js`(4), `tests/desktop-service.test.js`(2), `tests/scene.test.js`(4), `tests/foundation/*.test.js`(27개 파일, 116) — 코드상 `test()` 126개. 일부(PhotoCraft·Blender fixture 관련)는 외부 실행 파일/fixture 필요 — 확인 필요 |
| `npm run test:foundation` | foundation 단위 테스트만 |
| `npm run test:ui` | Playwright, `server.js`(0.3 Store) 대상 웹 경로 |
| `npm run test:desktop`, `test:foundation:desktop`, `test:reference:*`, `test:terrain:*`, `test:editor:ux`, `test:drawing:completion` 등 | `scripts/test-*.mjs` — 실제 Electron/배포 exe를 구동하는 시나리오 시험. 인자로 exe 경로를 받는 형태가 있음 |
| `scripts/test-asset-desktop.mjs`, `test-compatibility-desktop.mjs` | npm script 미등록, 직접 실행 |
| `npm run prepare:engine:validation` | Unreal/Unity 좌표 검증용 격리 프로젝트 준비 (`scripts/engine-validation/`) |

결과 산출물: `.foundation-validation/`, `.asset-validation/`, `.compat-validation/`, `.engine-validation/` (테스트 증거 폴더, 소스 아님).

### 빌드 출력
- `dist/` : Vite 번들(index.html, assets/*). Electron은 `studio://app/`으로 `dist/index.html`과 `dist/assets/<파일명>`만 서빙.
- `release-0.4.2/` : electron-builder 출력 폴더. 유지하는 배포 빌드는 `release-0.4.2/library-home-current`(`win-unpacked/` 포함) 하나다. appId `com.leveldesignstudio.foundation.asset042`, 코드 서명 없음.
## B. 폴더/모듈 구조

### core (순수 도메인 로직, Node·브라우저 공용)
- `core/scene-model.js` — schema 2 Scene 모델: `ENTITY_TYPES`, `createEntity`, v1→v2 `upgradeProject`, `entityIssues`(기하 검증), `validateScene`, `markOverride`, `referenceToWorld/worldToReference`(이미지 픽셀↔월드).
- `core/generation.js` — STEP 3 생성 계획/적용: `planGeneration`(순수), `planGenerationForChanges`(의존성 영향 기반), `applyGeneration`, `generationInputSignature`, `GENERATOR_VERSION='level-basic-1'`.
- `core/foundation/document.js` — schema 3 문서 권위 모델: `NODE_TYPES`, `ASSET_KINDS`, Transform 수학(quaternion), `createNode`, `reconcileLegacy`/`projectLegacy`/`validateProjection`, `normalizeDocument`, `upgradeFoundation`, `newDocument`, `validateDocument`, `rebaseOrigin`, `applyNodeCommand`.
- `core/foundation/history.js` — `CommandHistory`(Undo/Redo, 트랜잭션 검증·롤백, 최대 100), `contentKey`.
- `core/foundation/identity.js` — ID 무결성 진단(`identityIssues`).
- `core/foundation/production-identity.js` — `extensions.productionIdentity` (Recipe/Variant/Instance/Slot/Part) ID 레지스트리와 원자적 조작.
- `core/foundation/part-generation.js` — Slot에 Part 데이터를 기록하는 미리보기/적용(형상 생성 없음).
- `core/foundation/sockets.js` — `extensions.sockets` 계약, 월드 포즈, 연결 호환 검사(순수 함수).
- `core/foundation/dependencies.js` — 의존성 그래프(source→consumer), 순환/누락 진단, `affectedBy`.
- `core/foundation/coordinates.js` — 원점 상대/절대 변환, GLB/FBX 에셋 프레임, Unreal 5.8/Unity 6 좌표 프로필.
- `core/foundation/references.js` — 참조 이미지 축척 확정 판정, 레이어 순서.
- `core/foundation/reference-calibration.js` — 축척 보정 영향 계획/적용(선택 도형 XY 재투영).
- `core/foundation/image-derivation.js` — 크롭/원근 작업 정의, 파생 Reference 프레임, `referenceFrameSignature`.
- `core/foundation/raster-edit.js` — (이전) Studio 자체 래스터 편집 문서 v1 검증·변환.
- `core/foundation/analysis-candidates.js` — 이미지 분석 배치/후보 저장, 승인→Entity 생성, 검증.
- `core/foundation/geographic.js` — Web Mercator 지역 미터 근사, 지도 캡처 Reference 프레임.
- `core/foundation/reference-vectors.js` — 지도 벡터(GeoJSON) 레이어 정규화·저장, Turf 측정.
- `core/foundation/design-inspection.js` — 설계 치수/면적/경사, 건물 외곽 겹침·축척 미확정·생성 결과 갱신 필요 검사.
- `core/foundation/terrain-definition.js` / `terrain-boundary.js` / `terrain-constraints.js` / `terrain-contour-mesh.js` / `terrain-domain.js` / `terrain-pipeline.js` / `terrain-authoring.js` — 지형 높이 정의 검증, 경계(Cliff/Blend/Platform), 제약 준비, 등고선 메시 절단, 기하 유틸, `resolveTerrain`(메시 생성), 2D 높이 편집 명령.
- `core/foundation/extensions.js` — 외부 확장 모듈 레지스트리(전부 `available:false`) 및 stale-revision 보호 실행.

### infrastructure (Node 전용, 파일시스템/외부 프로세스)
- `infrastructure/foundation-store.js` — `FoundationStore`: Workspace 인덱스, 프로젝트 폴더별 immutable commit 저장, HEAD 전환, 쓰기 잠금, 충돌 사본 감지, 복구 후보, 버전 복원, 0.3 가져오기, 복제, blob 탐색, 에셋 무결성 검사, 사용처 조회.
- `store.js` — 0.3 형식 `Store`(library.json + blobs + projects/*.json). 0.4.2에서는 공용/프로젝트 전용 **에셋 레지스트리 파일 형식**으로 재사용, `AppError`, 허용 확장자 `allowed`.
- `infrastructure/asset-transactions.js` — 에셋 등록/갱신 트랜잭션(blob → journal prepared → library.json 원자 교체 → committed), 시작 시 journal 복구 분류.
- `infrastructure/asset-inspection.js` — GLB/FBX(binary 7xxx, ASCII)/PNG/JPEG/WebP/PSD 구조 요약, 변경 분류(`classifyChange`).
- `infrastructure/asset-catalog.js` — 공용 에셋 분류(styles/tags/part/textureUsage/mapKind) 저장.
- `infrastructure/replace-file.js` — Windows 일시 잠금(EPERM/EACCES/EBUSY) 시 rename 재시도(최대 20회), 대상 삭제 없음.
- `infrastructure/photocraft-session.js` — PhotoCraft `serve` 프로세스 세션(JSON-lines), 명령 화이트리스트, `.pcraft` manifest 읽기, 렌더/내보내기.
- `infrastructure/psd-import.js` — PSD 헤더 검사(RGB 8bit, v1, ≤8192px), PhotoCraft `convert`로 평탄화 PNG.
- `infrastructure/image-editor.js` — PhotoCraft `run`으로 크롭/원근 미리보기.
- `infrastructure/image-analysis.js` + `image-analysis-worker.cjs` — OpenCV 영역(findContours)/선(HoughLinesP) 후보, 20초 타임아웃.

### application
- `application/asset-monitor.js` — `AssetMonitor`: 원본 파일 감시(fs.watch + 1.2초 polling, 0.9초 안정화), 변경 분류, 자동 갱신/검토(적용·보류·취소), 누락/이동 후보·재연결, 다른 프로젝트 자동 반영, 상태 `<Workspace>/.asset-monitor/state.json`.

### desktop (Electron main/preload)
- `desktop/main.js` — 앱 수명, 단일 인스턴스, 설정, Store/Monitor 생성, `studio:` 프로토콜 등록, IPC(PhotoCraft/PSD/분석/폴더 선택/작업 폴더 전환), 저장 중 종료 보호, 네트워크 차단.
- `desktop/local-service.js` — `studio://app` 요청 핸들러(REST 형태 `/api/*`), CSP, 출처 검사, 68MB 요청 제한.
- `desktop/network-policy.js` — 허용 요청: `studio://app`, blob/data/devtools, `https://tile.openstreetmap.org/{z}/{x}/{y}.png`만.
- `desktop/preload.cjs` — `window.studioDesktop` 브리지(IPC 래퍼만 노출, Node API 비노출).

### src (렌더러 UI)
- `src/main.js` — 앱 메인 화면: 프로젝트 로드/저장 큐, STEP 탭, 에셋 등록/갱신/pin, 3D 뷰(Three.js), 생성 미리보기/적용, 이미지 가져오기(PSD/PhotoCraft 결과 포함), 장면 JSON 다운로드.
- `src/planner.js` — STEP 1/2 SVG 2D 편집기(도형 그리기·정점 편집·스냅 1m·축척 보정·레이어·설계 검사).
- `src/reference-workspace.js` — STEP 1 자료 준비 화면(이미지/지도 모드, 자료 목록, 분석 레이어).
- `src/map-workspace.js`, `map-range.js`, `map-vector-workspace.js` — MapLibre 지도, 캡처 범위 선택, Terra Draw 벡터 편집.
- `src/photocraft-workspace.js` — PhotoCraft 편집 UI. `src/raster-workspace.js`, `raster-renderer.js` — 이전 Studio 래스터 편집기. `src/image-workspace.js` — 크롭/원근 UI. `src/analysis-workspace.js` — 후보 분석/검수 UI.
- `src/terrain-canvas.js`, `terrain-inspector.js` — 지형 2D 높이 입력과 수치 편집.
- `src/generated-view.js` — 생성 결과 → Three.js 메시. `src/generation-review.js` — 생성 미리보기 검토 UI. `src/editor-ui.js` — 툴바/인스펙터 마크업. `src/support-summary.js` — 지원 범위 안내문.
- `src/shell/foundation.js` — Home/프로젝트 생성·열기·복제·0.3 가져오기·설정(원점 재배치)·공통 노드 편집·연결 검사. `shell/asset-library.js` — 공용 에셋 라이브러리 브라우저(분류·미리보기·사용처). `shell/asset-status.js` — 에셋 변경 상태/검토 UI. `shell/compatibility-review.js` — `previousUnappliedTransform` 검토. `shell/home-view.js` — Home 마크업.

### tests / scripts
- `tests/*.test.js`, `tests/foundation/*.test.js` — node:test 단위/통합 테스트. `tests/*.pw.js` — Playwright.
- `scripts/` — 데스크톱 시나리오 시험, Blender fixture 생성(`export-asset-fixtures.py`, `reexport-asset.py`, `export-coordinate-fixture.py`), 엔진 좌표 검증(`validate-unreal-coordinates.py`, `engine-validation/CoordinateValidation.cs`, `Coordinates.uproject`), 과거 마이그레이션/통합 보조 스크립트.
## C. 영역별 구현 현황

표기: **구현됨** / **부분 구현**(빠진 것) / **미구현**.

### STEP 1 — Reference(자료 준비)

| 기능 | 상태 | 근거·비고 |
|---|---|---|
| 이미지 Reference 등록(PNG/JPG/WebP), 여러 장·레이어 순서·표시/잠금 | 구현됨 | `src/main.js`(references.unshift), `core/foundation/references.js`(`moveReferenceLayer`, `referenceOrder`) |
| Reference 월드 배치(원점·Z 회전·균일 XY 축척) | 구현됨 | Reference node transform이 권위. 기울기·비균일 축척은 거부 (`projectLegacy`) |
| 두 점 실측 축척 보정 + 연결 도형 재투영 미리보기/선택 적용 | 구현됨 | `reference-calibration.js`; 지형 높이 데이터도 XY 재투영. 이력은 `extensions.calibrationEvents` |
| 축척 미확정 시 연결 도형의 3D 생성 차단 | 구현됨 | `referenceScaleIssues` → `planGeneration`/`applyGeneration` |
| 크롭 / 네 점 원근 보정(파생 이미지, 원본 보존) | 구현됨 | `image-derivation.js`, `infrastructure/image-editor.js`(PhotoCraft `run`). 원근 결과는 축척 재확정 필요 |
| PhotoCraft 래스터 편집(브러시/지우개/도형/선택·복사·붙여넣기/레이어/Undo, `.pcraft` 보존) | 구현됨 | `photocraft-session.js`, `src/photocraft-workspace.js`. 결과 PNG + `.pcraft`를 프로젝트 에셋으로 저장, `derived.operation.type='photocraft-edit'`. 레이어 최대 64 |
| 이전 Studio 래스터 편집 문서(`raster-edit`) | 구현됨(유지) | `raster-edit.js`, `src/raster-workspace.js` — 이전 기록 열기용 |
| PSD 입력 | 부분 구현 | RGB 8bit·PSD v1·3/4채널만 PhotoCraft로 합성 PNG 입력(`psd-flatten`). PSD 레이어 가져오기·PSB·CMYK·16/32bit 미지원. PSD 원본은 에셋으로 보존 |
| 지도(MapLibre + OSM) 캡처 → Reference | 구현됨 | `geographic.js` `mapReferenceFrame`(≤10km, 기준점 대비 축척오차 ≤0.5%, 회전·원근 없음), `extensions.geoReference` 공통 기준점. 출처·라이선스 기록 |
| 지도 벡터(선·폴리곤) 입력·측정·저장 | 부분 구현 | Terra Draw/Turf, `extensions.referenceVectors`. **설계 객체(Road/Building)로의 자동 변환 없음** |
| 이미지 분석 후보(OpenCV 영역/선) → 검수·정점 수정 → 선택 승인 | 부분 구현 | `analysis-candidates.js`, `image-analysis.js`. ≤4M 픽셀, ≤100 후보, 명암 임계값 기반. 의미 분류 없음, `confidence:null`. 선 후보→Road만, 영역→Building/Water/Zone. 도로 중심선 폭·Terrain 의미 변환·SAM 미구현 |
| TGA/EXR 미리보기·구조 분석 | 미구현 | 등록·다운로드만 |

### STEP 2 — 2D Planner

| 기능 | 상태 | 근거·비고 |
|---|---|---|
| 6개 의미 객체(Terrain/Road/Building/Water/Zone/Prop) 그리기: 선·폴리곤·사각형·점 | 구현됨 | `src/planner.js`, `scene-model.js createEntity` |
| 정점/객체 드래그, 숫자 편집, 레이어/잠금/표시, 계층(Group) | 구현됨 | `applyNodeCommand`, planner |
| 스냅 | 부분 구현 | 화면 좌표 1m 반올림(`screenPoint`)만. 모듈 규격 치수 스냅·보정 제안 없음 |
| 설계 검사(치수·면적·경사, 건물 외곽 겹침, 축척 미확정, 출력 갱신 필요) | 부분 구현 | `design-inspection.js`. 2D 외곽 겹침만(최대 2000쌍). 3D 충돌·보행성·접근성 검사 없음 |
| 지형 높이 편집(브러시 올리기/내리기/평탄화, 높이점, 등고선, 경계 방식, 변형 순서) | 구현됨 | `terrain-authoring.js`, `src/terrain-canvas.js`, `src/terrain-inspector.js`. 2D에서만 입력 |
| L/ㄷ 프리셋, 출입구 방향, 구역 용도 규칙 | 미구현 | 코드 부재 |

### STEP 3 — 생성

| 기능 | 상태 | 근거·비고 |
|---|---|---|
| 생성 미리보기(순수)·선택 적용·취소, 입력 서명으로 stale 차단 | 구현됨 | `core/generation.js` |
| 수동 변형 보존(User Override), 독립 배치·잠금 보호 | 구현됨 | 출력 `ownership`, `overrides` 유지 |
| 건물 | 부분 구현 | 외곽선 Extrude 볼륨(층수×층고)만 (`generated-view.js`). 모듈/Recipe 조립·지붕·파사드 없음. `part-generation.js`는 Slot에 데이터만 기록 |
| 도로 | 부분 구현 | 구간별 평면 리본(폭·고도). 교차로 접합·지형 추종·교량/계단/옹벽 없음 |
| 지형 | 부분 구현 | 기본: 경계 폴리곤 면. 높이 계산 활성 시 IDW/평면 Base → Profile → Modifier → earcut+Delaunay 정제 메시 + 경계(Cliff/Platform/Blend) (`terrain-pipeline.js`, 알고리즘 `base-profile-modifier-earcut-boundary-6`). 이웃 지형 접합, DEM, 노이즈, 3D 직접 브러시, Road/Building→Terrain Modifier 연결 없음 |
| 수면/구역/프랍 | 부분 구현 | Water·Zone 평면(반투명), Prop 박스 또는 연결 에셋 모델 |
| 의존성 기반 부분 재생성 | 부분 구현 | `planGenerationForChanges`+`affectedBy` 존재. UI의 연결 검사는 영향 표시용 |
| seed/규칙 기반 재현 생성, Recipe 편집기, Rule Inspector | 미구현 | `seed:0` 고정 |

### STEP 4 — 3D 뷰/편집/출력

| 기능 | 상태 | 근거·비고 |
|---|---|---|
| 3D 표시(생성 결과, GLB/FBX 모델), Orbit, TransformControls Gizmo, 숫자 Transform | 구현됨 | `src/main.js` (Z-up 카메라) |
| 복제·잠금·배치 제거, 블록아웃 | 구현됨 | `newObject('asset'|'blockout')` |
| 입력 단위 선택(m / cm) | 구현됨 | `unitScale` 1 또는 0.01 |
| FBX 축 자동 판별, Draco/KTX2 디코더, 외부 텍스처 머티리얼 자동 적용 | 미구현 | GLB만 Y-up→Z-up 표시 변환 |
| Fly/와이어프레임/단면/보행 검사, 구조 부품 직접 편집 | 미구현 | |
| 장면 JSON 다운로드 | 구현됨(엔진 출력 아님) | `#manifest` → 프로젝트 문서 그대로 `<이름>-scene.json` |
| 에셋 원본 파일 다운로드 | 구현됨 | `/api/files/<hash>?download` |
| 생성 장면 FBX/GLB 내보내기 | 미구현 | |

### 에셋 라이브러리

| 기능 | 상태 | 근거·비고 |
|---|---|---|
| 공용(Shared Library) / 프로젝트 전용 레지스트리 분리 | 구현됨 | `assetRegistry` (공용 = `sharedRoot`, 전용 = `<프로젝트>/assets`) |
| 등록: fbx, glb, png, jpg/jpeg, webp, tga, exr, psd, pcraft, json(descriptor) / 48MB | 구현됨 | `store.js allowed`, `asset-transactions.js` |
| 동일 내용 중복 방지(같은 레지스트리·같은 확장자 hash 재사용) | 구현됨 | |
| 동일 Asset ID로 파일 갱신, 이력(`history`), 이전 blob 보존 | 구현됨 | |
| 프로젝트별 pin(hash 고정) + `updatePolicy` follow-safe/pinned | 구현됨 | `project.assets`, `src/main.js pin()` |
| 원본 파일 변경 감지·자동 갱신/검토·누락/이동·재연결 | 구현됨 | `application/asset-monitor.js` |
| 구조 검사(GLB/FBX/PNG/JPEG/WebP/PSD), 변경 분류 | 부분 구현 | 정적 모델 중심. 애니메이션·sparse accessor·외부 버퍼 GLB·TGA/EXR은 자동 판정 불가 |
| 분류(styles/tags/part/textureUsage/mapKind), 라이브러리 Home | 구현됨 | `asset-catalog.js` — **공용 에셋만** |
| 텍스처 연결(`textureLinks`, role별) | 부분 구현 | 모델 단위·role당 1개. Material Slot별 연결, 색 공간·채널, 3D 머티리얼 자동 적용 없음 |
| 미배치 모델 3D 썸네일 | 부분 구현 | 공용 라이브러리 상세에 3D 미리보기 있음(`shell/asset-library.js`). Home 썸네일 완료 여부 확인 필요 |
| 프로젝트 전용→공용 승격, .blend 원본 등록, Blender 애드온 | 미구현 | |
| 미사용 blob 정리 | 미구현 | 저장 공간은 증가만 함 |

### 저장 · 복구 · 마이그레이션

| 기능 | 상태 | 근거 |
|---|---|---|
| 프로젝트 폴더별 immutable commit + HEAD 원자 전환 + 체크섬 | 구현됨 | `foundation-store.js commit/readGeneration` |
| 낙관적 동시성(revision + generation + checksum), 409 충돌 | 구현됨 | `saveProject` |
| 쓰기 잠금(`.studio/write.lock`, PID 생존 확인, stale 잠금 백업 후 재시도) | 구현됨 | `withWriteLock` |
| 동기화 충돌 사본(`HEAD*`, `project.lds*` 변형 이름) 감지 시 저장 차단 | 구현됨 | `conflictFiles` |
| 자동 복구 후보(매 저장 전 기록) / HEAD 손상 시 최신 정상 commit 후보 / 버전 목록·복원 | 구현됨 | `writeRecovery`, `readFolder`, `versions`, `restoreVersion`, `applyRecovery` |
| Workspace 인덱스 손상 시 백업 후 재구성 | 구현됨 | `init` |
| 프로젝트 폴더 열기(이동 감지: 원래 경로 존재 시 같은 ID 거부) | 구현됨 | `openProjectFolder` |
| 프로젝트 복제(새 ID, 전용 에셋·blob 복사) | 구현됨 | `duplicate` |
| 0.3 데이터 가져오기(원본 바이트 보존) | 구현됨 | `importLegacy` |
| v1→v2→v3 스키마 업그레이드, 0.4/0.4.1 → sceneAuthority 재구성 | 구현됨 | `upgradeProject`, `upgradeFoundation`, `normalizeDocument` |
| 에셋 트랜잭션 journal 복구 분류 | 구현됨 | `inspectAssetTransactions` |
| 오래된 commit 정리(GC) | 미구현 | commit은 계속 누적 |

### 동기화

| 기능 | 상태 | 근거 |
|---|---|---|
| Git/LFS 원격 동기화(인증·push/pull·LFS 전송·merge) | 미구현 | 구현 시 규칙은 [08-TECH-RULES.md](08-TECH-RULES.md) 5절. 코드는 `.gitattributes`/`.gitignore`를 생성만 함(`policies`) |
| LFS 포인터 파일 감지 | 구현됨(검사만) | `checkAssets`: blob이 LFS 포인터면 "Git LFS 원본 미다운로드" 오류 |
| OneDrive 동기화 | 부분 구현 | 별도 기능 없음. 충돌 사본 감지·잠금·Windows 재시도로 방어. 두 PC 동시 편집·Files On-Demand 실환경 미검증 |
| 문서 `sync` 필드 | 자리표시자 | 항상 `{project:{state:'unconfigured'},shared:{state:'unconfigured'}}` |
| 다른 PC 절대경로 재매핑(sourceFiles path, 인덱스 path) | 미구현 | 절대경로는 PC 로컬 |

### 엔진 출력

| 기능 | 상태 | 근거 |
|---|---|---|
| Unreal 5.8 / Unity 6 좌표 변환 프로필 | 구현됨(함수만) | `coordinates.js studioToEngine/studioPoseToEngine`. Blender 5.1 FBX fixture로 측정 검증. 적용 범위·검증 규칙은 [08-TECH-RULES.md](08-TECH-RULES.md) 1.1절 |
| Export Manifest, Unreal/Unity Importer/Adapter, 재출력 시 엔진 수작업 보존 | 미구현 | `extensions.js`의 Unreal/Unity/Blender/Exporter 모듈은 `available:false` |
## E. 알려진 제한 · 남은 작업

코드 상수·진단 메시지와 화면 지원 범위 안내문(`src/support-summary.js`) 기준. 각 영역을 구현할 때 지킬 규칙은 [08-TECH-RULES.md](08-TECH-RULES.md).

1. **동기화 미구현**: Git/LFS 원격·인증·push/pull·merge, 다른 PC 경로 재매핑. `.gitattributes`는 정책 파일일 뿐. OneDrive 두 PC 동시 편집·Files On-Demand·실제 전원 차단은 미검증.
2. **엔진/Blender 출력 미구현**: Export Manifest, Unreal/Unity Importer, 재출력 시 엔진 수작업 보존, 생성 장면 FBX/GLB 변환, Blender 애드온. 좌표 프로필 검증은 단일 FBX fixture 수송 프로필 한정.
3. **모듈 건축 미구현**: Module Library 규격 편집, Recipe 편집기·규칙 평가, Slot에 실제 부품 형상 배치(현재 `part-generation`은 데이터만), Rule Inspector. 건물은 Extrude 볼륨뿐.
4. **도로·시설 연결 미구현**: 교차로, 지형 추종, RoadProfile/BuildingPlacement → Terrain Modifier, 교량·계단·옹벽, Socket 기반 자동 연결.
5. **지형 잔여**: 3D 직접 브러시, 이웃 지형 접합, DEM/노이즈, 구간별 경계 규칙. 기울어진 지형 2D 편집 불가. 정점 4096 한도.
6. **재질**: Material Slot별 텍스처 연결, 색 공간·채널, 외부 텍스처의 3D 머티리얼 자동 적용 없음. `textureLinks`는 0.4.2 문서 검증 대상이 아님.
7. **STEP 1 잔여**: 지도 벡터·분석 후보의 의미 변환(도로 중심선/폭, Terrain), SAM, PSD 레이어/PSB/CMYK/16·32bit, TGA/EXR 미리보기.
8. **STEP 2/4 잔여**: 규격 치수 스냅, 프리셋, 3D 충돌/보행성 검사, Fly/와이어프레임/단면, FBX 축 자동 판별, Draco/KTX2.
9. **에셋 감시 한계**: 정적 모델 중심 비교, 이동 후보는 같은 폴더만, 영향 수는 현재 Workspace에 등록된 프로젝트만, 여러 프로젝트 반영은 프로젝트별 개별 트랜잭션(전체 원자 아님). 파일당 48MB.
10. **저장 공간**: blob·commit·journal·recovery entries 정리(GC) 없음 — 계속 증가.
11. **외부 확장 모듈**: `extensionRegistry`의 Reference/Generation/AssetImporter/Blender/Unreal/Unity/Exporter/Validation 모두 `available:false`.
12. **AI 계획/실패 규칙 재사용(작업 54)**: 제품 내 기능 없음.
13. **배포**: NSIS 설치 마법사 설치/제거 미검증, 코드 서명·전용 아이콘 없음. 유지하는 배포 빌드는 `release-0.4.2/library-home-current`.
14. **개발 경로 혼선**: `server.js`·`npm run dev:web`·`test:ui`는 0.3 Store 경로 — 0.4.2 저장 계약을 검증하지 않음. package.json `files`의 `adapters/**` 폴더 없음.
15. **번들 크기**: 3D 포함 단일 대형 청크 경고, 코드 분할은 후속.
## F. 지켜야 할 계약 / 불변 조건 (테스트로 강제됨)

| 계약 | 내용 | 테스트 |
|---|---|---|
| ID 안정성 | 저장·재열기·STEP 변경·Undo/Redo·원점 재배치·복제 외에는 ID 재발급 없음. Node/Entity/Reference/독립 Object는 같은 ID, 생성 결과는 예약된 outputId | `tests/foundation/identity.test.js`, `foundation.test.js`, `production-identity.test.js`, `fault-matrix.test.js` |
| ID 무결성 검사는 읽기 전용 | 진단이 문서를 수정·자동 복구하지 않음. 잘못된 편집은 트랜잭션 전체 롤백 | `identity.test.js` |
| 단일 권위(Scene ownership) | nodes가 권위, 호환 배열은 projection과 정확히 일치해야 저장·로드됨. 관계없는 레거시 편집이 공통 편집을 덮지 않음. 모델 연결 해제는 되살아나지 않음 | `stabilization.test.js`, `foundation.test.js` |
| 생성 미리보기 순수성·수정 보존 | `planGeneration`은 문서를 바꾸지 않음. 적용 시 User Override·독립 배치·다른 결과 유지. 미리보기 후 변경되면 적용 거부 | `tests/scene.test.js`, `part-generation.test.js` |
| 축척 미확정 차단 | 미확정 Reference에 연결된 도형만 생성 차단, 적용 시 재확인 | `references.test.js`, `design-inspection.test.js` |
| 축척 보정 | 순수 영향 계획, 선택 도형만 XY 재투영, ID·높이·속성·기존 출력 보존, stale 입력 거부 | `reference-calibration.test.js`, `analysis-candidates.test.js` |
| 원본 보존 | 에셋 원본 바이트·이전 blob 불변, 파생 이미지는 provenance(sourceHash/sourceFrame) 유지, PSD 원본 불변, 0.3/v1 원본 바이트 보존 | `image-derivation.test.js`, `raster-edit.test.js`, `psd-import.test.js`, `photocraft-session.test.js`, `tests/scene.test.js`(v1), `foundation.test.js`(legacy import) |
| 원자적 저장 | commit 각 단계(document/complete/HEAD) 장애 시 이전 또는 완전히 검증된 새 generation만 존재. HEAD/locator 손상이 과거 바이트를 덮지 않고 복구는 명시적 확인 필요 | `fault-matrix.test.js`, `foundation.test.js` |
| 동시성·충돌 | 오래된 revision/generation/checksum 저장 거부(409), 같은 revision의 외부 HEAD 변경·OneDrive 충돌 사본 시 저장 차단, 두 번째 writer 거부 | `fault-matrix.test.js`, `stabilization.test.js`, `tests/store.test.js` |
| 복구 | 복구 후보는 재시작 후에도 유지, 더 새로운 작업을 조용히 되돌리지 않음, 손상 인덱스는 백업 후 재구성 | `foundation.test.js`, `stabilization.test.js`, `fault-matrix.test.js` |
| 프로젝트 이동 | 원래 경로가 살아 있으면 같은 ID 등록 거부, 사라졌을 때만 재연결 | `fault-matrix.test.js`, `stabilization.test.js` |
| 에셋 ID·pin | 같은 Asset ID로 갱신, 동일 바이트 중복 방지, 다른 프로젝트는 이전 바이트 유지, pinned 정책은 자동 반영 제외, 누락 pin 파일이면 저장 차단 | `tests/store.test.js`, `asset-monitor.test.js`, `fault-matrix.test.js`, `asset-catalog.test.js` |
| 에셋 트랜잭션 | blob/prepared/metadata 단계 중단 시 완전한 레지스트리·이전 바이트 유지, journal 재시작 분류, 외부 레지스트리 변경·충돌 사본 시 덮어쓰기 금지, 불완전 원본 파일은 정상 blob을 대체하지 않음 | `asset-monitor.test.js` |
| 변경 분류 | 실제 Blender GLB/FBX에서 mesh/UV는 safe, pivot/slot/hierarchy는 review | `asset-monitor.test.js` |
| 분류 저장 | 분류 편집이 바이트·ID·이력·pin을 바꾸지 않음, stale 편집 거부 | `asset-catalog.test.js` |
| Windows 파일 교체 | 일시 잠금은 재시도, 영구 실패는 대상 삭제 없이 오류 전파 | `replace-file.test.js` |
| 좌표 | 10m fixture가 Three 렌더 행렬과 일치·오프센터 피벗 보존, 원점 재배치가 절대 기하 보존, 엔진 프로필이 측정 중심과 일치, quaternion 특이점 왕복, shear 거부 | `coordinates.test.js`, `foundation.test.js`, `fault-matrix.test.js` |
| 지도 | 인접 캡처가 공통 anchor 유지, 넓은 범위/원거리/비평면 거부, OSM 타일 외 네트워크 차단 | `geographic.test.js`, `map-range.test.js`, `reference-vectors.test.js` |
| 의존성 | 영향은 의존 객체·예약 출력에만 전파, 누락·순환·알 수 없는 ID는 진단 | `dependencies.test.js` |
| Socket | 로컬 포즈·의미 키 ID 유지, 에셋 Socket은 배치 필요, 연결은 상호 타입·반대 법선·명시 허용오차 | `sockets.test.js` |
| 지형 결정성·원자성 | 단계 결정적, Base로 피드백 없음, 잘못된/과대 입력이 기존 출력을 대체하지 않음, 등고선 높이 정확 재현·충돌 원자 거부, 경계 모드 형상 | `terrain-pipeline.test.js`, `terrain-contours.test.js`, `terrain-authoring.test.js`, `terrain-boundary.test.js` |
| 확장 모듈 | 미연결 모듈을 성공으로 보고하지 않음, stale 결과 차단 | `foundation.test.js` |
| 데스크톱 보안 경계 | HTTP 서버 없이 `studio://app`만, 출처·경로·실행 파일 콘텐츠 제한 | `tests/desktop-service.test.js`, `tests/store.test.js` |

추가 운영 규칙(코드 강제): 저장 실패 시 화면 편집 유지·추가 저장 중지, 저장 중 창 닫기 지연(`studio:prepare-close`), 단일 인스턴스, 렌더러 sandbox/contextIsolation, 권한 요청 전부 거부.

---

### 확인 필요 항목 모음
- 현재 `npm test` 전체 통과 여부(코드상 126개 테스트; 외부 PhotoCraft·Blender fixture 의존 테스트 포함).
- 개발 Node.js 최소 버전(0.4.2 문서에 명시 없음).
- Home 화면 미배치 모델 3D 썸네일의 최종 상태(공용 라이브러리 상세 미리보기는 코드에 있음).
