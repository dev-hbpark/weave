# Technical Feasibility Review — FR-014 Interactive image crop (이미지 자르기)

| Field | Value |
|---|---|
| ID | FR-014 |
| Triggering WI | WI-074 |
| Date | 2026-06-02 |
| Reviewer | hbpark |
| Verdict | **FEASIBLE WITH TRADE-OFFS** |

## Requested outcome

선택한 이미지의 표시 영역을 드래그/핸들로 잘라내는 **인터랙티브 크롭**. 크롭 모드에서
잘려나간 전체 이미지가 frame 밖으로 보이고, 핸들로 표시창을 지정해 확정한다(Figma식).

## What current tech can deliver

- **데이터·렌더 보유** — `ImageCrop {x,y,w,h}`(0..1)·`ImageAttrs.cropRatio?`가 agocraft
  `core` builtin-kinds에 존재. `ImageBlock.tsx`의 크롭 렌더 수식
  (`left:-cropX*(1/cropW)*100%` 등)은 주석("center-based")과 달리 **임의 x,y,w,h를
  일반 지원** → 렌더 신규 작업 거의 없음.
- **인라인 편집 모드 선례** — 텍스트 에디터(`TextBlock` `isEditing` + `overflow:visible`)가
  "frame 밖으로 넘쳐 보이는 인라인 편집 표면" 패턴을 이미 검증. 크롭의 "전체 이미지 표시"가
  여기에 1:1 대응.
- **핸들 오버레이 재사용** — `SelectionLayer`(z40, body-portal, RAF world→screen 투영,
  `resolveHandles`/`boundsOf` 위임)가 이미 존재. 텍스트가 `composeTextBounds`로 위임하듯
  크롭 핸들도 호출부(`NestedFrame`) 주입으로 재사용 → 새 portal 레이어 불필요.
- **가역성** — 크롭 확정은 순수 `item.attrs` Patch 1개 → History/Undo 자동, 부작용 없음
  (클립보드식 transport 주입 불필요).
- **에이전트** — `weave.shape.setCornerRadius`(WI-055) 선례대로 `weave.image.setCrop`
  커맨드 + MCP 스키마 추가 = 얇은 배선.

## Intrinsic ceiling / trade-offs (불가피)

1. **좌표계 이중변환 (D1)** — 확정 렌더는 크롭 inner `<img>`가 `object-fit:cover`로
   채워져, `cropRatio`가 "원본 픽셀"이 아니라 "cover로 표시된 이미지" 기준으로 적용된다.
   이미지 종횡비 ≠ frame 종횡비일 때 원본 픽셀 정밀 크롭은 불일치 가능. **v1 회피책**:
   크롭 *모드* 에서 전체 이미지를 `overflow:visible`로 그대로 보여주면 사용자가 드래그하는
   윈도우가 곧 표시 이미지 기준이라 모드 내 핸들↔영역이 정의상 일치. 원본 픽셀 정밀 크롭은
   후속.
2. **신규 인터랙션 모드** — 기존 `ManipulationCapability`는 move/resize/rotate 3종 고정
   슬롯(`manipulation/types.ts`). 크롭("frame 고정, 표시창 이동")은 의미가 달라 이 인터페이스에
   끼우면 SRP 왜곡 → 별도 크롭 모드 상태(`isCropping`)로 분리해야 함(추가 표면).
3. **전역 게이트 추가** — 크롭 중 마퀴/러버밴드/핫키 차단을 위해 `useIsCropping`(= 텍스트의
   `useIsTextEditing` 형제) 신설 + 각 소비처 배선 필요.

## Boundary: 인라인 하이브리드 vs 신규 portal 레이어 (기각된 대안)

전체 이미지+크롭 UI를 러버밴드식 portal 레이어(뷰포트 fixed)에 올리는 대안은 이미지를
**두 번 렌더 + 매 프레임 world→screen 투영/RAF 동기화**를 새로 요구한다. 인라인(design 좌표)은
카메라 변환을 공짜로 상속하고 드리프트가 없으며, 핸들은 이미 풀린 `SelectionLayer` 오버레이를
재사용한다 → 신규 코드·리스크가 더 작음. DR-029에서 인라인 채택.

## Cross-project

- **크롭 자체(이동/리사이즈)는 weave-local** — `cropRatio` 데이터·렌더가 agocraft에 이미 있어
  core 변경 불필요.
- **크롭 회전(D6, WI-074 amendment)은 agocraft 변경 필요** — `ImageCrop`에 `rotation` 신설 +
  고아 `ImageAttrs.rotation` 제거. **HANDOFF-021**(weave→agocraft) + agocraft 자체 DR + **재벤더**.
  `rotation`은 optional·additive(backward-compat), 제거 필드는 미사용이라 마이그레이션 불요.
  FR-013(line-kind)보다 작은 단일 필드 추가/제거지만 재벤더 절차(core-only repack)는 동일하게 적용.
- agocraft로의 크롭 **커맨드** 흡수는 재사용 확인 후 후속(DR-025 generic-editing-absorption).

## Verdict

**FEASIBLE WITH TRADE-OFFS.** 데이터·렌더·인라인편집·핸들오버레이 자산이 모두 갖춰져
weave-local 얇은 배선으로 가능. 단, (1) 원본 픽셀 정밀 크롭은 cover 이중변환으로 v1 범위 밖
(모드 내 일치로 회피), (2) 크롭 모드 상태 + 전역 게이트가 신규 표면. 단계별 ENGINEERING_PLAN +
e2e(확정/Undo/취소/에이전트)로 관리. frame 고정·`cropRatio`-only가 데이터 게이트.

## Links

- WI-074, DR-029, `features/image-crop/ENGINEERING_PLAN.md`.
- 선례: WI-055/shape-corner-radius(배선), WI-015/text(인라인 편집), DR-023(selection chrome).
