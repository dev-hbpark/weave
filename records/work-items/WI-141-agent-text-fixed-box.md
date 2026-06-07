# WI-141 — 에이전트 추가 텍스트 고정 크기 박스

Status: **Done**
Owner: hbpark
Updated: 2026-06-07
관련: [DR-096](../decisions/DR-096-agent-text-fixed-box.md), 선례 DR-091(agent transformInput 파이프라인)

## Problem

에이전트가 텍스트를 추가하면 기본이 자동 높이(`layoutChild` 미설정 → "HEIGHT")라 박스가 내용에 맞춰
늘어난다. 요청: 에이전트 텍스트는 **고정 크기 박스**를 쓰도록.

weave 텍스트 리사이즈 모드는 `attrs.layoutChild`에서 파생(`derive-text-auto-resize.ts`):
`left×top` anchor → "NONE" = Fixed. 따라서 고정 박스 = 그 anchor를 주입.

## Build

- **신규** `agent-text-resize.ts`: 순수 변환 `fixAgentTextBox(commandName, input, doc)`.
  `weave.item.add`(kind:text)에서 **자유 배치 컨테이너**(root / absolute-constraints / layout 없음)일
  때만 Fixed `layoutChild` 주입. flex·grid 부모는 스킵(레이아웃이 크기 소유). 명시적 layoutChild는 존중.
  `layoutChildFromTextAutoResize("NONE")` 재사용 → **신규 switch 없음**(Rule 6).
- **수정** `use-aku-agent.ts`: agent-only `transformInput`에 `fixAgentTextBox`를 DR-091 그라운딩
  앞단으로 합성. 툴바는 이 프록시 미경유 → 사용자 직접 편집 무영향.
- **프롬프트** `weave-command-schemas.ts`(TEXT_ATTRS_NOTE) + `weave-capabilities.ts`(text itemKind):
  고정 박스는 자동으로 안 늘어나니 frame.height 충분히, 넘치면 textOverflow:'VISIBLE'. flex/grid는 종전대로.
- **테스트** `agent-text-resize.test.ts`.

## 적용 범위 결정

사용자 선택: "텍스트 박스 고정 크기(autoresize)" — 폰트 px/ratio(DR-091/093)는 **미변경**. 박스
리사이즈 모드만 Fixed로.

## Verification

- typecheck green, biome 클린.
- 단위 `agent-text-resize.test.ts` 8/8 + 기존 agent 스위트 통과.
- `declarativecheck`: 신규 switch 없음(헬퍼 재사용) — 기존 베이스라인 3건과 무관.

## 후속

- toolbar 기본값에도 고정 박스를 노출할지(현재 에이전트 경로 한정) 추후 검토.
