# WI-127 — px ↔ 비율 단위 오인으로 아이템이 거대해지는 현상 가드

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-07) |
| Owner | hbpark |
| Decision | DR-082 |
| Relates | DR-078(zero-frame 가드) · commands.ts(item.add/update) · weave-capabilities/command-schemas |

## Problem (operator, 2026-06-07)

아쿠 에이전트가 아이템 추가 시 **px 자리에 비율값을 넣어** 너무 크게 그려지는 현상.
구체 증상: "24px를 넣어야 하는데 24%(ratio)를 넣어서 너무 크게 그려짐."

원인: `fontSizeSpec` 의 `value` 가 `kind` 에 따라 의미가 뒤집히는데(`ratio` → value×부모높이),
`{kind:'ratio', value:24}` 가 `24×1080 ≈ 25920px` 로 폭발. 상한 가드가
`resolveFontSize`·명령·프롬프트 어디에도 없었음. `ensureUsableFrame` 도 `width/height` 상한 없음.

## Change

- **A** `commands.ts`: `sanitizeFontSizeSpec(attrs)` 추가 — `kind:'ratio' && value>1` 이면
  `{kind:'px', value}` 재태깅 + DEV warn. `weave.item.add`(text 분기), `normalizeTextAttrs`
  (→ `weave.item.update`), `weave.items.update`(batch text) 적용.
- **B** `commands.ts` `ensureUsableFrame`: `width|height > 3`(부모 300%)면 seed 크기로 복구 + DEV warn.
- **C** 프롬프트: `weave-capabilities.ts` · `weave-command-schemas.ts` 에 역방향 경고 추가
  (px 크기를 ratio에 넣으면 부모높이배로 거대해짐 / ratio는 0..~0.1).

## Acceptance

- [x] `weave.item.add { kind:'text', attrsOverride:{ fontSizeSpec:{kind:'ratio', value:24} } }`
      → 저장 후 `{kind:'px', value:24}` 로 교정.
- [x] `weave.item.update` 로 `fontSizeSpec:{kind:'ratio', value:48}` → px:48 교정.
- [x] `frame.width:24` → seed 폭으로 복구(x/y·정상 side 유지).
- [x] 정상값(`{kind:'ratio', value:0.06}`, `width:1.05` bleed, `{kind:'px', value:24}`)은 그대로 통과.
- [x] tsc 0 · biome clean · 기존 commands 테스트 green.

## Verification (SVL gate — 2026-06-07)

- `npx vitest run src/document/commands.test.ts` → **109/109 green** (신규 7 포함:
  fontSizeSpec ratio→px add/update, 정상 ratio/px 통과, frame 24→seed 복구, 1.05 bleed 통과).
- `npx tsc --noEmit` → exit 0. `npx biome check` (변경 4파일) → clean.
- 구현: `commands.ts` `sanitizeFontSizeSpec`(add text / `normalizeTextAttrs` / `items.update` text) +
  `ensureUsableFrame` MAX_FRAME_SIDE(=3) 복구. 프롬프트 역방향 경고
  (`weave-capabilities.ts`, `weave-command-schemas.ts`).
- 참고: ratio→px 교정은 명령 계층(History 경유)에서 일어나 Cmd+Z로 되돌릴 수 있음(DR-078과 동일).
  reverse-MCP 서버 전용 경로는 오프라인 e2e 직접구동 불가 → 명령 단위테스트로 회귀 고정.
