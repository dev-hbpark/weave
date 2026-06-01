# Engineering Plan — Interactive image crop (WI-074)

## Feature scope

이미지 표시 영역을 (1) 사용자가 더블클릭→크롭 모드→핸들 드래그로, (2) 아쿠 에이전트가
`weave.image.setCrop` 커맨드로 편집한다. + **캔바식 크롭 회전**(DR-029 D6): 크롭 모드에서
이미지 콘텐츠를 straighten dial로 회전(frame 고정). 회전은 **크롭 유닛 `ImageCrop`의 신설
필드 `rotation`(radians)** 에 담는다 — 고아 필드 `ImageAttrs.rotation`은 제거. 이는
**agocraft 코어 변경 + 재벤더**를 수반(HANDOFF-021 + agocraft DR). agocraft 합류 후 weave 측
**인라인 크롭 모드 + cover-zoom 회전 렌더 + 핸들/회전 위임 + 에이전트 스키마**를 배선한다.

원천 사실(탐색 확정):
- `@agocraft/core` `ImageCrop { x, y, w, h }` (0..1 비율), `ImageAttrs.cropRatio?` 존재.
- `ImageBlock.tsx` 크롭 렌더 수식은 **임의 x,y,w,h 일반 지원**(주석의 "center-based"는 stale).
- 텍스트 에디터는 **인라인**: `TextBlock` `isEditing` + `overflow:visible`, 핸들은
  `NestedFrame`이 `composeTextBounds`/`resolveHandles`를 `SelectionLayer`(z40, body-portal,
  RAF world→screen 투영)에 위임.
- `useIsTextEditing`(focusin/out 구독)이 마퀴·러버밴드·핫키 게이트의 단일 소스.
- `weave.item.update`의 `item.attrs` Patch = attrs **전체 교체**
  ([[feedback_weave_item_attrs_full_replace]]).

DR-029의 D1–D5 결정을 구현한다.

## Architecture

```
이미지 더블클릭 ─ ImageBlock.onDoubleClick → setCropMode(true)   (TextBlock isEditing 동형)
   │
   ├─ ImageBlock (인라인, design 좌표 — 카메라 자동 상속)
   │     ├ frame overflow:visible
   │     ├ 전체 이미지(흐림, dim) + 크롭 윈도우(선명) + 바깥 마스크
   │     └ 로컬 state: cropDraft {x,y,w,h}
   │
   └─ SelectionLayer (기존 오버레이 z40, 재사용 — 신규 portal 없음)
         └ NestedFrame이 cropMode일 때 크롭용 resolveHandles 주입
              │ 핸들 드래그 → cropDraft 갱신(클램프: w,h>0, x+w≤1, y+h≤1)
              │ Enter / 바깥클릭
              ▼
        weave.image.setCrop { itemId, crop } ── item.attrs Patch(full attrs 재구성) ── History
         ESC → setCropMode(false) (커밋 없음, 원복)

에이전트 ─ 아쿠 ─ MCP tool "weave.image.setCrop" (schema)
              ▼
        commands.ts setImageCrop.run(ctx, input)
          ├ findChild → image guard (not-an-image 시 fail)
          ├ crop 클램프/검증(invalid-input)
          └ 현재 attrs에서 cropRatio만 교체한 **완전한** ImageAttrs 재구성 → item.attrs Patch
```

전역 게이트: `useIsCropping`(= `useIsTextEditing` 형제). 마퀴/러버밴드/에디터 핫키가
크롭 중 비활성. SOLID/GRASP: 커맨드 단일책임(크롭 설정). 분기는 image guard 1곳 + 호출부
모드 주입, `SelectionLayer`/`ImageBlock` 내부에 mode `switch` 없음(Rule 6).

## Build status (2026-06-02)

✅ Step 0 (agocraft DR-037 재벤더) · 1 (커맨드) · 2 (에이전트 fold) · 3 (크롭 모드 렌더+UI:
더블클릭·dim 마스크·윈도우 이동/리사이즈 핸들·straighten 슬라이더·완료/취소·History 커밋) ·
6 (stale 주석 정정) · 7 (e2e). 검증: weave typecheck + **333 unit** + build green, **image-crop.spec.ts
3/3 브라우저 통과**(커맨드 crop+rotation·Cmd+Z/redo·가드·UI straighten 커밋).

⏭ 남은 폴리시: **Step 4** — 인라인 핸들을 `SelectionLayer` 오버레이로 이관(줌 무관 상수 크기).
**Step 5** — `useIsCropping` 전역 게이트(크롭 중 마퀴/러버밴드/핫키 비활성). v1은 크롭 오버레이의
`stopPropagation`으로 프레임 제스처 충돌을 막고 ESC/Enter는 자체 처리.

## Build steps

0. **agocraft 선행 (HANDOFF-021, 재벤더 게이트) — ✅ 완료(2026-06-02, agocraft DR-037)**
   `ImageCrop.rotation?`(radians) 신설 + 고아 `ImageAttrs.rotation` 제거. serializer round-trip
   테스트 추가, core typecheck+784 test green. core-only repack(`…124038.tgz` 유지) → weave
   `pnpm install --force` → typecheck+328 unit+build green. **이후 1·3~7 진행 가능.**
1. **Command** `weave.image.setCrop` (`apps/web/src/document/commands.ts`)
   - input: `{ itemId, crop: { x, y, w, h }, rotation? }` (crop 각 0..1; `rotation` radians, 옵션).
   - image 도메인 guard(`not-an-image`), 클램프(`w,h>0`, `0≤x`, `0≤y`, `x+w≤1`, `y+h≤1`,
     비유한 거부 → `invalid-input`), `rotation` 유한성 검증, full ImageAttrs 재구성
     (`cropRatio` + `rotation` 동시 교체, 나머지 attrs 보존), `item.attrs` Patch.
   - 빌더 반환 배열에 등록.
2. **Schema / agent surface** — 빌드 중 확정: 코드베이스 컨벤션(WI-063)상 단일-아이템 속성
   setter는 에이전트에서 숨기고 `weave.item.update`로 접는다(setCornerRadius/setFill 선례).
   따라서 `weave.image.setCrop`도 **`AGENT_HIDDEN_COMMANDS`에 등록**(fold: `weave.item.update
   { attrs:{ cropRatio:{x,y,w,h,rotation?} } }`) + `WEAVE_COMMAND_LABELS`에 라벨 추가. 전용
   커맨드는 UI 디스패치/검증/테스트용으로 등록 유지. (아래 § 스키마는 향후 노출 시 참고용
   계약 — 현재는 fold 경로가 정식.)
3. **Crop mode state** `ImageBlock.tsx`
   - `const [cropMode, setCropMode] = useState(false)` + `onDoubleClick`(editable 시 진입,
     `stopPropagation`, frame select 먼저 — TextBlock 패턴).
   - cropMode 시 frame `overflow:visible`, 전체 이미지(dim) + cropDraft 윈도우(선명) + 마스크
     렌더. cropDraft 초기값 = 현재 `cropRatio ?? {0,0,1,1}`, rotationDraft = `cropRatio?.rotation ?? 0`.
   - **회전 렌더**: inner `<img>`에 `transform: rotate(θ) scale(coverZoom(θ, imgAspect, windowAspect))`
     (중심 기준). `coverZoom`은 회전된 이미지 bbox가 축정렬 크롭 윈도우를 덮는 최소 배율 — 빈 모서리
     금지. 비회전(θ=0)은 기존 offset 경로 유지(scale=1).
   - ESC → 취소, Enter/바깥클릭(focusout 류) → `editor.exec("weave.image.setCrop", { itemId,
     crop: cropDraft, rotation: rotationDraft })` 후 `setCropMode(false)`.
4. **Handle 위임** `apps/web/src/pages/frame-stage/NestedFrame.tsx`
   - 대상이 image이고 cropMode일 때, `composeTextBounds`와 동형의 **크롭용 `resolveHandles`**
     를 `SelectionLayer`에 주입(8핸들 = 크롭 윈도우 변/꼭짓점, 드래그 콜백이 `cropDraft` 갱신).
   - cropMode 중에는 일반 resize/**rotate** 핸들 미노출(frame 회전 ↔ 크롭 콘텐츠 회전 혼동 방지).
   - **Straighten dial** (캔바식): 크롭 모드 컨트롤바에 −45°…+45° dial/slider → `rotationDraft`
     갱신 → 실시간 cover-zoom 렌더. 신규 design-system 프리미티브면 Triage 경유.
5. **전역 게이트** `apps/web/src/document/clipboard/use-is-cropping.ts` (신규, `use-is-text-editing.ts`
   형제) + 마퀴/러버밴드/`editor-hotkeys` 소비처에 `isCropping` OR 조건 추가.
6. **렌더 정리** `ImageBlock.tsx`의 stale "center-based" 주석 정정(D1).
7. **e2e** `apps/web/e2e/image-crop.spec.ts` (§ QA).

> Design System Triage: 크롭 크롬(dim/mask/윈도우)은 신규 시각 표면. 기존 design-system
> 프리미티브로 표현 불가하면 `records/design-reviews/`로 라우팅. 단순 div+마스크면 인라인 허용.

## AGENT_COMMAND_SCHEMAS — `weave.image.setCrop`

> 위치: `apps/web/src/features/aku/agent/weave-command-schemas.ts`. 빌더(`STR`,`NUM`,`obj`)·
> `AgentCommandSpec`은 파일 상단 기존 정의 재사용.

### 계약 요약

| 항목 | 값 |
|---|---|
| name | `weave.image.setCrop` |
| label | `"이미지 자르기"` |
| destructive | `false` (가역, History 복원) |
| 대상 | `image` 도메인 아이템만 |
| 단위 | crop: **0..1 비율**(표시 이미지 기준, x=left,y=top,w,h). rotation: **radians**(콘텐츠 회전, 옵션) |
| 제약 | `w,h>0`, `0≤x`, `0≤y`, `x+w≤1`, `y+h≤1`. `rotation` 유한. 위반 시 `invalid-input`. |
| 무크롭 복귀 | `{ x:0, y:0, w:1, h:1 }`, `rotation` 생략(=0) |

### inputSchema (정의)

```ts
// ── image crop (WI-074) ──
"weave.image.setCrop": {
  label: label("weave.image.setCrop"),
  // image 아이템 전용. crop 은 표시 이미지 기준 0..1 비율 사각형.
  // x,y = 좌상단, w,h = 너비/높이. x+w≤1, y+h≤1, w·h>0. 위반 시 invalid-input.
  // rotation = 크롭 프레임 내 이미지 콘텐츠 회전(radians, 옵션, 생략=0). frame 회전과 무관.
  // 무크롭(전체)로 되돌리려면 { x:0, y:0, w:1, h:1 } + rotation 생략.
  inputSchema: obj(
    {
      itemId: STR,
      crop: obj(
        {
          x: { type: "number", minimum: 0, maximum: 1 },
          y: { type: "number", minimum: 0, maximum: 1 },
          w: { type: "number", exclusiveMinimum: 0, maximum: 1 },
          h: { type: "number", exclusiveMinimum: 0, maximum: 1 },
        },
        ["x", "y", "w", "h"],
      ),
      rotation: { type: "number" }, // radians, 옵션
    },
    ["itemId", "crop"],
  ),
},
```

### 에이전트 사용 예

```jsonc
// 중앙 50% 만 남기기
{ "itemId": "itm_abc", "crop": { "x": 0.25, "y": 0.25, "w": 0.5, "h": 0.5 } }
// 상단 20% 잘라내기 (아래 80% 표시)
{ "itemId": "itm_abc", "crop": { "x": 0, "y": 0.2, "w": 1, "h": 0.8 } }
// 크롭 해제
{ "itemId": "itm_abc", "crop": { "x": 0, "y": 0, "w": 1, "h": 1 } }
// 중앙 크롭 + 10° 스트레이튼 (radians ≈ 0.1745)
{ "itemId": "itm_abc", "crop": { "x": 0.2, "y": 0.2, "w": 0.6, "h": 0.6 }, "rotation": 0.1745 }
```

### 에러 코드(커맨드)

| code | 조건 |
|---|---|
| `item-not-found` | `itemId` 미존재 |
| `not-an-image` | 대상이 image 도메인 아님 |
| `invalid-input` | 비유한 값 / `w·h≤0` / `x+w>1` / `y+h>1` / 범위 밖 |

## QA / SVL

- e2e `apps/web/e2e/image-crop.spec.ts`:
  1. 이미지 더블클릭 → 크롭 모드 진입(전체 이미지가 frame 밖으로 보임 확인).
  2. 크롭 핸들 드래그 → cropDraft 변경, Enter 확정 → DOM 표시영역(inner div offset/size) 반영.
  3. Cmd+Z → 직전 크롭 원복.
  4. 재진입 후 ESC → 커밋 없음(원복).
  5. 크롭 모드 중 마퀴 드래그/단축키 무반응(`useIsCropping` 게이트).
  6. 에이전트 경로: `weave.image.setCrop` 호출 → 동일 반영 + `not-an-image`/`invalid-input` 거부.
  7. **회전(D6)**: straighten dial로 회전 → 이미지 콘텐츠 회전 + cover-zoom으로 빈 모서리 없음 →
     확정 후 `ImageCrop.rotation` 저장 → Cmd+Z 원복. frame 회전(별개)과 독립 확인.
  8. **round-trip(agocraft)**: `rotation` 포함 `ImageCrop` 직렬화→역직렬화 무손실(agocraft DR 게이트).
- Continuous Self-Verification: 각 스텝 후 weave 유닛 + typecheck + prod build green, 브라우저
  관측(크롭 윈도우↔카메라 pan/zoom 정합, 드리프트 없음).
- Decommission: 신규 기능이라 제거 대상 없음. `ImageBlock` stale 주석은 정정(삭제).

## Links

- WI-074, FR-014, DR-029. 선례: WI-055/shape-corner-radius, WI-015/text inline-edit, DR-023.
