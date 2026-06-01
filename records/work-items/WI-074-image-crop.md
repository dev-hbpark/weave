# WI-074 — Image crop (인터랙티브 이미지 자르기)

## Problem

이미지를 frame에 넣으면 `fit`(cover/contain/fill/none)으로 보이는 범위만
간접 조절할 수 있고, **"이미지의 특정 부분만 보이게 잘라내는"** 직접 수단이 없다.
데이터(`ImageAttrs.cropRatio {x,y,w,h}` 0..1, agocraft DR builtin-kinds)와
렌더(`ImageBlock.tsx`, 임의 x,y,w,h 일반 지원)는 이미 존재하나, 이를 바꾸는
커맨드·편집 UI·에이전트 스키마가 전부 없다.

표준 기대치(Figma/Canva): 이미지 더블클릭 → 크롭 모드(전체 이미지가 frame 밖으로
흐릿하게 보임) → 핸들로 표시영역 지정 → Enter/바깥클릭 확정, ESC 취소.

## Decision

DR-029 (interaction model) + FR-014 (feasibility) 참조. 요지:

- **인라인 + SelectionLayer 위임 하이브리드** — 텍스트 에디터(`TextBlock` `isEditing`,
  `overflow:visible` + 핸들은 `SelectionLayer`에 `composeTextBounds` 위임) 패턴을
  그대로 따른다. 신규 portal 레이어(러버밴드식) 없음.
- 크롭 모드 진입 시 `ImageBlock`이 frame `overflow:visible`로 전체 이미지(흐림) +
  크롭 윈도우(선명) + 마스크를 **인라인** 렌더 → 카메라 pan/zoom 자동 상속.
- 8핸들은 `NestedFrame`이 크롭 모드용 `resolveHandles`를 기존 `SelectionLayer`
  오버레이에 주입 → 오버레이 좌표/드래그 수학 재사용. `SelectionLayer`는 모드 무지
  (Rule 6 — 호출부가 모드 결정).
- 확정 = `weave.image.setCrop { itemId, crop }` → `item.attrs` Patch 1개 → History.
  frame 고정, `cropRatio`만 변경.
- 전역 게이트 `useIsCropping`(= `useIsTextEditing` 형제) — 크롭 중 마퀴/러버밴드/
  핫키 비활성.
- 에이전트(아쿠): `weave.image.setCrop` MCP 스키마 + 라벨 `"이미지 자르기"`.

v1 범위: 단일 이미지, frame 고정, cover 기준. 비범위: frame-fit-to-crop, 원본 픽셀
정밀 크롭(D1 후속), 멀티셀렉트 크롭.

## Acceptance

- 이미지 더블클릭 → 크롭 모드 진입, 전체 이미지가 frame 밖으로 흐리게 보임.
- 크롭 핸들 드래그 → 표시영역 실시간 변경, 카메라 pan/zoom과 정합.
- Enter/바깥클릭 → 확정(DOM 표시영역 반영), Cmd+Z → 원복.
- ESC → 취소(원복, 커밋 없음).
- 크롭 중 마퀴/러버밴드/단축키 비활성(`useIsCropping`).
- 에이전트 `weave.image.setCrop`로 동일 결과 + `not-an-image`/`invalid-input` 거부.

## Verification

`features/image-crop/ENGINEERING_PLAN.md` § QA 참조. e2e
`apps/web/e2e/image-crop.spec.ts`: 진입 → 드래그 → 확정 → Cmd+Z 원복 + 에이전트 경로.

## Links

- FR-014 (feasibility), DR-029 (interaction model), `features/image-crop/ENGINEERING_PLAN.md`.
- 선례: WI-055 (shape-corner-radius, 동일 배선 구조), WI-015 (text inline-edit 패턴).
- agocraft: `core` builtin-kinds `ImageCrop`/`cropRatio` (데이터·렌더 보유, v1 변경 없음).
