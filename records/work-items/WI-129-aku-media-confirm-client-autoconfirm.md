# WI-129 — 생성 전 미디어 질문: 단순 사용 여부 + 클라이언트 5초 자동 컨펌

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-07) |
| Owner | hbpark |
| Decision | DR-084 |
| Relates | `@small-think/client` ClarifyRequest/ClarifyHandler · AkuSettings.askBeforeGenerate |

## Problem (operator, 2026-06-07)

> "아쿠에이전트에서 디자인 생성 요청후 미디어 사용 여부를 물어보는 대화를 기존에 이미지 비디오등
> 선택해제 할수있는 상태에서 단순히 미디어 사용 여부만 물어보고 해당 대화는 5초 동안 입력이 없으면
> 그냥 사용으로 자동 진행되길원해 이건 서버에서 처리하는게 아니고 클라이언트에서 대화창에 5초 카운트후
> 자동 컨펌형태가 되면좋겠어"

`ClarifyPicker`가 미디어 타입(이미지/동영상/QR…)을 개별 토글 칩으로 노출 → 인지 부하 + 무한 대기.

## Change (client-only, `ClarifyPicker.tsx`)

- **A** 타입별 토글 칩 + `TYPE_LABEL` 매핑 제거 → "디자인에 미디어를 사용할까요?" 단일 질문 +
  **사용**(전체 type) / **사용 안 함**(`[]`) 버튼.
- **B** 5초 idle 자동 컨펌: `setTimeout`(5s) → `onSubmit(allTypes)`, 별도 `setInterval`로 남은
  초 카운트다운(버튼 `사용 (N)` · 안내문 · 진행 바). `doneRef`로 이중 submit 가드, 언마운트 시
  두 타이머 cleanup.
- 서버/`onClarify` contract·`askBeforeGenerate` 게이트 불변.

## Acceptance

- [x] 타입 칩 제거, 사용/사용 안 함 이지선다.
- [x] 입력 없으면 5초 후 "사용"으로 자동 진행(전부 클라이언트).
- [x] 카운트다운 시각화(버튼 숫자 + 진행 바).
- [x] 이중 submit 없음(doneRef), 타이머 cleanup.
- [x] tsc 0 · biome clean.

## Verification (SVL gate — 2026-06-07)

- `npx tsc --noEmit`(apps/web) → ClarifyPicker 에러 0.
- `npx biome check apps/web/src/features/aku/ClarifyPicker.tsx` → clean.
- clarify 플로우 e2e는 live small-think 연결 필요 → dev 서버 실생성 흐름 육안 확인 권장.
