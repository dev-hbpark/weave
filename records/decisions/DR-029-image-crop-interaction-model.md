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
