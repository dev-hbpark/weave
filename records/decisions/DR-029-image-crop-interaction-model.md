# DR-029 — Image crop interaction model (인라인 편집 + SelectionLayer 위임)

## Status

Accepted (2026-06-02). Implements WI-074. Builds on FR-014, WI-015 (text inline
edit), DR-023 (selection chrome ownership), WI-055 (corner-radius 배선 선례).
Amended (2026-06-02): **D6 — 캔바식 크롭 회전** 추가(아래). HANDOFF-021(agocraft).

## Context

인터랙티브 이미지 크롭을 추가한다. 데이터(`ImageCrop`/`cropRatio`)와 렌더(`ImageBlock`)는
agocraft에 이미 존재. 결정해야 할 것은 **인터랙션을 어디에·어떻게 띄울지**다. 초안에서 두
경로가 경합했다: (a) 러버밴드식 신규 portal 오버레이, (b) 텍스트 에디터식 인라인 + 기존
`SelectionLayer` 위임. 탐색 결과 텍스트 에디터는 portal이 아니라 **인라인**(`overflow:visible`)
이고 핸들만 `SelectionLayer`에 위임함을 확인했다.

## Decision

1. **D1 — 좌표계 / 크롭 모드 렌더.** 크롭 모드에서 `ImageBlock`은 frame을
   `overflow:visible`로 두고 **전체(원본) 이미지를 흐리게 + 크롭 윈도우 영역을 선명하게 +
   바깥 마스크**를 인라인 렌더한다. 사용자가 드래그하는 윈도우가 곧 "표시되는 이미지" 기준이라
   모드 내 핸들↔영역이 정의상 일치한다. 확정 시에만 윈도우를 `cropRatio`(0..1)로 환산.
   v1은 확정 렌더의 `object-fit:cover` 의미를 유지 — **원본 픽셀 정밀 크롭(cover 이중변환
   해소)은 후속**. `ImageBlock`의 stale "center-based" 주석은 이번에 정정.

2. **D2 — 커맨드 위치.** weave 전용 `weave.image.setCrop`. agocraft core 변경/재벤더 없음
   (corner-radius 선례). 재사용이 확인되면 agocraft 흡수는 후속(DR-025 generic-editing-
   absorption 경로).

3. **D3 — frame 고정.** 크롭은 frame 크기를 바꾸지 않고 `cropRatio`만 변경한다. 확정 시
   frame을 크롭 윈도우에 맞추는 동작(Figma 옵션)은 **후속 옵션**으로 보류.

4. **D4 — 핸들 = SelectionLayer 위임, 신규 portal 레이어 없음.** 크롭 8핸들은 호출부
   `NestedFrame`이 **크롭 모드용 `resolveHandles`** 를 기존 `SelectionLayer` 오버레이에
   주입해 그린다(텍스트가 `composeTextBounds`/`resolveHandles`를 위임하는 것과 동형).
   `SelectionLayer` 내부는 모드 무지(**Rule 6** — kind/mode 분기는 호출부가, 레이어 안에서
   `if cropMode` 금지). 크롭 크롬(전체 이미지/마스크/윈도우)은 `ImageBlock` 인라인.

5. **D5 — 모드 상태 + 전역 게이트.** 크롭 진입/이탈은 텍스트의 `isEditing` 패턴으로 관리
   (이미지 더블클릭 → `cropMode=true`; ESC 취소, Enter/바깥클릭 확정). 전역 `useIsCropping`
   (= `useIsTextEditing` 형제, `focusin`/상태 구독)을 신설해 크롭 중 마퀴·러버밴드·에디터
   핫키를 비활성화한다.

6. **D6 — 크롭 회전(캔바식 straighten).** 크롭 모드에서 이미지 **콘텐츠**를 회전한다
   (frame은 고정 — frame 회전은 별개의 기존 rotate manipulation). **데이터는 크롭 유닛
   `ImageCrop`에 `rotation`(radians)을 신설**해 담는다 — 회전은 크롭과 분리 불가하게 결합된
   양(회전 + 윈도우가 함께 표시 영역을 정의)이므로 크롭 디스크립터에 응집시키는 것이 옳다.
   동시에 **고아 필드 `ImageAttrs.rotation`은 제거**한다(탐색 확정: 팩토리 기본값·렌더러·weave
   어디서도 쓰이지 않고 한 번도 기록된 적 없는 미사용 필드 — 제거해도 직렬화 데이터 손실 없음).
   - **크로스프로젝트(승격).** `ImageCrop` 스키마는 agocraft `core` 소유 → 이 결정은 agocraft
     코어 변경 + **재벤더**를 수반한다. **HANDOFF-021**(weave→agocraft)로 요청하고 agocraft가
     자체 DR(DR-013 factory · DR-011 mirror types · Rule 6 · serializer round-trip)로 수행.
     `rotation`은 optional·additive(backward-compat); `ImageAttrs.rotation` 제거는 미사용
     필드라 마이그레이션 불요(agocraft가 round-trip 무손실 확인 게이트).
   - **렌더**: 크롭 inner에서 이미지를 중심 기준 `rotate(θ)` + **cover-zoom**(회전된 이미지가
     축정렬 크롭 윈도우를 빈틈없이 덮도록 θ·종횡비로 계산한 scale) 적용. 빈 모서리 금지.
   - **UI**: 크롭 모드에 straighten dial/slider(캔바식, 기본 −45°…+45°). frame 회전 핸들과
     혼동 방지 — 크롭 모드 중에는 frame rotate 핸들 미노출(D4와 동일 상호배타).
   - **좌표 일관성**: `cropRatio`는 회전·cover-zoom이 적용된 **표시 공간** 기준(D1 모드 내 일치
     원칙 유지). `(cropRatio, rotation)`는 크롭 모드에서 함께 캡처되어 `ImageCrop` 한 객체로
     커밋 — v1은 사후 재해석하지 않고 커밋 시점 쌍을 그대로 저장.

## Implementation note (2026-06-02) — D4 해결: document-capture 우회 (full portal 불요)

빌드 중 인라인 핸들의 React `onPointerDown`이 발화하지 않음을 브라우저 디버그로 확인 — 디자인
평면의 capture-phase 경로에서 pointerdown이 React 루트보다 먼저 처리/차단됨. **D4가 SelectionLayer
(body-portal) 위임을 명시한 근거가 이것.** 다만 full body-portal 재구현 대신 **더 가벼운 해법으로
해결**:
- 크롭 에디터가 **`document` capture-phase pointerdown 리스너**로 `[data-crop-handle]` 프레스를
  직접 감지해 드래그를 시작하고 `stopPropagation()` (React onPointerDown 우회 + 디자인 평면
  컨트롤러 차단). 이동/리사이즈는 window-level pointermove/up로 추적.
- 핸들은 **`TotalScaleContext`로 카운터스케일**(줌 무관 ~10px). **크롭 중 셀렉션 크롬 게이트(D5)**
  로 셀렉션 핸들이 경쟁하지 않음.

결과: **straighten(회전) + 윈도우 이동(move) + 모서리 리사이즈**가 UI에서 동작. e2e **5/5** 통과
(커맨드 crop+rotation·Cmd+Z/redo·가드·UI straighten·**핸들 리사이즈**·핫키 게이트). full
SelectionLayer 위임은 불필요해짐(향후 다중 아이템/회전된 윈도우 정밀화가 필요하면 재검토).

## D7 — 가로/세로 플립 (2026-06-02, generic으로 일반화)

좌우(`flipH`)·상하(`flipV`) 뒤집기. **요구사항: 크롭된 경우 보이는 영역이 동일하게 유지된 채로
플립.** 이를 위해 **소스가 아니라 최종 합성(frame view)을 frame 중심 기준 거울 반사**한다
(`scaleX/scaleY(-1)`). 크롭 윈도우(`x,y,w,h`)·회전을 **전혀 건드리지 않으므로** 같은 픽셀이 그대로
뒤집혀 보인다 — 보이는 영역 보존. (순진한 구현: 소스 img만 flip + 윈도우 고정 → 보이는 영역 변함. 기각.)

**일반화(이미지 한정 → 모든 leaf 비주얼):** 운영자 질문("이미지에만 적용 가능한 건 아닌 듯, 다른
아이템도 문제 없나?")을 받아 flip을 **kind-무관 `transform.flip` UNIT**으로 추출:

- **데이터:** `transform.flip` 유닛(attrs `{flipH?, flipV?}`). weave 스키마는 빈 스키마 +
  onUnknown:preserve라 **agocraft 변경 없이** round-trip(기존 decoration unit과 동일).
  → 이전의 `ImageCrop.flipH/flipV`(DR-037)는 **deprecated**(weave는 더 이상 사용 안 함).
- **적용:** **NestedFrame**(공통 per-item 래퍼)에서 flip 유닛을 읽어 콘텐츠를 frame 중심 mirror.
  모든 kind에 균일.
- **allow-list:** `image/video/shape/line` + **`frame`(표시 전용)**. **제외**: `qr`(스캔 불가),
  `text`(거울글씨). 
  - **frame 표시 전용 처리(2026-06-02 추가):** 프레임 플립은 콘텐츠+**자식까지** frame 중심
    미러링하되, 미러링된 콘텐츠를 **`pointer-events:none`**로 둔다 → 뒤집힌 자식은 편집 불가
    (그렇지 않으면 자식 move/resize 드래그 방향이 반전됨). **프레임 box 자체는 인터랙티브 유지**
    (선택/이동/리사이즈 정상 — 핸들은 SelectionLayer 오버레이라 내부 미러와 무관). 자식 편집은
    플립 해제 후. leaf(image/shape/line/video)는 자식이 없어 인터랙티브 유지.
- **커맨드:** `weave.item.flip { itemId, axis }` 토글(`transform.flip` 유닛 set/clear via
  setDecoration kit, 가역). allow-list 위반 시 `flip-not-supported`. 에이전트 fold/hidden.
- **UI:** 공유 `FlipControls`(좌우/상하) — image/shape/line/video 섹션 툴바에 배선.
- **크롭과 직교:** flip은 cropRatio를 안 건드림(별도 유닛). 크롭 이미지 flip 시 윈도우 불변.
- **검증:** e2e 8/8 — 플립 토글+Cmd+Z+`scaleX(-1)`, 크롭 이미지 flip 시 cropRatio 불변,
  **shape 일반화 동작 + qr 거부**. 유닛 — 토글/크롭 비간섭/allow-list.

> 크롭(+straighten)은 래스터 의미 전용이라 일반화하지 않음(image 한정 유지). 컨테이너(frame)
> flip은 **표시 전용으로 구현됨**(위 frame 처리) — 자식 미러링 + 비인터랙티브, 프레임 box는 편집 가능.

## D8 — 크롭 UI 재설계 (Figma식: SelectionLayer 핸들 + 이중 렌더) (2026-06-02)

운영자 요청으로 크롭 UI를 재설계한다. 확정 사항:
- **핸들 이관:** 크롭 핸들을 기존 인라인(ImageBlock document-capture) 대신 **SelectionLayer
  오버레이**(줌 무관 상수크기·body-portal)로 옮긴다 — 기존 resize 핸들→크롭 윈도우 resize,
  rotate 핸들→크롭 straighten. (이전에 보류했던 D4 위임의 정식 채택.)
- **원본 핸들:** "원본 리사이즈" = **크롭 프레임 안에서 원본 이미지 스케일/이동**(cropRatio 변경),
  **다중선택 리사이즈 핸들 위치(외곽 오프셋)** 에 배치 — 크롭 윈도우 핸들과 분리.
- **이중 렌더:** 편집 영역에 아이템을 **두 번 그린다** — (1) 전체 원본(프레임 밖까지) **dim**,
  (2) 프레임 영역만 한 번 더 **bright**. 핸들·밝은 영역 외 전부 dim → 원본 중 잘린 정도가 보임.

**단계별 구현:**
- **P1 ✅ (이 커밋)** — 크롭 모드 이중 렌더(전체 원본 dim, 프레임 밖까지 + 프레임영역 bright) +
  **드래그 팬**(cropRatio x/y) + straighten + 커밋. ImageBlock 루트는 크롭 중 `overflow:visible`.
  인라인 코너 resize 핸들은 제거(P2로 이관). e2e 팬 테스트.
- **P2 ✅** — 크롭 핸들 SelectionLayer 이관(별도 핸들 렌더 없이 **기존 resize/rotate 핸들 재사용**):
  - **공유 draft 스토어**(`cropping-state`에 draft 추가) — ImageBlock 렌더 · 핸들 · 디스패처 sink가
    같은 draft를 라이브 편집.
  - NestedFrame: 크롭 중인 아이템의 **chrome 유지**(resize+rotate 핸들 표시; 타 아이템은 숨김).
  - FrameStage body-capture 디스패처: 크롭 중(`croppingState.activeId`)이면 **resize→크롭 윈도우
    resize(`resizeCropWindow`), rotate→straighten(`setStraighten`)** sink로 라우팅(frame 대신).
    프레임 box는 고정 → 깔끔한 undo(커밋 시 cropRatio만). e2e: SE 핸들 드래그 → 크롭 윈도우 축소.
  - **알려진 feel 이슈**: 프레임 box 고정이라 resize 핸들이 커서를 1:1 추적하지 않음(코너에 머문 채
    크롭 콘텐츠가 라이브 재크롭). 추후 튜닝(또는 프레임-resize+보정 모델).
- **P3 (다음)** — 원본 image-scale/이동 핸들: `data-handle-kind="image-scale"`, 다중선택
  오버레이 핸들 위치(−16px 외곽) 재사용, sink가 cropRatio 스케일/오프셋 갱신.

> D1 좌표계(cover vs source) 한계는 유지 — P1 이중 렌더는 cover-displayed 이미지의 window-wrapper
> 기하를 재사용(committed 렌더와 일관). 종횡비 불일치 시 정밀 픽셀 크롭은 여전히 후속.

## D8b — 크롭 UI 마감 (캔버스 dim + 슬라이더/버튼 제거 + QuickActionBar 완료/취소) (2026-06-02)

운영자 요청 3건:
1. **dim 캔버스 전체** — FrameStage 디자인-플레인 레벨 dim 오버레이(크롭 중), 크롭 프레임은
   `zIndex` 상승으로 dim 위에 표시(밝은 크롭 영역 보임). 크롭 프레임의 전체 원본은 자체 dim
   오버레이로 어둡게 → 원본 어둡게 + 크롭 영역 밝게.
2. **straighten 슬라이더 제거** — 회전은 P2의 SelectionLayer rotate 핸들로.
3. **인라인 취소/완료 제거 → QuickActionBar에 완료/취소만** — `crop.apply`/`crop.cancel` 커맨드
   (category `"crop"`, `visibleWhen: ctx.isCropping`). DesignPage가 크롭 중 QuickActionBar에
   `category="crop"` 전달 → 다른 액션 숨기고 완료/취소만. commandContext에 `isCropping` 추가
   (use-command-host, reactive). 아이콘: 완료=IconCheck, 취소=IconClose.

부수: **cropMode를 공유 스토어 구동**으로 전환(`useCroppingItemId()===itemId`) — 외부(QuickActionBar/
키보드)에서 종료 가능. 더블클릭=enter, **Enter=완료**(DesignPage가 draft로 `weave.image.setCrop`
exec + exit), **ESC=취소**(exit). 회전 0이면 cropRatio에 rotation 생략. e2e 11/11
(완료/ESC, 캔버스 dim, QuickActionBar 완료/취소).

## Undo

크롭 확정 = `item.attrs` Patch 1개(`cropRatio`만 교체, full ImageAttrs 재구성 —
`[[feedback_weave_item_attrs_full_replace]]` 규약) → **단일 undo**. Cmd+Z → 직전 크롭/
무크롭 복원. ESC 취소는 커밋 자체가 없어 History 무관.

## Alternatives rejected

- **신규 portal 크롭 오버레이(러버밴드식)** — 전체 이미지를 뷰포트-fixed 레이어에 올리면
  이미지 이중 렌더 + 매 프레임 world→screen 투영/RAF 동기화를 새로 작성해야 한다. 인라인은
  카메라 변환을 상속하고 드리프트가 없으며 핸들은 기존 오버레이를 재사용 → 더 적은 코드/리스크.
- **ManipulationCapability에 crop 슬롯 추가** — move/resize/rotate와 의미가 달라(frame 고정,
  표시창 이동) 인터페이스 오염 + SRP 위반. 별도 모드 상태로 분리.
- **원본 픽셀 정밀 크롭 v1 포함** — cover 이중변환 해소(확정 렌더의 object-fit 재정의)는 추가
  리스크. 모드 내 일치로 충분한 UX를 먼저 출시하고 정밀 크롭은 후속.
- **크롭 회전을 휴면 `ImageAttrs.rotation` 재사용으로 처리(Option A)** — agocraft 변경·재벤더가
  없어 저렴하나, 회전을 크롭 윈도우와 분리된 attrs 필드에 두면 모델 응집이 깨지고(회전·윈도우는
  한 쌍) 의미 미정의 고아 필드를 영속화한다. **기각** — D6은 `ImageCrop.rotation` 신설 + 고아
  필드 제거의 canonical 모델 채택(운영자 지시, 2026-06-02). 비용(재벤더·agocraft DR)을 감수.
- **frame 회전 재사용** — frame 회전은 아이템 전체를 돌려 크롭 콘텐츠-회전 의미가 아님. 기각.

## Links

- WI-074, FR-014, `features/image-crop/ENGINEERING_PLAN.md`.
- WI-015(text inline), DR-023(selection chrome), WI-055(corner-radius 배선), DR-025(absorption).
