# WI-105 — 에이전트 편집 중 인터랙션 락 (아쿠 패널만 조작 가능)

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-06) |
| Owner | hbpark |
| Decision | DR-072 |
| Relates | WI-052(AkuAssistant portal) · WI-104(streaming status 소비) · editor-hotkeys(window input-bus) |

## Problem (operator, 2026-06-06)

에이전트(아쿠) 편집 중에는 **아쿠 패널만 조작 가능**하고 캔버스·툴바·헤더 등 다른 영역의
인터랙션(클릭·단축키·휠)을 막고 싶다.

## Change

`status === "streaming"` 동안 켜지는 경계-레벨 레이어드 락(DR-072):
- `apps/web/src/features/aku/interaction-lock.ts` — `installInteractionLock({rootEl, isExempt})`:
  `#root`에 `inert` + window capture 가드(keydown/keyup/wheel; 비예외 target은
  `stopImmediatePropagation`+`preventDefault`) 설치, cleanup 반환. `isAkuSurface(target)` =
  `closest("[data-aku-panel],[data-aku-launcher]")`. 순수 DOM(React 무관) → jsdom 단위검증.
- `apps/web/src/features/aku/AkuInteractionLock.tsx` — `locked` prop으로 위 락을 effect로
  토글 + 스크림 오버레이(z-47, `var(--bg)/45`+blur, "아쿠가 편집 중…" `role=status`) 렌더.
- `AkuAssistant.tsx` — body portal 프래그먼트에 `<AkuInteractionLock locked={status==="streaming"} />` 추가.

## Acceptance

- [x] streaming 중 스크림이 뜨고 캔버스/툴바/헤더 포인터가 차단된다(Aku 패널/런처 제외).
- [x] streaming 중 전역 단축키(delete 등)·휠줌이 비-Aku 영역에서 무효, 패널 키는 통과.
- [x] `#root`에 `inert`가 걸리고 streaming 종료 시 해제(자동, status 추종).
- [x] Stop은 항상 동작(패널 예외) · 에이전트 `editor.exec` 편집은 차단 안 됨.

## Verification (SVL gate — 2026-06-06)

- typecheck 0 · biome clean.
- typecheck 0 · biome clean(변경 파일) · 아쿠 단위 59/59(신규 락 4건 포함) · 아쿠 e2e 11/11 회귀 없음.
- 단위(jsdom) `interaction-lock.test.ts` 4건: install 시 `#root` inert ON + cleanup 시 OFF ·
  비예외 target keydown은 window 버블 리스너에 도달 안 함(차단)/cleanup 후 복구 · `[data-aku-panel]`
  target keydown은 도달(통과) · wheel 차단.
- **통합 검증(락 강제 ON 임시 e2e, 검증 후 원복)**: `[data-aku-lock]` 스크림 표시 · 실제 `#root`에
  `inert` ON · **Delete 전역 단축키 차단**(아이템 1→1, 실제 에디터 hotkey 시스템 대상) · 스크린샷으로
  앱 dim + "아쿠가 편집 중…" + Aku 표면만 밝게 육안 확인.
- **스트리밍 전체 시나리오(라이브 turn) e2e는 에이전트 서버 의존**(aku-chat 대화형 단언과 동일) —
  락 메커니즘·통합은 위로 검증.

## Bugfix — 진행상태 말풍선 배경 투명 (2026-06-06)

락 알약("아쿠가 편집 중…")과 런처 진행 캡션이 **미정의 토큰 `--surface-raised`**(+ `--shadow-md`/
`--border-subtle`/`--shadow-sm`)를 써서 배경이 투명 → 딤 위에서 텍스트가 안 보였음. 디자인시스템
플로팅 표면 토큰 **`--surface-overlay`**(불투명 다크 rgba(15,23,42,.94)) + `--text-overlay`(흰색
.96) + `--surface-overlay-border` + `--shadow-overlay` + `backdrop-blur-[var(--surface-blur)]`로
교체(Popover/Panel과 동일 패턴). `AkuInteractionLock.tsx` 알약 + `AkuLauncher.tsx` 캡션 둘 다.
검증: 강제-락 스크린샷에서 말풍선이 불투명 다크+흰 텍스트로 또렷 · tsc/biome 클린 · 아쿠 e2e 11/11.

See DR-072.
