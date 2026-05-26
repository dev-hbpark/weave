# Frame-only paradigm — Product spec v0.1

**Status**: Discovery (WI-032)
**Owner**: hbpark
**Created**: 2026-05-25

## 1. Problem

weave 의 현재 모델은 4 개의 도메인 특수 kind (slide / canvas-design / block-doc / media) 가 자체 visual rendering + 컨테이너 역할을 겸한다. 결과:

- 도메인마다 다른 편집 규칙 (slide 는 EditableText 의 title + bullet 인라인 편집, canvas-design 은 자체 shape 배열, block-doc 은 paragraphs, media 는 caption + tone). 일관성 부족.
- preset / 직접 배치 시 도메인의 자체 컨텐츠가 child primitive 와 시각 충돌. WI-030 Phase 1 의 placeholder 문제가 그 증거.
- 사용자 mental model ("도큐먼트 = 캔버스, primitive 자유 배치") 과 어긋남.

**해결**: `frame` 이라는 단일 kind 로 통합. 자체 visual content 0, 컨테이너 역할만. 모든 visual 은 primitive (image/video/shape/text) child 가 담당.

## 2. New `frame` kind

### 2.1 Schema

```ts
export interface FrameAttrs {
  /** Universal — parent-relative 0..1 ratio. */
  readonly frame: ItemFrame;
  /** Optional background paint. Single solid color | gradient | image fill.
   *  Defaults to transparent (no background — parent shows through). */
  readonly background?: PaintSpec;
  /** Optional border-radius (0..1 ratio of min(w,h)). Default 0. */
  readonly cornerRadius?: number;
  /** Optional human-friendly label for ThumbnailPanel / Outline.
   *  Not rendered inside the frame. */
  readonly label?: string;
}
```

**의도적 부재**:
- `title` / `bullets` / `summary` / `caption` 등 — 모두 primitive child 가 담당.
- `shapes[]` — 일반 shape primitive child 가 담당.
- `paragraphs[]` — 일반 text primitive child 가 담당.

### 2.2 Rendering

`FrameBlock.tsx` (신규, 단일 컴포넌트):

```tsx
export function FrameBlock({ item }: { item: AgoItem<"frame"> }) {
  const { background, cornerRadius } = item.attrs;
  return (
    <div
      data-testid="frame-block"
      className="absolute inset-0"
      style={{
        background: background ? paintToCss(background) : undefined,
        borderRadius: cornerRadius
          ? `${cornerRadius * 50}%`
          : undefined,
      }}
    />
  );
}
```

자체 텍스트, 인라인 편집, hover affordance 0. **FrameSurface (agocraft) 의 children 재귀 렌더가 frame 안의 모든 visual 을 책임.**

### 2.3 Children

`frame` 의 children = ReadonlyArray<AgoItem<DomainKind>> where DomainKind = `frame | image | video | shape | text`.

- nested frame 가능 (frame-in-frame). Phase 11 의 Figma frame paradigm 그대로.
- primitive 5 종은 자유 배치, 자유 편집 (위치/리사이즈/회전/속성 변경/추가/제거).

## 3. Migration: 4 도메인 → frame

기존 디자인의 4 도메인 데이터를 자동 변환. **Visual semantic 보존이 목표**.

### 3.1 `slide` → `frame`

```
Before                                  After
slide                                   frame
  attrs:                                  attrs:
    frame: {x,y,w,h,r}                      frame: same
    title: "Hello"                          background?: undefined
    bullets: ["a", "b"]                     cornerRadius?: undefined
                                          children:
                                            - text { text: "Hello", fontSize: 32,
                                                     fontWeight: "bold",
                                                     frame: {x:0.06, y:0.10, w:0.88, h:0.18} }
                                            - text { text: "• a", fontSize: 18,
                                                     frame: {x:0.06, y:0.32, w:0.88, h:0.10} }
                                            - text { text: "• b", fontSize: 18,
                                                     frame: {x:0.06, y:0.45, w:0.88, h:0.10} }
```

- Title 은 약간 크고 bold, 슬라이드 상단에.
- Bullets 는 각 줄에 prefix `"• "` 붙여서 일반 text 로. (lineTypes 가 v2 인 만큼 v1 은 prefix-as-text 로 충분.)
- 기존 visual ("큰 헤더 + 글머리 점 + 텍스트") 와 거의 동일.

### 3.2 `canvas-design` → `frame`

```
Before                                  After
canvas-design                           frame
  attrs:                                  attrs:
    frame: same                             frame: same
    summary: "..."                          background?: undefined
    shapes:                               children:
      - {id, x, y, w, h, rotation, hue}     - shape (rectangle)  per old shape
                                              { frame: {x, y, w, h, rotation}
                                                fill: paintSolid(hue)
                                                shape: "rectangle"
                                                ... defaults
                                              }
                                            - text { text: summary, fontSize: 16,
                                                     color: var(--text-soft),
                                                     frame: {x:0.05, y:0.9, w:0.9, h:0.08} }
                                            (if summary 비어있으면 text 0)
```

- 기존 canvas 의 shape 배열의 각 항목을 일반 shape primitive 로.
- summary 가 있으면 하단에 작은 text.

### 3.3 `block-doc` → `frame`

```
Before                                  After
block-doc                               frame
  attrs:                                  attrs:
    frame: same                             frame: same
    heading: "H"                            background?: undefined
    paragraphs: ["p1", "p2"]              children:
                                            - text { text: "H", fontSize: 28, fontWeight: bold,
                                                     frame: {x:0.06, y:0.06, w:0.88, h:0.12} }
                                            - text { text: "p1\np2", fontSize: 16,
                                                     frame: {x:0.06, y:0.22, w:0.88, h:0.72} }
```

- Heading 위쪽 + paragraphs joined by "\n" 아래.

### 3.4 `media` → `frame`

```
Before                                  After
media                                   frame
  attrs:                                  attrs:
    frame: same                             frame: same
    caption: "..."                          background?: undefined
    tone: "image" | "video"               children:
                                            - image | video (tone) — empty src placeholder
                                              { frame: {x:0.05, y:0.05, w:0.9, h:0.85}, src: "", ... }
                                            - text { text: caption, fontSize: 14, color: soft,
                                                     frame: {x:0.05, y:0.92, w:0.9, h:0.06} }
                                            (if caption empty, text 0)
```

- 기존 media frame 의 두 역할 — 이미지/비디오 placeholder + caption — 을 두 primitive 로 분리.

### 3.5 Migration helper signature

```ts
// apps/web/src/document/migrate-frame-only.ts
export function migrateLegacyKindsToFrame(
  doc: AgocraftDocument,
): AgocraftDocument {
  // Returns a new doc with every Item recursively transformed.
  // schemaVersion bumped v9 → v10.
}
```

호출처:
- `storage.ts` 의 `loadDesign(id)` — 디스크/KV 에서 읽은 직후, 도메인 변환 + schema bump.
- `applyChangeToDocument` 시 sync 받은 Y.Doc snapshot 에도 같은 변환 적용.

## 4. Preset adaptation (WI-030)

WI-030 의 cover.{bold/hero/asymmetric} 3 preset 의 변경:
- `buildSlideRoot(...)` → `buildFrameRoot(...)`. root kind = `"frame"` 대신 `"slide"`.
- attrs 에 `title: ""`, `bullets: []` 제거. 빈 attrs (frame + 옵션).
- Children 의 좌표 / fontSize 는 그대로 (Phase 1 fix 가 이미 적용된 상태).
- 시각 결과 동일.

명령 이름: `weave.preset.insertSlide` → `weave.preset.insertFrame` (또는 `insertPresetFrame`). 의도가 명확.

## 5. Flavor 단순화

기존 4 flavor 의 의미:
- `mixed` — 자유 캔버스.
- `slide-deck` — 슬라이드 연속.
- `canvas-board` — 캔버스 연속.
- `doc-page` — 블록 문서.

frame-only 에서:
- v1: `"mixed"` (=자유 캔버스) 단 하나로 단순화. 다른 3 개는 결국 frame 의 배치 + presentation order 결정의 차이일 뿐.
- v2: "data-driven flavor" — 첫 frame 의 preset 카테고리 + presentation order 패턴으로 추론. Discovery v2.

`DOC_FLAVORS` → `["mixed"]`. `FLAVOR_REGISTRY` → 1 entry. New-design wizard 의 flavor 타일 → 단일 default 또는 선택 단계 제거.

## 6. Migration timeline

v1 launch (T-0 2026-06-08) 까지 약 2 주.

| Day | Phase | Work |
|---|---|---|
| D1-D2 | Phase 1 | `frame` kind 정의 + `FrameBlock` + ItemAttrsByKind 갱신. seed.ts 의 `createDefaultItem` 에 frame 추가. 4 domain renderer 는 그대로 (이중 운영 시작). |
| D3-D4 | Phase 2 | `migrateLegacyKindsToFrame` + storage.ts 의 자동 변환 + 단위 테스트. Y.Doc 동일 처리. |
| D5-D6 | Phase 3 | 4 *Block.tsx 코드 제거 + DOMAIN_RENDERERS 의 frame entry 만. `isDomainItem` 정리. `weave.shape.update`/`remove` 명령 제거. |
| D7-D8 | Phase 4 | WI-030 preset → frame kind 적용. cover 3 preset visual 검증. |
| D9-D10 | Phase 5 | Flavor 1 으로 축소, new-design wizard 갱신. ThumbnailPanel / present 모드 의 kind 의존성 정리. |
| D11-D12 | Phase 6 | 모든 e2e 갱신 + 새 `frame-only-migration.spec.ts`. Visual regression. |
| D13-D14 | Phase 7 | LG-001 launch gate 재평가. Conditional 항목 close. |

병렬화 가능: Phase 4 (preset) + Phase 5 (flavor) 는 Phase 3 종료 후 동시 진행.

## 7. Risks (요약 — 자세한 사항은 RISK-004)

| Risk | Severity | Note |
|---|---|---|
| 데이터 손실 | High | 자동 마이그레이션 + 단위 테스트 + 사용자별 backup |
| v1 일정 위반 | High | 2 주 스코프 큼. Phase 5 (flavor) / Phase 7 (LG 재평가) 는 launch 직전까지 미룰 수 있음 |
| Sync (WI-028) 호환 | Medium | Y.Doc schema 동시 마이그레이션. unit test |
| WI-029 / WI-030 의 재작업 | Medium | preset Phase 2-8 은 frame paradigm 으로 작업. WI-029 R5 도 마찬가지 |
| Inline 편집 UX 후퇴 | Medium | title 클릭→편집 같은 인라인 편집 일시 후퇴 → primitive text 의 Lexical 편집으로 흡수 |

## 8. Success metrics

- v1 launch (2026-06-08) 의 페이지 도큐먼트 100% frame kind.
- 마이그레이션 무손실 — visual diff 0 (자동 변환 후 same screenshot).
- preset 3 cover 변주 시각 동일 (Phase 1 visual fix 기준).
- 사용자 churn 0 (post-migration).

## 9. Open questions

- **Q1**: Migration 이 1회성인가, 아니면 사용자가 manual 으로 다시 4 도메인 형태로 되돌릴 수 있어야 하나? — v1 = 1회성. v2 = legacy view mode 추가 검토.
- **Q2**: Preset 의 `categoryId: "cover"` 의미가 frame-only 에서 약해지나? — 의미 강화. "cover frame" = 데크의 첫 frame 의 권장 배치.
- **Q3**: Migration 직후 ThumbnailPanel 의 icon 도 frame 단일이 되는데, 사용자가 "이건 표지였어요" 같은 hint 를 잃는가? — `frame.attrs.label` 옵션으로 "표지" 같은 라벨 보존 가능.
- **Q4**: present-poc / present-primitives e2e 가 4 도메인 의존인데, 모두 frame 으로 재작성하기에 D11-D12 충분한가? — 자세히는 FR-005 + Engineering Plan 에서.
