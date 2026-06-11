# DR-121 — 좌표 계약·그룹·메뉴(Batch 3) 시맨틱 + paste 우선순위 계약

- Status: ACCEPTED — WI-182 권고안 사용자 승인 + WI-185 구현 완료
  (2026-06-12)
- Date: 2026-06-12
- Related: WI-182/WI-185, `docs/product/SLIDE_DECK_INTERACTION_SPEC.md` §3
  D-5 + §4 Batch 3, DR-114 (EditorModeContext — InsertionPolicy 본 DR이
  확장), DR-119 (Batch 1), DR-120 (Batch 2), DR-061 (QuickActionBar 잠금
  시맨틱 — ⑮가 미러), DR-118 (InsertionPolicy.addContainerFor — 같은 조각),
  WI-041 (클립보드 커맨드 체계), WI-072 (이미지 ingest/아웃박스)

## 결정 1 — paste 좌표는 InsertionPolicy 조각 (⑫, 스펙 D-5)

**`InsertionPolicy.pasteCoord: "cursor" | "source-position"`** — free
placement(mixed) = cursor(현행 Figma 시맨틱), page-bounded(slide-deck) =
source-position(office 5/5 계약: 크로스-슬라이드 paste는 소스 frame 그대로,
같은 슬라이드는 8px 스택 오프셋).

- 소비자(`use-clipboard-commands`)는 flavor를 비교하지 않는다 —
  `resolvePasteCoordMode()`로 정책을 읽는다(DR-114 "no flavor compares in
  consumers"). 신규 분기 지점 0.
- 전달 채널 = kit의 기존 불투명 `pointerInContainer` 채널 재사용.
  `officePasteHint(sameContainer)` 형상을 흘리고 커맨드측이
  `isOfficePasteHint`로 판별 후 office 좌표 규칙 적용, 아니면 기존 포인터
  해석 — **kit 시그니처 무변경**으로 하위호환.
- 기각: paste 커맨드에 mode 파라미터 추가(호출자 전원이 flavor를 알아야
  함 — 정책 누수), 별도 paste 커맨드 분리(동사 중복).

## 결정 2 — weave의 그룹 구조물 = frame (⑭)

**별도 group kind를 도입하지 않는다.** Cmd+G = 선택을 union-바운즈 frame
으로 랩(`weave.items.group` — 동일 부모 형제 검증 + frame 생성 + reparent,
1 트랜잭션), Cmd+Shift+G = 기존 frame dissolve의 별칭.

- frame이 이미 그룹의 모든 속성(자식 보유·이동·중첩·dissolve)을 가진다 —
  kind 추가는 ~10 터치포인트(도메인 kind 체크리스트) + 렌더러/정책 중복만
  낳는다.
- 결과: ⑮의 "그룹 해제" 행은 **모든 movable frame**에 보인다(그룹/일반
  frame 구분 불가 — 동일 구조물이므로 의미도 동일: 자식을 부모로 올리고
  자신을 해체).
- 핫키 게이트 = `itemCapability(id).movable` + `isItemLocked` — 페이지/
  스테이지는 그룹 대상에서 자동 제외(별도 flavor 분기 없음).

## 결정 3 — 우클릭 메뉴는 선택-인식, 역할별 분리 (⑮⑯)

- 요소 메뉴의 작용 대상 `movedIds` = 클릭한 아이템이 현재 다중선택 세트에
  속하면 세트 전체, 아니면 클릭한 아이템 단독. **우클릭은 선택을 바꾸지
  않는다**(Figma/PPT 합의).
- 잠금 행 = DR-061 시맨틱 미러: 하나라도 안 잠겼으면 전체 잠금,
  `runBatch`로 1 언두. 라벨 = "잠금"/"잠금 해제" 토글.
- 스테이지의 페이지(role=stage)는 요소 메뉴가 아닌 **PAGE 메뉴**(새
  슬라이드/붙여넣기/배경 변경)를 받는다 — 요소 동사(삭제/복제/그룹)는
  페이지에 노출되지 않는다(페이지 수명주기는 레일 메뉴 소관).
- 레일 타일 메뉴는 WI-184 ⑪(Skip/rename)과 한 메뉴로 통합 — New/Duplicate/
  Delete/배경 추가, 마지막 페이지 삭제는 hidden이 아닌 **disabled**(가드
  존재를 가시화).

## 결정 4 — OS 이미지 paste 우선순위 = 내부 클립보드 우선, 프로브로 양보 (⑰)

**Cmd+V 키다운에서 내부 클립보드 스토어를 프로브하고, 비어 있을 때만
네이티브 paste로 양보한다.**

- 구현: editor-hotkeys의 Cmd+V 바인딩이 `clipboardHasItemsProbe()`를
  키다운 시점에 호출 — 내부 스토어 EMPTY → `preventDefault` 생략 →
  네이티브 `paste` 이벤트 발화 → `use-os-image-paste` 윈도 리스너가 첫
  `image/*` 파일을 ingest. 내부 아이템 존재 → 기존 내부 paste가 승리.
- ingest = `fileToDataUrl` + `ingestImageDataUrl`(클라우드 우선 업로드 →
  정식 URL; 실패 시 data: URL + 아웃박스 재시도 — WI-072 경로 공유) →
  `addNewItem("image")` — InsertionPolicy 컨테이너 해석을 그대로 타서
  slide-deck은 활성 페이지에 착지(DR-118).
- 텍스트 편집 타깃(input/textarea/contenteditable)에서는 양보하지 않고
  브라우저 기본 동작 유지. 6MB 캡 = MediaSrcDialog 미러.
- **알려진 잔여(수용)**: 내부 copy를 한 번 하면 스토어가 비지 않으므로
  같은 세션에서 OS 이미지 paste가 가려진다. 근본 해결 = **copy 시 OS
  클립보드에 weave 마커를 기록**하고 paste 시 OS 클립보드의 마커 유무로
  최신성을 판별 — 비동기 Clipboard API 권한 + 키다운 동기성 제약이 있어
  후속 과제로 분리(WI-185 잔여). → **해소: DR-122 / WI-186** (본 결정의
  프로브 라우팅은 마커 쓰기 실패 시 레거시 폴백 모드로 존속).
- 기각: 항상 OS 클립보드 우선(내부 다중 아이템/스타일 paste가 이미지 한
  장에 밀림), `navigator.clipboard.read()` 동기 프로브(권한 프롬프트 +
  키다운 핸들러에서 비동기 불가).

## 결정 5 — Shift+2 = 물리키 바인딩 (⑱)

`e.key`가 아닌 **`e.code === "Digit2"`**로 매칭 — Shift+2는 대부분의
레이아웃에서 "@"(또는 레이아웃별 다른 문자)를 타이핑하므로 문자 기반
매칭은 키보드 레이아웃에 종속된다. Figma 동일 계약(물리 숫자키).

- 핏 대상 = 선택 union `absoluteFrameBox` → `cameraFitBox` 모듈 슬롯.
  FREE_CAMERA/ACTIVE_PAGE_CAMERA 둘 다 `userZoom: true`라 슬롯은 상시
  등록 — flavor 분기 없음.

## e2e 운영 노트 (재발 방지)

- **`page.emulateMedia()`를 최초 `goto` 전에 호출하면 `networkidle` 대기가
  결정적으로 행**(4/4 재현) — 알려진 무작위 @fs 플레이크와 별개의 결정적
  변종. 미디어 에뮬레이션은 prepareDesign **뒤**에.
- 그룹 직후엔 선택 크롬 리사이즈 핸들이 프레임 코너를 덮는다 — 코너
  우클릭 전 선택 해제. 그룹 멤버가 덮은 영역 클릭은 **자식 메뉴**를 연다
  (결정 2의 귀결: 모든 frame이 같은 메뉴 행을 가짐) — 그룹 자체를
  겨냥하려면 멤버 사이 갭(중앙)을 클릭.
- e2e `helpers.ts` `setSelection`은 다중선택을 last-wins 단일로 붕괴시킨다
  (존재하지 않는 `addMany` 프로브 → `set()` 반복 폴백). 실제 API =
  `itemSelection.setMany`. 수정은 기존 스펙 전수 영향이라 별도 항목.
