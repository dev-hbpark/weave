# WI-145 — 레이아웃 내 텍스트 자동 높이 보정(생성 직후 과대 높이) 수정

Status: **Done**
Owner: hbpark
Updated: 2026-06-08
유형: Bug fix / 발견: 아쿠 에이전트 생성 레이아웃
관련: WI-143/DR-098(agent fixed-box, prompt가 text height 지정 유도), `derive-text-auto-resize.ts`

## 증상

아쿠 에이전트가 만든 레이아웃 안의 텍스트가 **생성 직후 영역을 과하게 차지**하다가, 사용자가 그
텍스트를 한 번 **편집(더블클릭→편집 종료)하면 정상 크기로 보정**됨.

## 근본 원인

에이전트 흐름이 **`weave.item.add`(text, 넉넉한 frame.height) → 이후 `weave.frame.setLayout`**.

1. 텍스트 자동 높이는 `TextBlock`의 ResizeObserver가 **내부 콘텐츠 div**를 측정해 frame.height를
   콘텐츠에 맞춰 커밋한다. 이 옵저버는 콘텐츠 크기가 바뀔 때만 발화하며, **마운트 시 1회** 발화.
2. 그 최초 자동 맞춤 커밋이 **에이전트 트랜잭션(라운드 그룹)에 묶이고, 직후 `setLayout`의 자식
   frame 패치가 덮어써서** 큰 height가 남는다. 이후 콘텐츠 크기는 변하지 않으므로 옵저버가
   **다시 발화하지 않음** → 과대 높이 유지.
3. 사용자가 편집을 마치면 `measureCommitRef`(edit-exit rAF 보정)가 강제로 한 번 더 측정·커밋 →
   정상. 그래서 "편집 후 정상".

(레이아웃 자식은 `setLayout`이 layoutChild를 auto-flex/grid로 덮어쓰므로 모드는 "HEIGHT"(자동 높이).
DR-098의 Fixed 주입은 여기선 덮여 무관. 핵심은 옵저버 최초 커밋의 유실 + 재발화 없음.)

## 수정

`TextBlock`의 edit-exit 보정 useEffect를 **레이아웃 변경 시에도** 실행하도록 확장: 의존성에
`autoResizeMode`와 `a.frame.width` 추가. 박스의 리사이즈 모드/너비가 바뀌면(=에이전트 add→setLayout,
혹은 부모 리사이즈) **라운드 종료 후 렌더에서 rAF 보정이 한 번 실행**되어 콘텐츠에 맞는 높이를 깨끗이
커밋한다(편집 불필요). `measureAndCommit`는 NONE/편집 중/히스토리 리플레이에서 no-op이라 안전,
임계값(>=0.0005)으로 수렴(루프 없음). exhaustive-deps는 의도적 트리거라 biome-ignore + 사유 기재.

파일: `apps/web/src/document/domains/TextBlock.tsx`.

## 검증

- typecheck green, biome 클린(트리거-deps suppression 사유 기재).
- 회귀: `commands-layout-relayout` + `commands`(117) + agent 스위트 = **197/197** 통과.
- ⚠️ 라이브(에이전트 add→setLayout 실제 브라우저 재현)은 에이전트 서버+브라우저 필요라 샌드박스에서
  완전 재현 불가 — 근본 원인 추적 + 회귀 스위트로 검증. 실제 환경 1회 확인 권장.

## 에이전트 가이드 보강 (3-레버 결정)

렌더 보정(위)과 별개로, 에이전트가 텍스트 크기 결정을 **상황별로** 처리하도록 프롬프트를 명확화
(`weave-command-schemas.ts` TEXT_ATTRS_NOTE BOX SIZING + `weave-capabilities.ts` text itemKind):

1. **자유 배치 텍스트**(root/absolute-constraints) = FIXED 박스 → frame.width+height를 주고
   필요 시 textOverflow:'VISIBLE'. (DR-098)
2. **flex/grid 안 텍스트** = AUTO-HEIGHT → **frame.height를 지정/고정하지 말 것**(추측 높이가
   과대 영역을 만든다 — 본 WI 버그의 입력 측 원인).
3. **레이아웃 안 여유/고정 영역** = **셀을 키운다**(grid ratio/fr 트랙, flex grow/basis, 또는 래퍼
   프레임) + 텍스트는 그 안에서 auto-fit & 정렬(textAlignVertical/cell align). leaf 텍스트 높이로
   만들지 않는다.

이로써 "여유있는 고정 영역"과 "콘텐츠 맞춤"이 충돌 없이 모두 표현 가능(레버가 분리됨).

## 검증 (보강분)

- biome·typecheck 클린, agent 스위트 **74/74**(capabilities/command-schemas coverage 포함).

## 후속

- 더 견고히 하려면: 옵저버 최초 커밋이 에이전트 라운드에 묶이지 않도록 라운드 종료 후 일괄 텍스트
  자동맞춤 패스를 검토. 현 수정은 레이아웃-변경 트리거로 그 케이스를 커버.
