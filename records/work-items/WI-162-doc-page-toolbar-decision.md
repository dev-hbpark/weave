# WI-162 — doc-page 전용 툴바 분리 여부 (WI-153 최종 잔여 슬라이스)

Status: **Done**
Owner: hbpark
Updated: 2026-06-10

관련: [WI-153](WI-153-presentation-page-bounded-editing.md)(마지막 후속 슬라이스) ·
[DR-111](../decisions/DR-111-format-editor-config-and-page-bounds.md)(FORMAT_EDITOR_CONFIG 시임) ·
플랜 `features/presentation-page-editing/ENGINEERING_PLAN.md`

## Question

WI-153이 slide-deck과 doc-page를 같은 page-bounded 편집으로 묶었다. doc-page(Block document,
텍스트 우선)는 **전용 툴바**가 필요한가, 아니면 기존 DesignHeader를 공유하는가?

## 탐색 결과 (2026-06-10)

1. **doc-page는 살아있는 flavor다.** 생성 마법사에서 선택 가능(`DOC_FLAVORS`, "Block document" /
   "Text-first frames" 타일), frame 1개를 FULL_FRAME으로 시드, WI-153 이후 page-bounded 편집.
   `storage.ts:797`의 "kept until Phase 10b removes the doc-page surface" deprecation 주석은
   **이미 제거된 legacy `DemoDocPage` 컴포넌트**(v4 storage 경로 소비자) 이야기 — flavor
   deprecation이 아님 (`DemoDocPage`는 코드베이스에 주석으로만 잔존).
2. **툴바의 flavor 분기는 이미 단 하나** — `DesignHeader`의 `infiniteCanvas` boolean이
   Select/Hand/Peek + grid-snap을 게이트하고, doc-page는 slide-deck과 같은 page-bounded 쪽을
   이미 공유한다. Add 메뉴의 나머지(미디어/텍스트/도형/선/QR/차트), undo/redo, 파일 메뉴,
   저장, Present는 전부 포맷 중립.
3. **유일한 실제 어긋남은 용어다.** Add 메뉴의 "슬라이드" 섹션 라벨 + "슬라이드…" 항목
   (`DesignHeader.tsx:284,290`)과 그 항목이 여는 `SlidePresetPicker` 헤드라인("슬라이드",
   `SlidePresetPicker.tsx:71`)이 doc-page에서도 그대로 노출된다. 문서 포맷에서 페이지를
   "슬라이드"라 부르는 것은 잘못. 기능 자체(프리셋 레이아웃으로 새 최상위 페이지 삽입)는
   doc-page에서도 유효하다.
4. **선택 툴바(ContextualToolbar)는 kind-게이트 레지스트리** — flavor와 무관, 분리 불요.
5. 썸네일 레일의 페이지 액션은 이미 "페이지 추가"/"페이지 복제"로 포맷 중립. (레일 헤더
   "Slides" 영문 표기는 별개의 일관성 이슈로 본 슬라이스 범위 밖 — 아래 비고.)
6. doc-page 전용 기능 요구의 레코드 증거(work-items/decisions/handoffs) **0건**.

## 결정 — 툴바 분리 안 함 + per-flavor 페이지 명사(용어 게이트)만 추가

**전용 툴바 분리는 기각.** 근거:

- 기능 분기가 0이다 — 분리하면 577줄 `DesignHeader`의 복제이거나, 문자열 하나만 다른 레지스트리
  변형이 된다. 둘 다 WI-153 내내 지켜온 **no-dead-config 원칙**(기존 필드와 항상 일치해야 하는
  설정 금지) 위반이며 유지보수 부채만 남긴다.
- 어긋남의 실체는 표시 **용어**이므로 해법도 표시 메타데이터 계층이다.

**최소 범위 (구현함)**: `DocFlavorMeta`에 `pageNoun`(페이지 단위의 사용자-노출 명사) 추가 —
mixed/slide-deck/canvas-board = "슬라이드", doc-page = "페이지".

- **배치 = `FLAVOR_REGISTRY`** (`types.ts`), `FORMAT_EDITOR_CONFIG`가 아님: 캔버스 동작이 아니라
  표시 메타데이터고, label/tagline이 이미 사는 곳(Information Expert / 응집). slide-deck과
  doc-page는 canvas 설정이 동일하므로 기존 필드에서 파생 불가 = 죽은 설정 아님 — flavor 간
  차이를 처음으로 실제 표현하는 필드.
- 소비처: `DesignHeader` Add 메뉴 섹션 라벨 + "…" 항목, `SlidePresetPicker` 헤드라인
  (항목이 직접 여는 다이얼로그라 함께 바꾸지 않으면 클릭 직후 모순 노출). 뷰는 prop으로 명사를
  받는다(뷰/로직 분리 — 뷰에서 레지스트리 조회 안 함).

## 비고 (범위 밖, 기록만)

- 레일 헤더 "Slides"(영문)와 슬라이드 토글 aria-label은 별도 일관성 이슈 — 페이지 액션 라벨은
  이미 중립이라 D5/제품 결함이 아님. 필요 시 같은 `pageNoun` 시임으로 후속.
- Present 버튼은 doc-page에서도 유효(페이지 단위 전체화면 보기) — 유지.
- doc-page 전용 기능(블록 에디팅 강화 등) 요구가 레코드로 쌓이면 그때 분리 재평가 — 그 전까지
  본 결정이 유효.

## 구현 (5파일, 전부 표시 계층)

- `types.ts` — `DocFlavorMeta.pageNoun` + 4 flavor 값(doc-page만 "페이지").
- `DesignPage.tsx` — `FLAVOR_REGISTRY[currentFlavor].pageNoun` 1회 산출, 두 소비처에 prop.
- `DesignHeader.tsx` — Add 메뉴 섹션 라벨 + 항목이 `{pageNoun}` / `{pageNoun}…`.
- `DesignDialogs.tsx` → `SlidePresetPicker.tsx` — 헤드라인이 pageNoun (en 로케일은 중립
  "Choose a layout"으로). 테스트 id(`add-slide`, `slide-preset-picker`)는 불변 — 내부 식별자는
  용어 게이트 범위 밖.

## 검증 (전부 green, 2026-06-10)

- 라이브 브라우저(Continuous Self-Verification = 영구 e2e로 수행): `format-page-noun.spec.ts`
  **2/2** — doc-page에서 Add 메뉴 "페이지…" + 클릭 시 열리는 픽커 헤드라인 "페이지" 일치,
  slide-deck에서 "슬라이드…" 유지.
- 유닛 전체 스위트 **969/969** (pageNoun 누락은 `Record<DocFlavor, DocFlavorMeta>` 타입이
  컴파일 타임에 강제 — 별도 문자열 스냅샷 유닛은 변경 감지 노이즈라 추가하지 않음).
- tsc clean, biome clean, tokencheck/declarativecheck/puritycheck/inheritancecheck OK.
