# DR-design-024 — Aku v2 chat UX + floating mascot

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-024 |
| Date | 2026-05-30 |
| Owner | hbpark |
| Component | `@weave/design-system` → `--font-mono` token (신규) + `IconCopy` · `IconPencil` (Icon set 추가). 마스코트/말풍선 메커니즘은 **feature-local + 기존 primitive 재사용**(신규 primitive 0). |
| Work item | WI-053 (Aku v2 — chat UX·design-aware·composer) + 마스코트(둥둥+말풍선+클릭→패널) |
| Triage Decision | **Step 4 — Grew** (`--font-mono` 신규 토큰) + **Step 2 — Extend** (Icon 2 글리프). 마스코트는 **Step 1 — Reuse + feature-local**(브랜드 에셋, primitive 격상 안 함). |

## Triage Walk

| Step | Outcome |
|---|---|
| 1. Reuse | ✅ (대부분) — 마스코트 메커니즘은 기존 primitive로 전부 충당: 말풍선 팁 = `Popover`(`PopoverAnchor`/`PopoverContent`/`PopoverArrow` — 충돌 플리핑·arrow·Esc/outside dismiss·a11y) 재사용; 첫방문 = `OnboardingCoachmark` 재사용(`onDismissed`로 팁 게이트); 패널 = `Panel`/`IconButton`. 마크다운 버블·코드블록·슬래시 메뉴는 feature-local 조합. |
| 2. Extend | ✅ (icon ×2) — 메시지 액션용 `IconCopy`(복사), `IconPencil`(수정)이 Icon set에 부재. `Icon.tsx`의 동일 `SvgRoot` 패턴(24×24 stroke-only)으로 2개 추가 = Extend. (재생성=기존 `IconRefresh`, 새 대화=`IconPlus`, 되돌리기=`IconUndo` 재사용.) |
| 3. — | — |
| 4. Grew | ✅ (token) — 마크다운 코드블록/인라인 코드에 monospace가 필요. 기존 `Kbd`/`Badge`는 Tailwind 내장 fallback에 의존했고 명명된 토큰이 없었음 → `tokens.css @theme`에 `--font-mono` 1개 신설(= 새 토큰 = Grow step 4). 신규 *primitive*는 0. |
| 4b. Escape (마스코트) | ❌ — **마스코트는 의도적으로 primitive로 격상하지 않음.** 캐릭터 일러스트는 브랜드 *에셋*(앱 정체성)이지 재사용 UI 부품이 아니다. `<AkuMascot>`는 `apps/web/public/aku/*`를 가리키는 feature-local `<img>` 래퍼이고, 둥둥(`aku-bob`)은 app-local CSS 키프레임(`main.css`)이다. design-system에 마스코트를 넣으면 DS가 특정 제품 브랜드에 묶여 project-neutral 원칙을 깬다. |

## Context

WI-053은 아쿠를 (1) 마크다운 chat UX, (2) 확장 design-aware tool set, (3) composer 강화로 고도화하고,
이어 **캐릭터 마스코트**(요정처럼 둥둥 + 말풍선 팁 + 클릭→패널)로 발견성을 끌어올린다. 이 과정에서
design-system을 건드린 것은 **monospace 토큰 1개 + 아이콘 2개**뿐이다. 마스코트 자체와 둥둥/말풍선
메커니즘은 기존 primitive(`Popover`/`OnboardingCoachmark`/`Panel`) 재사용 + feature-local 조합으로
해결해 DS 표면을 키우지 않았다.

## Decision

### `--font-mono` (신규 토큰)

```css
/* tokens.css @theme — BASE typography */
--font-mono: "SF Mono", "JetBrains Mono", "Menlo", "Consolas", "Liberation Mono", monospace;
```
- `@theme` 안에 두어 Tailwind `font-mono` 유틸리티가 이 토큰으로 해석되게 함.
- 소비: `MarkdownMessage`의 `<pre>`/inline `<code>`(feature-local). `Kbd`/`Badge`는 이제 fallback이 아닌 명명 토큰을 상속.

### `IconCopy` · `IconPencil`

`Icon.tsx`의 `SvgRoot` 패턴, 24×24 stroke-only `currentColor`. barrel(`components/index.ts`) export.
메시지 액션 행(assistant=복사, user=수정)에서 사용.

### 마스코트 — feature-local (DS 격상 없음)

- `AkuMascot` (`features/aku/AkuMascot.tsx`): `variant="mark"`(런처, 얼굴 bust) / `"full"`(패널 헤더·빈
  상태·코치마크) 2-tier. `apps/web/public/aku/mascot-{mark,full}{,@2x}.png` 정적 참조. `aria-hidden` +
  `pointer-events-none` + `draggable={false}`(드래그가 native image drag로 새지 않게).
- 둥둥: `main.css`의 `@keyframes aku-bob`(transform-only) + `.aku-bob`, `prefers-reduced-motion`서 정지.
  **버튼 box는 고정**(앵커 안정), **안쪽 span만 transform** → `Popover`/`OnboardingCoachmark` 앵커가 흔들리지 않음.
- 말풍선: `AkuTipBubble`이 `Popover`를 controlled-open으로 런처에 anchor. 콘텐츠는 Radix가 `<body>`로
  portal → 둥둥 transform 조상 밖이라 `backdrop-filter` 드롭 버그([[feedback_backdrop_filter_under_transform]]) 무관.
- 현재 에셋은 **플레이스홀더**(원본 가공). aurora-glass 톤 **리스타일(리드로우)** 은 같은 파일명 드롭-인.
  스펙은 `apps/web/src/features/aku/MASCOT.md`.

## Tokens

신규 토큰 1개: `--font-mono`. 그 외 전부 기존 토큰(`--surface-2`/`--surface-overlay`/`--accent`/
`--shadow-overlay`/`--focus-ring`/`--radius-*`) 재사용.

## Accessibility

- `AkuMascot`은 장식(`aria-hidden="true"`); 의미는 감싸는 버튼/헤딩의 라벨이 전달(`aria-label="아쿠 열기"`,
  코치마크 headline, 패널 `Panel.Title`).
- 말풍선 팁: `aria-live="polite"`로 포커스를 빼앗지 않고 SR에 전달. 닫기 버튼 + "그만 보기"(영구 off).
- 둥둥은 `prefers-reduced-motion: reduce`에서 완전 정지(`.aku-bob { animation: none }`).
- 팁 컨트롤러(`useAkuTips`)는 **anti-Clippy**: 패널 닫힘 + 첫방문 코치마크 완료 시에만, enabled 세션당 1회,
  4h 쿨다운, "그만 보기"로 영구 비활성.

## Verification

- design-system은 컴포넌트 테스트 러너가 없음(기존 관례) → weave typecheck + Aku e2e로 검증.
- `pnpm verify:no-e2e`(design-system + weave) green. `aku-chat` e2e 6/6(single-worker).

## Linked

- `packages/design-system/src/tokens.css` — `--font-mono` 신규
- `packages/design-system/src/components/Icon.tsx` + `components/index.ts` — `IconCopy`/`IconPencil`
- `apps/web/src/features/aku/AkuMascot.tsx` — feature-local 마스코트 (`5cd867b`/`b291068`)
- `apps/web/src/features/aku/AkuTipBubble.tsx` · `useAkuTips.ts` — 말풍선 팁(Popover 재사용)
- `apps/web/src/features/aku/AkuLauncher.tsx` · `apps/web/src/main.css` — 런처 마스코트 + `aku-bob` 둥둥
- `apps/web/src/features/aku/MarkdownMessage.tsx` — `--font-mono` 소비처
- `apps/web/src/features/aku/MASCOT.md` — 2-tier 규격 + 리스타일 스펙
- 선행: [[DR-design-023-aku-chat]] (Aku v1 — Textarea + IconArrowUp)
