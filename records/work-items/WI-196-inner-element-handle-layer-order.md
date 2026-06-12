# WI-196 — 내부요소 추가 핸들 레이어 순서 (z 40 = 크기조절/러버밴드와 동일)

- 상태: DONE (2026-06-12)
- 출처: "아이템 선택 후 내부요소에 의한 추가 핸들(모서리 곡율, 레이아웃 조작
  핸들, 차트 바 핸들 등)이 contextual menu나 Aku 에이전트 패널보다 위로
  그려진다. 핸들들은 러버밴드·크기변경 핸들과 같은 레이어에 있어야 한다."
  사용자 신고.
- 선행: WI-109 (모서리곡율 핸들), WI-043 (레이아웃 편집 핸들), WI-092 (차트
  바 핸들), DR-018 (SelectionLayer 핸들 레지스트리)

## 문제 — z-index 매직넘버 드리프트

`document.body`로 포탈되는 내부요소 추가 핸들들이 루트 스태킹 컨텍스트에서
메뉴/패널보다 높은 z로 떠 있었다:

| 표면 | z (수정 전) | 위치 |
|---|---|---|
| SelectionLayer (크기조절/회전 핸들 + 러버밴드) | **40** | 올바른 기준 |
| contextual toolbar (SelectionToolbarOverlay) | 46 | 핸들 위 |
| Aku 패널 / 런처 | 48 | 핸들 위여야 함 |
| **ContextMenu / Dropdown / Popover / Dialog** | **50** | 핸들 위여야 함 |
| 차트 바 핸들 | **50** ✗ | 메뉴와 동급 |
| 모서리곡율 핸들 | **50** ✗ | 메뉴와 동급 |
| 레이아웃 편집 핸들 / 차트 바운드 | **49** ✗ | Aku 패널 위 |

poly/line/slide-bullet/text/shape 핸들은 `createPortal` 없이 SelectionLayer
(z 40) 안에서 렌더돼 문제없었다. 오프렌더는 **body로 직접 포탈하며 자체 z를
49/50으로 박은 셋**뿐: 차트 핸들/바운드, 모서리곡율, 레이아웃 편집 핸들.

## 해결

세 표면의 z를 **SelectionLayer와 동일한 selection-chrome 레이어(40)**로 낮춤:

- `chart-element-view-model.tsx`: HandleButton `50 → 40`, BoundOutline `49 → 39`
  (마크 외곽선은 자기 핸들 바로 아래 유지).
- `corner-radius-handle.tsx`: `50 → 40`.
- `LayoutEditHandles.tsx`: `49 → 40`.

이로써 모든 내부요소 핸들이 크기조절/러버밴드와 같은 z 40 밴드에 모이고,
contextual toolbar(46)·Aku 패널(48)·contextual menu(50)가 그 위에 그려진다.
스냅 피드백(z 47)은 제스처 중 핸들 위 표시가 의도이므로 그대로.

## 검증

- 신규 회귀 e2e `selection-chrome-layer.spec.ts` (라이브 :5179): 모서리곡율
  핸들·차트 값 핸들의 computed z-index === **40** + `< 46`(메뉴/패널 바닥),
  차트 바운드 z < 핸들 z. 2/2 green.
- 무회귀: corner-radius-handle / chart-value-handle / layout-child-props
  **12/12** green (z 변경은 순수 시각적, 핸들 상호작용 불변). `tsc` 0,
  게이트(lint·Rule6·inheritance) green.

## 산출물

- 코드: `chart-element-view-model.tsx`, `corner-radius-handle.tsx`,
  `LayoutEditHandles.tsx`.
- 테스트: `selection-chrome-layer.spec.ts`(신규 2).
- 기록: 본 WI.

## 메모 (재발 방지)

- body로 포탈하는 selection-chrome 핸들은 **z 40**(SelectionLayer)에 맞출 것.
  메뉴/패널/툴바는 46+(toolbar 46, Aku 48, menu 50, tooltip 60)이며 핸들 위가
  정상. 새 핸들에 z 49/50을 박으면 다시 메뉴를 덮는다 — 중앙 z 스케일 상수가
  없어 드리프트하기 쉬운 지점(후속: design-system에 selection-chrome z 상수
  export 검토).
