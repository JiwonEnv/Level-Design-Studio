# Level Design Studio 개발 인계

게임 레벨의 맵 전체를 설계해 Blender와 Unreal/Unity에서 바로 쓸 수 있는 구조화된 블록아웃을 만드는 데스크톱 프로그램이다.

## 읽는 순서
1. [01-PRODUCT-SPEC.md](01-PRODUCT-SPEC.md) — 무엇을 왜 만드는가. 모든 기능 결정
2. [02-CURRENT-IMPLEMENTATION.md](02-CURRENT-IMPLEMENTATION.md) — 지금 코드에 무엇이 있고 무엇이 없는가, 실행·테스트 방법, 지켜야 할 계약
3. [03-DATA-FORMAT.md](03-DATA-FORMAT.md) — 저장 폴더 구조와 JSON 형식
4. [04-SCREENS.md](04-SCREENS.md) — 화면 시안
5. [05-MILESTONES.md](05-MILESTONES.md) — 개발 단계와 완료 기준
6. [06-OPEN-DECISIONS.md](06-OPEN-DECISIONS.md) — 아직 정하지 않은 것
7. [07-OPEN-SOURCE.md](07-OPEN-SOURCE.md) — 단계별 오픈소스·기존 소스 활용, Houdini·Unreal 기능 대체 방법
8. [08-TECH-RULES.md](08-TECH-RULES.md) — 코드가 지켜야 할 기술 규칙(좌표·ID·저장·동기화·UI)

## 소스
- 기준 소스: `foundation-0.4.2/` (이 폴더에서 `npm test`, `npm run desktop`)
- 실행 파일: `foundation-0.4.2/release-0.4.2/library-home-current/` (루트 `Start-Current.cmd`로 실행)
- 외부 도구(PhotoCraft CLI, OpenCV.js)는 상위 폴더 `.tools/`에 있어야 한다. 자세한 내용은 02의 A절.

## 작업 규칙
- 01에 적힌 결정을 바꾸지 않는다. 바꿔야 할 이유가 생기면 먼저 묻는다.
- 06에 있는 항목은 임의로 정하지 않는다.
- 02의 "지켜야 할 계약"(ID 안정성, 원본 보존, 원자적 저장, 사용자 수정 보호)을 깨지 않는다. 테스트로 확인한다.
- 화면이 어떻게 보일지 애매하면 구현 전에 화면 시안으로 확인받는다.
