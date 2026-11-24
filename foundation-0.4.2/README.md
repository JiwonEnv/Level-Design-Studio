# Level Design Studio — 소스

제품 명세·구현 현황·데이터 형식은 [../docs/handoff/README.md](../docs/handoff/README.md)를 봅니다.

## 개발
- 준비: `npm ci`. 외부 도구는 상위 폴더 `../.tools/`(PhotoCraft CLI, OpenCV.js)에 있어야 합니다.
- 실행: `npm run desktop` (빌드 후 Electron 실행)
- 테스트: `npm test`
- 실행 파일 만들기: `npm run package:dir` (폴더) / `npm run package:win` (설치 파일)
- 이미 만든 실행 파일 열기: `Start-Foundation.cmd`

자세한 실행·테스트 방법과 주의사항은 인계 문서 02의 A절에 있습니다.
