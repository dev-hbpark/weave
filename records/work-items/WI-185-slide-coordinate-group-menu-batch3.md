# WI-185 — 좌표 계약·그룹·메뉴 Batch 3 (paste D-5·Cmd+D/G·우클릭 표준 메뉴·OS 이미지·Shift+2)

- **Status**: DONE (2026-06-12)
- **Date**: 2026-06-11 ~ 2026-06-12
- **Decision Record**: DR-121
- **Origin**: WI-182 리서치(`docs/product/SLIDE_DECK_INTERACTION_SPEC.md` §4
  Batch 3, 항목 ⑫–⑱) — 갭 클러스터 3 "좌표 계약·그룹·메뉴": paste 좌표가
  slide-deck 에서도 커서 중심(office 계약 위반), Cmd+D 델타 리듬 부재,
  Cmd+G 미바인딩, 요소/빈 슬라이드 우클릭 표준 메뉴 부재, OS 클립보드
  이미지 paste 불가, 줌-투-셀렉션 부재. Batch 1 = WI-183/DR-119,
  Batch 2 = WI-184/DR-120.

## 범위 (전부 weave-측, agocraft 재vendor 불필요)

| # | 동작 | 구현 |
| --- | --- | --- |
| ⑫ | paste 좌표 D-5 (모드-가변) | `InsertionPolicy.pasteCoord: "cursor" \| "source-position"` 신규 정책 필드 — free placement = cursor(현행), page-bounded = source-position(office 계약). `paste-coord.ts`의 `officePasteHint`(크로스-페이지 = 소스 frame 그대로, 같은 페이지 = 8px 스택)가 kit의 불투명 pointer 채널로 전달, 커맨드측 `isOfficePasteHint` 형상 판별 |
| ⑬ | smart duplicate (Cmd+D 델타 반복) | `weave.items.duplicateWithDelta` 신규 커맨드 + `smartDuplicateRef {sourceIds, cloneIds}` 리듬 추적 — Cmd+D 후 클론을 옮기면 다음 Cmd+D가 그 델타를 반복 (office 리듬). 메뉴 복제(⑮)도 리듬을 시드 |
| ⑭ | Cmd+G = frame 랩 / Cmd+Shift+G = dissolve | `weave.items.group` 신규 커맨드(동일 부모 형제 검증, union 바운즈 frame 생성+reparent, 1 트랜잭션). weave의 그룹 구조물 = frame 그 자체 — 별도 group kind 없음. Cmd+Shift+G = 기존 dissolve 별칭. 핫키는 `itemCapability(id).movable` + `isItemLocked` 게이트 |
| ⑮ | 요소 우클릭 표준 메뉴 | `FrameContextMenu`에 복제/Z-순서 4종/다른 부모로 이동/그룹/그룹 해제/잠금/삭제 행 추가. `movedIds` = 다중선택 인식(클릭한 아이템이 선택 세트에 있으면 세트 전체). 잠금 = DR-061 시맨틱(하나라도 안 잠겼으면 전체 잠금, `runBatch` 1 언두) |
| ⑯ | 빈 슬라이드 우클릭 + 레일 잔여 | 스테이지 페이지 우클릭 = PAGE 메뉴(새 슬라이드/붙여넣기/배경 변경 — 요소 동사 부재). 레일 타일 메뉴에 New/Duplicate/Delete/배경 추가(WI-184 ⑪ Skip/rename 와 통합), 마지막 페이지 삭제 가드 = disabled |
| ⑰ | OS 클립보드 이미지 paste | `use-os-image-paste.ts` 신규 훅 — window `paste` 리스너, 우선순위 계약은 DR-121 결정 4. `fileToDataUrl`+`ingestImageDataUrl`(클라우드 우선 업로드, 실패 시 data: URL+아웃박스 재시도 — MediaSrcDialog와 공유 추출) → `addNewItem("image")`(InsertionPolicy 컨테이너 해석 → slide-deck은 활성 페이지에 착지). 6MB 캡 미러 |
| ⑱ | 줌-투-셀렉션 Shift+2 | DesignPage 윈도 키다운 — `e.code === "Digit2"`(레이아웃 독립; Shift+2는 "@"를 타이핑) + 선택 union `absoluteFrameBox` → `cameraFitBox`. 양 카메라 정책(FREE/ACTIVE_PAGE) 모두 `userZoom: true`라 슬롯 상시 등록 |

## 핵심 설계 결정 (상세는 DR-121)

- **⑫ 정책 조각, 분기 아님**: paste 좌표는 소비자(use-clipboard-commands)가
  flavor를 비교하지 않고 `resolvePasteCoordMode()`로 InsertionPolicy를
  읽는다(DR-114 패턴). 힌트는 kit의 기존 pointer 채널을 재사용 — 커맨드측
  형상 판별(`isOfficePasteHint`)로 호환 유지, kit 시그니처 무변경.
- **⑭ weave의 그룹 = frame**: 별도 group kind를 만들지 않는다. Cmd+G =
  union 바운즈 frame으로 랩, Cmd+Shift+G = 기존 frame dissolve 별칭 —
  kind 추가 없이 기존 reparent/dissolve 머신을 재사용.
- **⑰ paste 우선순위**: Cmd+V 키다운에서 내부 클립보드 스토어를 프로브
  (`setClipboardHasItemsProbe`) — 비어 있으면 `preventDefault`를 생략해
  네이티브 `paste` 이벤트가 발화하고 OS 이미지 리스너가 인계. 내부 아이템이
  있으면 내부 paste 승리. **알려진 잔여**: 내부 copy 1회 후 같은 세션에서
  OS 이미지가 가려짐 — 근본 해결 = copy 시 OS 클립보드에 weave 마커 기록
  (후속 과제, DR-121 결정 4).
- **⑱ `e.code` 바인딩**: Shift+2는 대부분 레이아웃에서 "@"를 타이핑하므로
  `e.key`가 아닌 물리키 `e.code === "Digit2"`로 매칭.

## 검증 (Continuous Self-Verification)

- 단위: `paste-coord.test.ts` 신규(office 힌트 형상·판별), commands
  group/duplicateWithDelta 추가분 포함 — 전체 vitest **green**,
  `tsc --noEmit` clean, biome clean.
- e2e `slide-batch3-interactions.spec.ts` **7/7** (⑬⑭⑮⑯×2⑰⑱): Cmd+D
  델타 반복(클론 간 간격 = 소스→클론 델타, 5dp), Cmd+G 랩+공통부모 검증+
  Cmd+Shift+G 복원, 요소 메뉴(그룹/해제/복제/잠금 토글 라벨), 페이지 메뉴
  (새 슬라이드/paste 비활성/배경=페이지 선택), 레일 메뉴(마지막 페이지 삭제
  가드 포함), 합성 ClipboardEvent로 OS 이미지 paste(활성 페이지 착지 +
  data: URL 폴백), Shift+2 줌(1.5× 이상 + 뷰포트 내).
- ⑫는 페이지-경계 paste 스펙에 별도 커버(전 세션, 커밋 전 동일 브랜치).
- e2e 디버깅에서 확정한 함정 3건: (a) 그룹 직후 선택 크롬 리사이즈 핸들이
  코너 우클릭을 가로챔 → 선택 해제 후 클릭, (b) 그룹의 좌/우 1/3은 자식이
  덮어 자식 메뉴가 뜸(모든 frame이 그룹 해제 행을 보임) → 그룹 중앙(자식
  사이 갭) 클릭, (c) **`page.emulateMedia()`를 최초 goto 전에 호출하면
  `networkidle`가 결정적으로 행** — prepareDesign 뒤로 이동(4/4 재현,
  기존에 알려진 무작위 @fs 플레이크와 별개의 결정적 변종).
- 헬퍼 갭: e2e `helpers.ts`의 `setSelection`은 존재하지 않는 `addMany`를
  프로브하고 반복 `set()`으로 폴백(last-wins 단일 선택) — 실제 다중선택
  API는 `itemSelection.setMany`. 스펙-로컬 `setMultiSelection`으로 우회
  (helpers 수정은 기존 스펙 영향 범위라 보류).

## Decommission Sweep

- MediaSrcDialog의 인라인 dataURL 변환/ingest 로직을 `resource-storage.ts`
  공유 함수(`fileToDataUrl`/`ingestImageDataUrl`)로 추출 — 중복 제거.
- `use-clipboard-commands.ts` `resolvePasteHostHint`가 `deps` 전체를
  캡처해 biome useExhaustiveDependencies 경고 2건 유발 → 시그니처를
  리졸버 2개로 좁혀 해결(biome-ignore 아님).
- 삭제된 동작 없음(순수 추가) — 제거 대상 테스트 없음.

## 잔여 (Batch 3 스코프 밖)

- ⑰ paste 우선순위 잔여: copy 시 OS 클립보드 weave 마커 기록(내부 copy가
  세션 내내 OS 이미지를 가리는 문제의 근본 해결).
- e2e `helpers.ts` `setSelection`의 다중선택 폴백 수정(`setMany` 사용) —
  기존 스펙 전수 영향이라 별도 항목.
- 스펙 §4 미확인 항목 잔여: 이미지 기본 비율 잠금, 드래그 임계값.
- 스펙 §5 비-목표 유지: 타이핑-삽입, off-canvas 파킹, 폰트 스케일 기본화.
