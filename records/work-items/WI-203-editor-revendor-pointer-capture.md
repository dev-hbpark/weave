# WI-203 — @agocraft/editor 재vendor (pointer capture, HANDOFF-024 수용분)

- 상태: DONE (2026-06-12)
- 출처: WI-200/DR-129 잔여 ① — agocraft HANDOFF-024가 WI-040/DR-052로
  수용됨(원안 host-capture 대신 **원래 pointerdown target에 캡처**하는
  변형 — click-retarget 부작용 회피). 사용자 "agocraft HANDOFF-024
  pointer capture도 진행부탁해".
- 관련: WI-200/DR-129 (고사 클래스), agocraft WI-040/DR-052 (구현)

## 변경

1. **editor 핀 bump**: `agocraft-editor-1.0.0-rc.20260602053511.tgz` →
   `agocraft-editor-1.0.0-rc.20260612200000.tgz` (3곳:
   `pnpm-workspace.yaml` + 루트 `package.json` pnpm.overrides +
   `apps/web/package.json`). `pnpm install` 클린 `+1 -1`, active link
   확인(dist에 setPointerCapture 존재).
   - 새 tgz는 6/2 이후 editor 소스 전진분 동반: HANDOFF-022
     (changeToPatch core 이동 — 핀된 core rc.20260609193000이 이미
     export 보유, 사전 호환 확인), DR-040 Phase 0 (CRDT no-op seal),
     DR-043 (ChromeNode).
2. **DR-043 ChromeNode 적응**: `SelectionHandleSpec.render`가 opaque
   `ChromeNode`(=unknown) 반환으로 변경 → `NestedFrame.tsx`
   resolveHandles에서 소비 경계 캐스팅(`as React.ReactNode`) 1곳.
   weave의 등록 프로바이더는 전부 JSX 반환이라 안전.

## SVL (2026-06-12)

- typecheck ✓ (캐스팅 전 1건 실패 → 수정 후 clean) / gates 5종 ✓ /
  unit 1228/1228 ✓ / build ✓.
- 드래그 e2e 6스펙(frame-move-snap·reparent-modifier-drag·
  frame-manipulation·multi-drag·selection-follows-drag·rotation-snap):
  11 passed + 2 flaky(retry pass). frame-move-snap `--repeat-each=3`
  6/6 green.
- click-시맨틱 스펙(contextual-toolbar-redesign·selection·
  history-shape-drag·line-endpoint-snap-close): 8 passed / 2 skipped —
  캡처의 합성-click 영향 없음 확인.
- **근치 실증**: `SelectionToolbarOverlay`의 WI-200 inert 게이트를
  임시 `"auto"` 고정(=원래 실패 구성)으로 frame-move-snap
  `--repeat-each=2` **4/4 green** → 라우터 캡처 단독으로 고사 클래스
  근치 확인. 임시 변경 원복 확인(diff clean).
- WI-200의 `useSelectionChromeInteractive` inert 처리는 HANDOFF-024
  합의대로 UX 차원(드래그 중 툴바 오클릭 방지)으로 **유지**.

## 로그

- 2026-06-12 — agocraft WI-040/DR-052 구현 + editor pack → weave 핀
  bump + ChromeNode 캐스팅 → SVL green + 원-실패-구성 실증 → DONE.
