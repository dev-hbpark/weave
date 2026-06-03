# WI-089 — 디자인 선택 영역 내보내기 / 가져오기 (파일 전송)

Status: **Done** (2026-06-04 — 구현·유닛·e2e 브라우저 검증 완료)
Owner: hbpark
Updated: 2026-06-04

## Problem

사용자: 디자인의 **선택한 일부**를 파일로 내보내고, 다른 디자인(또는 다른 세션)에서
그대로 **가져오기**하고 싶다. 전체 문서가 아니라 "복사한 만큼"을 옮기는 단위.

## Decision (DR-051)

클립보드(WI-041)가 이미 선택 영역을 `weave/items.v1` 페이로드로 직렬화해
`editor.exec("weave.clipboard.paste")`로 재발행한다. 익스포트/임포트는 **새 직렬화·
새 paste 경로를 만들지 않고**, 그 페이로드 위에 **파일 전송 계층**만 얹는다.

- 범위: **선택 영역만** (전체 문서 X — 운영자 확정).
- 익스포트: 선택 서브트리를 `serializeItemSubtree`로 직렬화 → `MAX_PASTE_NODES`
  동일 게이트 → `WeaveExportFileV1` 봉투로 감싸 `<slug>-selection.json` 다운로드.
  문서에서 직접 빌드하므로 **사용자 클립보드를 건드리지 않음**.
- 임포트: 파일 파싱·구조 검증(외부 입력) → 페이로드를 paste가 읽는 **같은
  `clipboardStore`에 기록** → 기존 `weave.clipboard.paste` 호출(remapIds·단일
  트랜잭션·단일 Cmd+Z·프레임 투영·노드 캡 전부 재사용) → **이전 클립보드 복원**.

## 구현

1. **순수 코어** (`document/export-import/export-import.ts`): `WeaveExportFileV1`
   봉투(`_weave` 매직 + `fileVersion`), `buildExportFile` / `serializeExportFile` /
   `parseExportFile`. DOM·editor·I/O 없음 → 유닛 테스트 가능.
2. **훅** (`use-export-import.ts`): `exportSelection()` Blob 다운로드,
   `importFile(file)` 읽기→검증→임포트-paste(클립보드 저장/복원).
3. **UI** (`DesignHeader.tsx`): 헤더 우측 문서 그룹에 파일 메뉴(`IconMore`) —
   "선택 영역 내보내기"(선택 없으면 비활성) + "가져오기…"(숨김 file input).
   피드백은 디자인시스템 `Banner` 재사용(자동 소멸).
4. **DesignPage**: paste 리졸버(컨테이너 id/크기/포인터)를 클립보드와 **공유**하도록
   추출 → 클립보드 paste와 임포트 paste가 동일하게 안착.

## 포맷 / 호환

- 새 빌드 파일 → `unsupported-file-version`, 모르는 페이로드 → `unsupported-payload`,
  임의 JSON → `not-a-weave-file`, 손상 → `malformed-payload`로 거부.
- 유효 파일 내부의 **모르는 item kind**는 거부하지 않고 보존(paste의 deserialize
  `onUnknown: "preserve"` — 클립보드 교차버전 정책과 동일).
- relations는 `[]`로 내보냄(DR-019 D3 후속 — 두 전송이 같은 PR에서 함께 graduate).

## Gate / 검증

- `pnpm typecheck` 통과 · `pnpm test` **515 green**(신규 12: 라운드트립·순서·캡·거부 코드).
- `biome check` 신규 파일 무결 · Rule 6(kind switch 금지) 무결.
- e2e: `export-import.spec.ts` **2/2**(익스포트→임포트 라운드트립 + 단일 Cmd+Z 되돌리기,
  비-weave 파일 거부). 회귀: `clipboard-items` + `clipboard-paste-special` **7/7**.

## 후속 (out of scope)

- 전체 문서 내보내기 / `.zip`(에셋 번들) — 별도 WI.
- relation 클로닝(클립보드와 공통).
