# DR-082 — px ↔ 비율(ratio) 단위 오인 가드 (item.add/update)

| Field | Value |
|---|---|
| Status | Accepted (2026-06-07) |
| Owner | hbpark |
| Relates | DR-078(zero-frame 가드) · WI-127 |

## Context

weave의 편집 값은 두 단위가 섞여 있다:

- `frame.{x,y,width,height}` = **부모 대비 0..1 비율**
- `fontSizeSpec`/`cornerRadius`/`letterSpacing` 등 = **절대 design-px**

`fontSizeSpec`은 같은 `value`가 `kind`에 따라 의미가 완전히 뒤집힌다. vendored
`@agocraft/core` 의 `resolveFontSize`:

```js
return s.kind === "ratio" ? s.value * parentHeightPx : s.value;  // 상한 클램프 없음
```

- `{kind:'px', value:24}` → 24px (의도)
- `{kind:'ratio', value:24}` → 24 × 부모높이(≈1080) = **25,920px** (폭발)

아쿠 에이전트가 "24px"를 의도하고 `kind:'ratio'`로 오태깅 + `value:24`를 그대로 넣으면
부모높이배(≈1000×)로 거대해진다. 운영자 보고 증상("24px 자리에 24%가 들어가 너무 크게").

기존 방어가 3중으로 비어 있었다:
1. `resolveFontSize` — ratio value 상한 없음.
2. `weave.item.add`/`update` — fontSizeSpec sanity 없음(DR-078은 *크기 0*만 복구).
3. 프롬프트 — **반대 방향**(plain fontSize에 0.07 → sub-pixel)만 경고, px값을 ratio에
   넣는 *과대* 방향 경고는 없음.

같은 부류로 `ensureUsableFrame`도 `width/height` 상한이 없어 `width:24`(2400%)가 통과.

## Decision

DR-078과 동일 위치(명령 `run()`)·동일 철학("에이전트의 잘못된 기하 입력을 사용 가능한
값으로 복구 + DEV warn")으로 단위 오인 가드를 추가한다.

- **A. fontSizeSpec sanitize** — `kind:'ratio'` 인데 `value > 1` 이면 px 크기를 ratio로
  오태깅한 것으로 보고 `{kind:'px', value}` 로 재태깅 + DEV warn. (실제 디자인에서 ratio
  폰트는 부모높이의 0..1 미만이라 1 초과는 사실상 100% px 오인.) add/update/items.update 적용.
- **B. frame 과대 가드** — `ensureUsableFrame` 에서 `width|height` 가 SANITY_MAX(=3,
  즉 부모의 300%)를 넘으면 단위 오인으로 보고 seed 크기로 복구 + DEV warn. 300% 이하 overflow는
  의도적 bleed/넘침일 수 있어 허용(클램프하지 않음).
- **C. 프롬프트 보강** — `weave-capabilities.ts`/`weave-command-schemas.ts` 에 누락된 역방향
  경고 추가: "ratio value는 0..~0.1; 절대 px는 반드시 `kind:'px'`. ratio에 24 같은 px 숫자를
  넣으면 부모높이배로 거대해짐."

## Why not

- **resolveFontSize 자체 클램프(core 수정)**: core는 vendored — re-vendor 비용 + 다른
  소비자 영향. 단위 의도 복구는 weave 명령 계층의 책임이 맞다(DR-078 선례).
- **frame width/height를 1로 하드 클램프**: 의도적 bleed(예: 1.05)를 깨뜨림. 명백한 단위
  오인(>300%)만 복구하고 나머지는 프롬프트로 줄인다.
- **plain fontSize 분수(0..1) 자동 교정**: 명령 단에서 부모 px를 몰라 의도 px로 환산 불가 →
  프롬프트(이미 존재)로 처리.

## Consequences

- 에이전트의 가장 흔한 폰트 폭발(px를 ratio로 오태깅)이 자동 교정된다.
- DEV 콘솔에 교정 로그가 남아 회귀 추적 가능.
- frame 300% 초과 단위 오인도 사용 가능 크기로 복구.
- e2e/단위 테스트로 "ratio value 24 → px 24" / "width 24 → seed 복구" 회귀 고정.
