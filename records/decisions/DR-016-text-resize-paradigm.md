# Decision Record — DR-016 텍스트 아이템의 Resize paradigm = Figma 100% (corner-fontSize-scale 폐기)

## Metadata

| Field | Value |
|---|---|
| ID | DR-016 |
| Title | 텍스트 아이템의 resize 모델 = Figma 의 3-mode enum (`textAutoResize: WIDTH_AND_HEIGHT \| HEIGHT \| NONE`). 코너 드래그는 박스만 변경, 글자 크기 = 별도 슬라이더. 현재의 Genially-식 "코너 = fontSize 비례 스케일" 폐기. |
| Decision Level | **1 Local** — weave 내부 UX/paradigm 결정. agocraft 측 schema 영향은 별건 DR-015 (editor) + HANDOFF-010 (TextAttrs) 으로 분리. |
| Owner | hbpark |
| Required approvers | hbpark (responsible / accountable) |
| Consulted | 사용자 (Discovery owner) — AskUserQuestion 2026-05-25 에서 옵션 1 "피그마 100% 동일" 확정 |
| Informed | `design-system-agent` (PropertiesPanel 모드 토글 UI 의 design review 의무) |
| Status | **Accepted** (사용자 명시 confirm 박제) |
| Decided on | 2026-05-25 |
| Effective from | WI-029 Build 진입 시 — agocraft HANDOFF-010 응답 후 |
| Review-by | 2026-09-30 (v1 launch 후 사용성 회고에서 재평가) |
| Triggering Work Item | WI-029 |
| Pairs with | DR-015 (editor pick), HANDOFF-010 (TextAttrs v1 schema), FR-002 §1·§2 |

## Context

weave 의 텍스트 아이템은 WI-024 (Phase 18, auto-height) 에서 **단일 모드 (Auto-height) + 코너 드래그 시 fontSize 비례 스케일** 의 Genially-식 UX 로 구현되어 있다 (`apps/web/src/pages/FrameStage.tsx:1300-1367`).

```
현재 동작 (Genially-식):
  · 엣지(e/w): 폭만 변경 → wrap
  · 코너(ne/nw/se/sw): 폭 + fontSize 함께 비례 스케일
  · 세로(n/s): 비활성 (auto-height 만 가능)
```

이 paradigm 은 Figma 와 **정면 충돌**한다. Figma 는:

```
Figma:
  · 텍스트 박스 크기와 글자 크기를 분리된 두 변수로 다룬다
  · 코너 드래그 = 박스 크기만 변경, 글자 크기는 불변
  · 글자 크기 = 별도 슬라이더 또는 PropertiesPanel 의 fontSize 입력
  · resize 동작은 3 모드 enum (Auto-W / Auto-H / Fixed) 으로 명시 선택
```

사용자 결정 (2026-05-25, AskUserQuestion 옵션 1 명시 confirm): **Figma 100% paradigm 으로 재정의**. 이 DR 은 그 결정을 박제하고 폐기되는 동작 범위를 명시한다.

## Options considered

(AskUserQuestion 의 3 옵션 그대로)

| Option | 설명 | 사용자 선택 |
|---|---|---|
| **A. 피그마 100% 동일** | 3-mode enum + 코너=박스만, 글자 크기=별도 슬라이더. 현재 corner-fontSize-scale 폐기. | **✅ 선택** |
| **B. 하이브리드 (3-mode + 코너 스케일 유지)** | 3-mode enum 추가하되 Auto-height 모드에서만 코너=fontSize 스케일 유지. UX 학습곡선 완화. | ✗ |
| **C. 현재 유지 + Fixed 모드만 추가** | corner-fontSize-scale UX 유지 + overflow 정책 (Fixed + truncate) 만 신규. | ✗ |
| Do nothing | 현 단일-모드 유지 | ✗ — spec §1 결정 (사용자 confirm) 위반 |

## Decision

**Option A — Figma 100% paradigm 채택.** 즉:

1. **`textAutoResize: "WIDTH_AND_HEIGHT" | "HEIGHT" | "NONE"`** 3-mode enum 도입 (TextAttrs v1 schema, HANDOFF-010 §2.A).
2. **코너 드래그 (ne/nw/se/sw) = 박스 크기만 변경**. fontSize 변경 없음.
3. **현재 `FrameStage.tsx:1300-1367` 의 fontSize 스케일 로직 제거**.
4. **글자 크기 변경 = PropertiesPanel 의 fontSize 슬라이더만**.
5. **모드별 핸들 노출**:
   - `WIDTH_AND_HEIGHT` (Auto-W): 핸들 없음 (자동)
   - `HEIGHT` (Auto-H): e, w 만
   - `NONE` (Fixed): e, w, n, s, ne, nw, se, sw (전 8 방향)
6. **모드 전환 시 frame 재계산** (spec §4.3 의 6 전환 규칙) — async (await `document.fonts.ready`, FR-002 §3 intrinsic limit 박제).
7. **생성 시 default 모드**:
   - 더블클릭 → Auto-W
   - 드래그 → Auto-H
   - 코너로 둘 다 강제 조정 → Fixed
   - 추가 메뉴 "T 텍스트" 클릭 → Auto-H (기본 위치/크기)

## Why this option

1. **사용자 명시 결정** (AskUserQuestion 2026-05-25): "이제 다음 작업으로 텍스트 아이템을 제대로 고도화 하고싶어 피그마에서 텍스트아이템을 다루는것과 동일하게 처리하려고 해". 옵션 1 (피그마 100%) 확정 선택. 두 paradigm 의 공존 (옵션 B) 또는 점진적 수용 (옵션 C) 은 명시 거절.
2. **Product positioning 일관**: weave 의 USP 는 "Prezi 의 spatial zoom + Genially 의 interactivity + Figma 의 디자인 깊이" ([[project-weave-concept-v01-2026-05-22]]). 텍스트 = 가장 많이 쓰이는 element. Figma-친숙 사용자 (디자이너 / 마케터 / 콘텐츠 제작자) 의 기대치가 USP 의 ⅓ 을 책임지는 만큼, 코너=fontSize 스케일은 **놀라움 (surprise)** 으로 인식됨 → 학습 비용 + 신뢰도 손실.
3. **속성과 변형의 분리 = 디자인 시스템의 정통**: 박스 크기 (frame) 와 글자 크기 (fontSize) 는 의미적으로 다른 변수다. 코너 드래그가 두 변수를 동시 변경하는 것은 "shape" 의 변형 의미를 텍스트에 잘못 적용한 것 — 이는 Phase 18 의 paradigm drift ([[project-weave-phase10-2026-05-23]], [[project-weave-phase11-2026-05-23]]) 와 동일 패턴의 mistake. spec/SSOT 박제로 paradigm drift 재발 방지.
4. **Rich text 와의 일관**: DR-015 의 rich text 도입 시 글자별 fontSize 가 가능 (글자별 sparse override). 박스 코너가 어느 글자의 fontSize 를 스케일하는지 정의 불가 — Figma paradigm 만 일관 가능.
5. **모드 전환의 async 수용**: FR-002 §3 의 intrinsic limit (font 로딩 동기성 불가) 박제. 모드 전환은 사용자 트리거라 ≤ 500ms spinner 수용 가능.

### Specialist consultation status

- **사용자 (Discovery owner)** — confirm 박제 (2026-05-25 AskUserQuestion)
- `design-system-agent` — **pending**. PropertiesPanel 의 모드 토글 (3-icon segment) 디자인 review 의무. 새 primitive `SegmentToggle` 또는 기존 component 재사용 결정.

## Consequences

### Breaking changes

- **`apps/web/src/pages/FrameStage.tsx:1300-1367` 의 fontSize 스케일 로직 완전 제거**.
- **기존 e2e 2 spec 재작성**: `apps/web/e2e/text-item.spec.ts` 의 "Corner resize scales fontSize proportionally" → 삭제 또는 reverse 검증 ("Corner resize keeps fontSize unchanged"). "Edge resize doesn't scale fontSize" → 그대로 PASS, 검증 메시지만 갱신.
- **사용자 학습 곡선**: 기존 사용자는 코너 드래그로 글자가 커지는 것을 기대 → 변경 직후 어색함. 해소책: launch note + 짧은 tooltip ("코너 드래그는 박스만, 글자 크기는 사이드패널에서") 1주일 노출.

### 즉시 변화

- **Code / architecture**:
  - 신규 enum `textAutoResize` (HANDOFF-010 의 agocraft TextAttrs 의존).
  - 모드별 SelectionLayer 핸들 노출 = registry + adapter (Rule 6). `apps/web/src/document/registries/text-resize-adapter.ts` 신규 (또는 동등 위치).
  - 모드 전환 commands (`weave.text.setAutoResize`) + atomic transaction (frame 재계산 + textAutoResize 동시 변경, ChangeStream 한 transaction).
  - PropertiesPanel 의 텍스트 섹션 상단에 3-icon SegmentToggle 추가.
- **Process / workflow**:
  - design review (`design-system-agent` sign-off) 가 SegmentToggle / fontSize 슬라이더 widget 결정에 의무.
  - e2e 2 spec rewrite + 신규 spec (모드 전환 4 시나리오 + 코너=박스만 검증 1 + truncate 1).
- **Cost / ops**: 없음. 순수 UX/code 변경.
- **User experience**:
  - 일시적 학습 비용 (코너 드래그 동작 변경)
  - 장기적 일관 (rich text + 모드 + 글자 크기 변수 분리 = Figma-친숙)
  - 새 능력: Overflow truncate (`textTruncation: ENDING + maxLines`), vertical alignment, Fixed 모드의 8-방향 resize
- **Risk posture (accepted residual risk)**:
  - 코너 드래그 변경에 대한 사용자 불만 — launch note + tooltip 으로 1주 완화 기간
  - 다른 4 도메인 (image / video / shape) 의 코너 드래그는 그대로 비례 스케일 — paradigm 일관성 의문 가능. 답: 미디어/도형은 본질적으로 "한 변수 변형" (콘텐츠가 박스 = scale), 텍스트는 "두 변수" (박스 ≠ 글자). 본 차이를 짧은 PropertiesPanel hint 로 명시.

### 마이그레이션

- 기존 v6 텍스트 아이템: HANDOFF-010 §E 의 v6→v7 자동 마이그레이션에서 `textAutoResize: "HEIGHT"` (현재 동작과 동일 mode) default 부여. 사용자 데이터 무손실.
- 현재 fontSize 가 코너 드래그 누적으로 결정된 값이라면, 그 값 그대로 보존 (모드만 명시화).

## Conditions / follow-ups

- [ ] **`design-system-agent` sign-off**: PropertiesPanel 의 SegmentToggle (모드 토글) 디자인 review. 새 primitive 필요 시 `DR-design-<NNN>` 발행. PR-block.
- [ ] **e2e 재작성 + 신규**: `text-item.spec.ts` 2 spec rewrite + 신규 8 spec (spec §7 참조).
- [ ] **Launch note + tooltip**: 1주 노출 후 회수. weave `apps/web/src/launch-notes/` (없으면 신규) 또는 PropertiesPanel hint.
- [ ] **Status update**: WI-029 Build 진입 시 본 DR 의 Status 가 implicitly `In Effect`. v1 launch 직후 사용성 회고 (review-by 2026-09-30) 에서 사용자 반응 박제.

## Dissent

없음. 사용자 명시 confirm 박제.

## Links

- Triggering Work Item: WI-029
- Originating Handoff (cross-project): agocraft HANDOFF-010 (TextAttrs `textAutoResize` 의존)
- Related Risk reviews: RISK-text-item-v1 (planned — 코너 동작 변경의 사용자 불만 risk 포함)
- Related Feasibility Reviews: FR-002 §1 (outcome restated), §2 (3-mode capability), §3 (font 로딩 동기성 intrinsic limit)
- Product spec: `docs/product/TEXT_ITEM_SPEC.md` §1 (이 DR 의 source)
- Related DRs:
  - DR-014 (ContextualToolbar) — PropertiesPanel 의 모드 토글이 그 위에 mount
  - DR-015 (rich text editor pick) — 본 DR 과 같은 WI 의 sibling decision
- Memory: [[project-weave-text-item-v1-decision-2026-05-25]] (사용자 confirm 박제)
- Superseded DRs: WI-024 의 Phase 18 corner-fontSize-scale 결정 (별도 DR 미발행, 본 DR 이 그 결정의 폐기를 박제)
