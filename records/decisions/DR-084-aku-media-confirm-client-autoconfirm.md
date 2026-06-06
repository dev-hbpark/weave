# DR-084 — 생성 전 미디어 질문을 타입 선택 → 단순 사용 여부 + 클라이언트 5초 자동 컨펌으로 단순화

- **Date:** 2026-06-07 · **Status:** Accepted · **WI:** WI-129
- **Relates:** `@small-think/client` `ClarifyRequest`/`ClarifyHandler` (clarify 채널),
  `AkuSettings.askBeforeGenerate`, DR-030(deps ref), 루트 CLAUDE.md(Decommission Sweep)
- **Operator directive (2026-06-07):** 아쿠에서 디자인 생성 요청 후 미디어 사용 여부를 묻는 대화를,
  기존 이미지·비디오 등 **타입별 선택 해제** 방식에서 **단순히 미디어 사용 여부만** 물어보고,
  **5초 동안 입력이 없으면 그냥 "사용"으로 자동 진행**. 서버가 아니라 **클라이언트에서 5초 카운트 후
  자동 컨펌** 형태.

## Context

`ClarifyPicker`는 small-think 서버가 생성 전에 보내는 `ClarifyRequest`(`kind: "item-types"`,
`options: [{type,label,…}]`)를 받아 이미지/동영상/QR… 타입을 **개별 토글 칩**으로 노출하고,
사용자가 뺄 것을 직접 해제하게 했다. 선택지가 많아 인지 부하가 컸고, 사용자가 자리를 비우면 대화가
무한 대기했다. 서버 contract는 선택된 `type[]`을 돌려주는 것 — 전체 = 미디어 사용, `[]` = 미디어 없음.

## Decision

### D1 — 단일 사용 여부 질문 (타입 칩 제거).
"디자인에 미디어를 사용할까요?" 한 줄 + 버튼 2개. **사용** = 서버가 제시한 `options`의 **전체
type**, **사용 안 함** = `[]`. 타입별 선택 UI(`TYPE_LABEL` 매핑 포함) 제거.

### D2 — 클라이언트 5초 idle 자동 컨펌.
서버 변경 없음. `onClarify` promise는 그대로 대기하고, **클라이언트**가 5초 `setTimeout`으로
`onSubmit(allTypes)`(= 사용)을 호출. 별도 `setInterval`이 남은 초만 카운트다운(버튼 `사용 (N)`,
"N초 후 자동으로 사용합니다", 줄어드는 진행 바)을 그린다 — resolve가 state 업데이트 콜백 안에서
일어나지 않게 타이머를 분리. `doneRef` 가드로 타이머 만료와 막판 클릭의 이중 submit을 차단.

### D3 — 기존 게이트 불변.
`askBeforeGenerate`(생성 전 질문 받기) off → 종전대로 즉시 `[]`(미디어 없음) 반환. 자동 컨펌은
질문이 떠 있을 때(=on)만 작동.

## Consequences

- (+) 인지 부하 감소: N개 타입 토글 → 사용/사용 안 함 이지선다.
- (+) 자리를 비워도 5초 뒤 미디어가 포함된 디자인으로 진행(자동 = 사용).
- (+) 전부 클라이언트 처리 — 서버/contract 무변경, 드롭인 교체.
- (−) 타입별 미세 제어(이미지만, 비디오만) 상실 — operator가 단순함을 우선한 의도적 트레이드오프.
- (−) 5초는 하드코딩(`AUTO_CONFIRM_SECONDS`). 필요 시 설정화 — 현재는 YAGNI.

## Verification

- `tsc --noEmit`(apps/web) 0, `biome check` clean.
- clarify 플로우 e2e는 live small-think 연결 필요 → 컴포넌트는 순수 UI(주어진 request 기준
  카운트다운+submit). dev 서버 실생성 흐름 육안 확인 권장.
