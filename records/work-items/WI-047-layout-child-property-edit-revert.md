# WI-047 — flex/grid 프레임 자식의 속성 편집이 되돌려지던 버그 수정

## Metadata

| Field | Value |
|---|---|
| ID | WI-047 |
| Title | flex / grid 프레임 안의 자식 아이템 속성(opacity/fill/…) 변경이 즉시 revert 되는 버그 |
| Owner | hbpark |
| Status | **Fixed & verified green (2026-05-28).** |
| Severity | P1 (편집 불가 — 핵심 기능 손상, 단 flex/grid 한정) |
| Created | 2026-05-28 |
| Closed | 2026-05-28 |
| Related | [WI-043](WI-043-frame-layout-ux.md)(layout), [WI-045](WI-045-contextual-toolbar-redesign.md), [WI-046](WI-046-option-drag-frame-layout-popover.md), agocraft WI-021(LayoutEngine `onFrameChanged`) |

## 증상

사용자 보고: "그리드/플렉스에 추가한 아이템은 속성 변경이 안 됨, 일반(absolute) 프레임에서는 정상."

## 근본 원인

`apps/web/src/document/commands.ts` 의 `weave.item.update`:

```ts
const oldFrame = child.attrs.frame;
const newFrame = after.frame;
const extraPatches = LAYOUT_FEATURE_ENABLED && oldFrame && newFrame
  ? getLayoutEngine().onFrameChanged({ root, itemId, oldFrame, newFrame })  // ← frame 안 바뀌어도 실행
  : [];
return ok(undefined, [patch, ...extraPatches]);
```

- `onFrameChanged` 가 **frame 존재하면 무조건** 호출됨 — opacity 같은 비-frame 편집(프레임 동일)에도 실행.
- layout 자식의 경우 LayoutEngine 이 **full-attrs reflow patch** 를 반환하는데, 이 patch 는 **업데이트 전 document**(opacity 1) 기준으로 계산됨.
- 반환 순서가 `[opacity 0.33 patch, reflow patch(opacity 1)]` → 뒤의 reflow 가 앞을 **덮어써서** 편집이 revert.
- **absolute 부모는 reflow patch 가 빈 배열**이라 덮어쓰기가 없어 정상 → "absolute 만 정상"의 정확한 설명.

진단: e2e 재현 — grid 자식에 `weave.item.update opacity=0.33` → `ok:true` 인데 읽으면 `1`. (첫 재현은 staging race 로 자식 add 자체가 실패 → 교정 후 revert 확인.)

## 수정

`onFrameChanged` 를 **실제 frame 변경 시에만** 호출하도록 게이트:

```ts
const frameChanged = oldFrame && newFrame &&
  (oldFrame.x !== newFrame.x || oldFrame.y !== newFrame.y ||
   oldFrame.width !== newFrame.width || oldFrame.height !== newFrame.height ||
   oldFrame.rotation !== newFrame.rotation);
const extraPatches = LAYOUT_FEATURE_ENABLED && frameChanged ? onFrameChanged(...) : [];
```

- 비-frame 편집(opacity/fill/text/…) → reflow 안 함 → 편집 유지.
- 실제 이동/리사이즈 → frame 변경 → reflow 그대로(레이아웃 재정렬 유지). resizeMulti(항상 frame 변경) / setLayout / child-add relayout 경로는 영향 없음.

## Verification
- typecheck(web) / declarativecheck / build / web unit 212: PASS.
- e2e 신규 `layout-child-props.spec.ts` **3/3**: grid 자식 opacity 0.33 / flex 자식 0.42 / absolute(control) 0.5 모두 persist.
- e2e 회귀 0: `layout-relayout-verify`(실제 리사이즈·레이아웃 변경 시 자식 재정렬) 3/3, `contextual-toolbar-redesign`+`figma-quickaction-add` 19/19.

## 교훈 (박제)
레이아웃/사이드이펙트 재계산(`onFrameChanged` 등)은 **그 사이드이펙트를 트리거하는 입력이 실제로 바뀐 경우에만** 실행해야 한다. 무조건 실행하면, 같은 transaction 의 주(主) patch 를 **업데이트 전 상태로 계산된 reflow patch** 가 덮어써 편집이 silent revert 된다. typecheck/unit 으로는 안 잡히고, 결과-attrs 를 읽는 e2e 로만 검출.
