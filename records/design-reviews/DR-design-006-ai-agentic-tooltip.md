# Design Review — DR-design-006

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-006 |
| Title | AI Agentic Tooltip — context info + action list + shortcut keycap badge, with smart debouncing and shared-element morphing |
| Triggering Work Item | WI-015 |
| Triage outcome | **Grew (new primitive)** — Step 3 of design-system-triage decision tree |
| Status | Agent-Reviewed (pending human) — `design-system-agent` ✅ 2026-05-23 |
| Owner (proposer) | hbpark |
| Reviewer(s) | `design-system-agent` (auto via triage), `frontend-design-pattern-agent` (a11y / floating UI), hbpark |
| Date | 2026-05-23 |
| Target SLA | 2026-05-25 (2 business days for sign-off; WI-015 Phase B 시작 전) |

## 1. Change in one sentence

`@weave/design-system` 에 **`AITooltip` + `AITooltipProvider`** primitive 추가 — 마우스 hover 대상의 **컨텍스트 한 줄 설명**, **수행 가능한 액션 목록**, **각 액션의 단축키 키캡 배지**를 셋으로 묶은 지능형 hint floating box. 영역 3 종은 독립 On/Off, 175 ms / 100 ms 디바운싱, 인접 target 으로 이동 시 shared-element morphing 으로 위치·크기가 보간되며 형태 모핑.

## 2. Why

- **User problem this solves**: 빈번한 hover 인터랙션이 발생하는 도구형 UI 에서, 단순 "한 줄 hint" 만으로는 사용자가 (a) 지금 어떤 요소인지 (context), (b) 무엇을 할 수 있는지 (action), (c) 빠르게 하는 법 (shortcut) 의 3 층 정보를 한 번에 받을 수 없음. 매 hover 마다 깜빡이며 떴다 사라지는 분절감, 빠른 마우스 이동 중에도 등장하는 시각 소음이 사용 피로를 만듬.
- **Why an existing primitive does not cover it** (evidence — candidates considered):
  - **`Card`** — entrance 시 anchor / floating positioning / auto-dismiss 가 없음. composition layer 일 뿐 hover-driven UX 가 아님.
  - **`Reveal`** — IntersectionObserver 기반 entrance 1회용. 마우스 hover 발화 + auto-hide 가 없음.
  - **`DropdownMenu` / `ContextMenu` / `Dialog`** — 모두 click / right-click / explicit trigger 발화. hover-only floating hint 와 trigger semantics 가 다르고, focus trap / dismiss 시맨틱도 부적합 (modal-ish).
  - **`@radix-ui/react-tooltip` wrapping** — 가능은 하지만 (a) Radix tooltip 은 content slot 1개 (구조화된 context + actions + shortcut row 의 합성 layout 표현 한계), (b) 인스턴스 간 shared-element morph 가 자체 지원 안됨 (각 trigger 별 인스턴스 분리), (c) provider 가 dataset 자동 스캔 모드를 갖춰야 하는 본 WI 의 API 요구와 맞지 않음. wrapping 의 코드량 vs 합성형 primitive 의 코드량 차이는 작고 (둘 다 ~300 lines 추정), **합성 layout + morph + dataset 의 셋이 한 곳에 박혀야 의도가 명확**.
- **Why now**: M0 design-system 의 "다음 (M0 안)" backlog 에 "Tooltip" 박제 명시 (features/design-system/README.md). 단순 generic tooltip 이 아니라 agentic hint 형태로 격상하면 onboarding · power-user · 가이드 의 3 use case 를 1 컴포넌트로 흡수 — M1+ 의 hover-driven UX 가 본격화하기 전에 박제할 의무.

## 3. Visual evidence

Pre-visual — 사용 의도를 dataset API 의 예로 fix:

```html
<!-- 예 1: 셋 다 표시 -->
<div class="list-item"
     data-ai-tooltip="true"
     data-tooltip-show-context="true"
     data-tooltip-show-actions="true"
     data-tooltip-show-shortcuts="true"
     data-tooltip-context="계약서 문서"
     data-tooltip-actions='[
       {"action":"클릭하여 바로 가기","shortcut":"Enter"},
       {"action":"드래그하여 순서 정렬","shortcut":"⌥ + Drag"}
     ]'>
</div>

<!-- 예 2: context 만 -->
<div class="info-icon"
     data-ai-tooltip="true"
     data-tooltip-show-context="true"
     data-tooltip-show-actions="false"
     data-tooltip-context="작성자 정보 수정 가능 구역">
</div>

<!-- 예 3: action 만 (shortcut 배지 off) -->
<div class="button-item"
     data-ai-tooltip="true"
     data-tooltip-show-context="false"
     data-tooltip-show-actions="true"
     data-tooltip-show-shortcuts="false"
     data-tooltip-actions='[{"action":"다음 단계로 가기"}]'>
</div>
```

Layout vertical stack (활성 영역만):

```
┌───────────────────────────────┐
│ Context                        │  ← (Optional) eyebrow + 한 줄 설명
│ 계약서 문서                       │
├───────────────────────────────┤
│ ▸ 클릭하여 바로 가기      ⎘ Enter   │  ← Action + Shortcut keycap (둘 다 Optional)
│ ▸ 드래그하여 순서 정렬    ⌥ + Drag │
└───────────────────────────────┘
```

비활성 영역은 layout 에서 완전히 사라짐 (예: actions 만 ON 이면 context divider 도 사라짐).

## 4. Scope of the change

- [ ] New token (color / spacing / radius / shadow / motion / typography step) — **없음** (기존 토큰만 사용)
- [ ] Modified existing token — **없음**
- [x] New component primitive — **`AITooltip` + `AITooltipProvider`** (`packages/design-system/src/components/AITooltip.tsx`)
- [ ] New variant on an existing component — **없음**
- [ ] New theme variant — **없음**
- [ ] Public-facing surface affected — **현재 단계 없음** (editor / present 만). 다만 marketing landing 의 ROI 가이드 등에서 향후 사용될 가능성 있음 — public 진출 시 별 PR 의 visual 점검 필요.

### 4-1. API shape

**Primary (React props)**:

```tsx
import { AITooltipProvider, AITooltip, useAITooltipTarget } from "@weave/design-system";

// 최상위 (app root) 1회
<AITooltipProvider showDelayMs={175} hideDelayMs={100}>
  ...
</AITooltipProvider>

// (a) Hook 방식 — 임의 element 에 binding
function MyButton() {
  const tooltipBind = useAITooltipTarget({
    context: "계약서 문서",
    actions: [
      { action: "클릭하여 바로 가기", shortcut: "Enter" },
      { action: "드래그하여 순서 정렬", shortcut: "⌥ + Drag" },
    ],
    showContext: true,
    showActions: true,
    showShortcuts: true,
  });
  return <button {...tooltipBind}>...</button>;
}

// (b) Wrapper 방식 — 자식 1개에 binding (clones child element)
<AITooltip
  context="계약서 문서"
  actions={[{ action: "클릭하여 바로 가기", shortcut: "Enter" }]}
>
  <MyButton />
</AITooltip>
```

**Secondary (HTML dataset auto-discover)**:

```tsx
// scan="dataset" 옵션 활성화 시 document 의 [data-ai-tooltip="true"] 자동 감지
<AITooltipProvider scan="dataset">
  ...
</AITooltipProvider>
```

`data-tooltip-show-context` 등 부울 dataset 의 default 는:
- `data-tooltip-context` 가 present → `show-context` default true.
- `data-tooltip-actions` 가 present → `show-actions` default true.
- `data-tooltip-actions` 의 item 에 `shortcut` 가 1개 이상 → `show-shortcuts` default true.

명시적 `data-tooltip-show-*="false"` 가 우선 (override).

### 4-2. Tokens used

| Slot | Token | Purpose |
|---|---|---|
| 배경 (전체 surface) | `--surface-1` + `backdrop-filter: blur(var(--surface-blur))` | Aurora glass 표면 |
| Border | `--surface-1-border` | 1 px subtle |
| Border-radius | `--radius-md` | 12 px corner |
| Shadow | `--shadow-glass` | Elevated floating |
| Text (context eyebrow) | `--text-soft` + `text-[11px] uppercase tracking-[0.18em]` | 이미 EditableText / DropdownMenuLabel 에서 통용 |
| Text (context body) | `--text-strong` + `text-[13px]` | 한 줄 설명 |
| Text (action row label) | `--text-default` + `text-[13px]` | 액션 라벨 |
| Action bullet 강조 색 | `--accent` | 좌측 ▸ marker |
| Keycap 배경 | `--surface-2` | 살짝 raised |
| Keycap border | `--border-strong` | 키캡 ridge |
| Keycap border-radius | `--radius-sm` | 8 px |
| Keycap text | `--text-default` + `text-[11px] font-mono tracking-[0.04em]` | 단축키 라벨 |
| Divider (영역 사이) | `--surface-1-border` 1 px hr | context ↔ actions 사이 |
| Focus-visible | `--focus-ring` | provider 가 tooltip-itself 에 focus 가능하게 할 때 |
| Motion (entrance) | `var(--motion-quick)` + `cubic-bezier(0.22, 1, 0.36, 1)` (== `--motion-spring-soft`) | fade + 4px slide-up |
| Motion (morph) | `var(--motion-normal)` + `var(--motion-spring-soft)` | width/height/top/left 보간 |

**New tokens 추가 0**. 모두 기존 semantic / motion 토큰만 사용.

## 5. Consistency check

- [x] All new color/text combinations meet WCAG AA contrast — 모든 색은 기존 semantic 토큰 (`--text-strong/default/soft` × `--surface-1/2`) 의 조합. DR-design-005 에서 이미 contrast 통과 검증. 새 (bg, text) 조합 추가 없음.
- [x] Motion respects `prefers-reduced-motion: reduce` — Stage 박제와 같은 paradigm: motion lib `useReducedMotion()` 으로 morph + entrance OFF, fade-only fallback. 디바운싱 타이밍은 유지 (지연만 있고 motion 은 없음).
- [x] Focus-visible ring uses `--focus-ring` — provider 가 tooltip element 자체에 `tabIndex={-1}` 부여 + Esc / blur 시 dismiss; 단, 일반 hover 시에는 focus 이동 안 함 (모달 아니므로).
- [x] Keyboard navigation works — Tab 으로 target 진입 시 tooltip 도 show (focus path). Esc 로 dismiss. focus 이탈 시 hide.
- [x] Component reads tokens, not hard-coded values — `cn()` + `text-[color:var(--token)]` 패턴만, hex / rgb literal 0.
- [x] Variant ceiling — 본 primitive 의 variant 는 아직 없음 (placement = top/bottom/left/right 4 종 + auto = 5 종 placement-옵션은 variant 가 아니라 floating position prop. 시각 variant 0). 5 변종 ceiling 의 헤드룸 충분.
- [x] If this is a theme variant — N/A.
- [x] If this is a token — N/A.

## 6. Brand alignment

(public-facing 은 deferred 이므로 약식)

Aurora glass 표면 + soft motion 의 기존 톤을 그대로 따름. 단축키 키캡의 raised 표면 (`--surface-2`) + 강한 border (`--border-strong`) 은 "물리적 키 느낌" 을 살리되 Aurora 의 translucent 톤을 깨지 않도록 inner-glow 없는 flat raised. Mono / Vivid theme 에서도 키캡이 충분히 인식되도록 contrast 점검 의무 (Acceptance 박제).

## 7. Agent sign-offs

| Agent | Verdict | Notes |
|---|---|---|
| `design-system-agent` | ✅ | **Accept.** Hard rules 1–6 모두 통과: `packages/design-system/src/components/AITooltip.tsx` 거주, 하드코딩 0 (hex / rgb / magic ms grep clean), `useReducedMotion()` (line 308) 가 entrance opacity/y (373–375) + `transition.layout.duration` (377–381) 둘 다 단락, variant / theme 추가 0, 인라인 `style={{}}` 는 dynamic top/left/width/height/visibility 만. 토큰 12종 모두 resolve: `--radius-sm/-md` 는 base scale (tokens.css:53–58, 테마-독립), 나머지 10 종은 Aurora / Mono / Vivid 3 블록 모두 정의. Public surface 깨끗 — `index.ts` 가 AITooltip / AITooltipProvider / useAITooltipTarget + 타입만 노출, `readTooltipDataset` 는 의도적으로 제외 (test-internal). A11y 박혀 있음: role="tooltip" + 안정 id + aria-describedby + Esc + onFocus. 🌱 Grew (Step 3) 의 판단 근거 (Radix tooltip 의 단일 content slot 한계 + shared-element morph 부재 + dataset auto-discover 부재) 가 §2 에 충분히 박제. Wrapper 가 Radix `Slot` 이라는 child-ref-forwarding 요건은 README/Storybook 후속에서 호스트 가이드 박제 권장 — blocker 아님. |
| `frontend-design-pattern-agent` | (pending) | ARIA tooltip pattern, debounce semantics, shared-element FLIP/layout 의 접근성 / 인터랙션 review |
| `frontend-architecture-agent` | (pending) | provider 가 한 app 에 단 1 인스턴스라는 invariant 박제 점검 |
| `seo-ai-visibility-agent` | N/A | 현재 public surface 미적용 |
| `library-adoption-supply-chain-governance-agent` | (pending) | 신규 의존성 0 (기존 `motion` lib 만 재사용) — 통과 예상 |

## 8. Human sign-off (design team)

| Name | Role | Date | Notes |
|---|---|---|---|
| hbpark | Owner | 2026-05-23 | Proposed. Phase B (코드 박제) 진입 전 본인 sign-off + design-system-agent / frontend-design-pattern-agent 통과 의무. |

## 9. Trade-offs accepted

- **Single global instance** — provider 당 동시에 보이는 tooltip 1개. 이로써 shared-element morph 가 가능해지지만, 두 개의 다른 가이드를 나란히 보여주는 use case (예: 두 버튼의 hint 동시 비교) 는 불가능. 의도 — 시각 소음 최소화 우선.
- **Hover-only (no touch)** — `(hover: none)` 시 자동 비활성화. touch device 의 long-press fallback 은 별 WI 로 분리. 의도 — primary surface 가 desktop editor / present.
- **자체 ARIA 박제** vs Radix wrapping — Radix tooltip 의 합성 layout / morph 제약 회피를 위해 ARIA pattern 을 자체 구현. 의무 — `apps/web/e2e/ai-tooltip.spec.ts` 에 키보드 / a11y 시나리오 박제로 회귀 방어.
- **Keycap 시각** — 별 `Kbd` primitive 박제 없이 AITooltip 안의 내부 sub-element 로 시작. 만약 ContextMenu / DropdownMenu 의 shortcut row 도 키캡 스타일로 통일하려는 시점이 오면 별 WI 에서 `Kbd` 로 추출.
- **Smart debouncing 의 상수** — 175 ms / 100 ms 는 prop 으로 override 가능하지만 default 박제. 사용자가 추가로 한 화면 한 테스트로 조정 가능.

## 10. Open questions

- Action label 내부의 **단축키 inline 표기** (예: `⌥ + Drag` 문자열) 와 **단축키 키캡 (오른쪽 배지)** 의 관계 — 같은 정보 중복? 현재 spec 은 별도 필드 (`shortcut` 의 별 슬롯). `action` label 안에 ⌥ + Drag 가 들어간 경우 키캡 배지를 자동 hide 하는 휴리스틱이 필요한가? → **결정: 자동 hide 안 함. 라벨에 단축키를 또 적는 호출 측의 책임으로 분리.**
- Multi-monitor / viewport edge 의 자동 flip — Phase B 의 floating-ui (optional) 도입 검토. 외부 dep 추가 가치 vs 자체 박제 한 번 — `library-adoption-supply-chain-governance-agent` 가 평가.
- Provider 가 portal 을 어떤 mount node 에 부착할지 — `document.body` default 가 안전. Dialog 안 hover 시 z-index 충돌 가능 — Phase E 에서 stacking-context audit.

## 11. Cross-references

- Work Item: `records/work-items/WI-015-ai-agentic-tooltip.md`
- Prior primitive bundle: DR-design-005 (editor chrome 7 primitives) — API shape / Radix wrap 의 reference
- Code structure 규칙: feedback memory [feedback-tree-shaking-first](../../../../.claude/projects/...) — named const export, ESM + `sideEffects: false`
- Design System Triage SKILL: OS-root `.claude/skills/design-system-triage/SKILL.md`
- Template: OS-root `docs/06-templates/DESIGN_REVIEW.md`
