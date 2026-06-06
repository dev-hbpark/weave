# WI-104 — 아쿠를 @agocraft/sprite-engine으로 구동 (engine consumer)

| Field | Value |
|---|---|
| Status | Built — engine wired; **headless uses the WebGL2 worker tier** (verified); GPU pixel = real-GPU gate (single-session, 2026-06-06) |
| Owner | hbpark |
| Engine | agocraft WI-035 / DR-044 / FR-010 (`@agocraft/sprite-engine`) |
| Seam | DR-070 D2 (`AkuExpressionRenderer`) · WI-103 (`cssSpriteRenderer` = CSS fallback) |

## Note (scope change, 2026-06-06)

The sprite engine itself **relocated to agocraft** (operator: "sprite-engine을 agocraft로").
The engine's own feasibility/decision/plan live there (FR-010 / DR-044 / WI-035). This weave
WI now covers only the **weave consumer** side. (weave FR-021 / DR-071 are RELOCATED/SUPERSEDED
pointers to the agocraft records.)

## Problem

아쿠를 `@agocraft/sprite-engine`으로 움직인다 — GPU 가능 환경에선 엔진(WebGPU→WebGL2→Canvas2D)
으로, 불가 시 기존 `cssSpriteRenderer`로 강등. 아쿠의 mood 레지스트리·구독 훅은 무변경
(`AkuExpressionRenderer` 시임 회수).

## Change (planned)

- weave가 `@agocraft/sprite-engine`을 벤더 체인(`apps/web/vendor/agocraft/…tgz` +
  pnpm-workspace overrides)으로 추가.
- `apps/web/src/features/aku/expression/gpu-sprite-renderer.tsx` —
  `createGpuSpriteRenderer(): AkuExpressionRenderer`. `<canvas>` 마운트 → `createSpriteEngine`
  (아쿠 마스코트를 1프레임 아틀라스로 loadAtlas) → mood→clip 매핑(setClip). engine null이면
  `cssSpriteRenderer.render(state)` 폴백. wrapper에 `data-mood` 유지(관측성).
- `AkuAssistant`가 css 대신 gpu 렌더러 주입(폴백 내장).
- 실제 스프라이트 시트 아트는 DR-design-024(마스코트 리디자인)에 합류.

## Real sprite assets (2026-06-06, operator-provided)

실 마스코트 아트 도착(DR-design-024 충족) → placeholder 모드 종료:
- `public/aku/mascot.png`(히어로) + `public/aku/sprites/{idle,thinking,idea,spell-right,
  move-right,move-left,editing}.png`(각 6프레임 portrait 스트립). 구 `mascot-full/mark(@2x)` 제거.
- `AkuMascot` → `mascot.png`(@2x srcSet 제거). 어댑터 `SPRITES` 맵: **mood→에이전트 동작 시트**
  (idle·connecting=move-left·thinking·working=editing·finalizing=idea·celebrating=spell-right·
  looking=move-right; confused→thinking, sleeping→idle 재사용). cols=6 멀티프레임 → 프레임 사이클
  애니메이션(procedural bob은 단일프레임 전용). 시트는 mood 변경 시 `loadAtlas`로 스왑(이미지 캐시).
- 신규 mood **`connecting`** 추가(`mood.ts`/phrases/intensity/test) — 연결/재연결 단계를 별도 시트로.
- portrait(0.5종횡비) 프레임용 **contain-fit**을 엔진 양 tier에 추가(agocraft DR-045 갱신).

## Acceptance

- [x] 벤더된 `@agocraft/sprite-engine`이 weave vite 번들에서 로드(wasm 자산 해석 포함).
- [x] 아쿠가 엔진 canvas로 렌더(`data-mood` + `data-aku-engine=tier` 관측), engine null이면 css.
- [x] 아쿠 mood/구독 로직 변경 0(시임 뒤 교체) · reduced-motion 정지.
- [x] WI-103 expression e2e를 엔진 인지형으로 마이그레이션(canvas 픽셀 변화/정지).

## Verification (SVL gate — 2026-06-06)

- weave `tsc --noEmit` 0 ✔ · biome clean(변경 파일) ✔.
- 빌드/벤더: agocraft `@agocraft/sprite-engine`를 `npm pack` → `apps/web/vendor/agocraft/…tgz`,
  apps/web deps + pnpm-workspace overrides 등록, `pnpm install` ✔.
- **vite wasm 통합 디버그**: optimizeDeps 사전번들이 `new URL("../wasm/…")`를 깨뜨려 wasm 대신
  index.html 반환(`CompileError: expected magic word … found 3c 21 64 6f` = `<!do`)을 진단 →
  `vite.config` `optimizeDeps.exclude:["@agocraft/sprite-engine"]`로 해결(wasm 200 + `core ready`).
- **GPU worker tier 통합 디버그**(추가): (1) bundled `dist/index.js` 기준 worker 경로가
  `./worker/host.js`여야 함(`../`는 404→worker 미로딩) · (2) `transferControlToOffscreen`된
  canvas 재사용 불가 → StrictMode/분기 리마운트 크래시 → 어댑터가 **세션마다 명령형 canvas
  생성** · (3) reduced-motion e2e는 `emulateMedia`+reload(networkidle 비의존) + coachmark
  선닫기(런처 분기 리마운트로 frame 리셋 방지).
- 아쿠 e2e 11/11 ✔ — `aku-expression.spec`(3): 엔진 tier 바인딩(**헤드리스=webgl2 worker**) ·
  **프레임 텔레메트리 전진(아쿠가 메인스레드 밖 WebGL2 + WASM 타임라인으로 실제 움직임)** ·
  reduced-motion 정지. + `aku-chat.spec`(8) 회귀 없음.
- **WebGPU 픽셀 = 실기기 수동 게이트**(agocraft DR-045).

## Follow-up — 투명도(alpha) 에셋 교체 (2026-06-06)

구 스프라이트/마스코트가 **불투명(흰 배경 박힘, `hasAlpha:no`)** 이라 캔버스에 흰 박스로
보임 → 사용자 제공 **투명 PNG**로 교체:
- `mascot.png` + `sprites/{idle,thinking,idea,move-left,move-right}.png` 6종 alpha 반영.
- `editing.png`는 기존본이 이미 투명 → 유지.
- **`spell-right.png`는 이번 배치 미포함 + 불투명** → 제거(Decommission). 이를 쓰던
  `celebrating` mood를 투명한 `idea`로 리매핑(`gpu-sprite-renderer.tsx` SPRITES).
- 검증: 전 에셋 `hasAlpha:yes`(spell-right 제거) · 런처 스크린샷에서 캐릭터 주위 투명(흰 박스
  없음) 확인 · 코드 내 spell-right 참조 0 · tsc/biome 클린 · 아쿠 e2e 11/11 회귀 없음.
- (참고) `spell-right` 투명본을 추후 받으면 celebrating 재분리 가능.

See agocraft WI-035 / DR-044 / DR-045 / FR-010.
