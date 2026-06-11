# 프레젠테이션 모드(slide-deck) 편집 경험 — 기획검토 (Product Discovery)

> **⚠️ 관점 피벗 (2026-06-11, WI-182)**: 오너 피드백 — 기능 로드맵 관점이
> 아니라 **"편집하는 사용자의 조작 단위로 각 동작이 어떻게 동작해야 하는가"**
> 가 요구사항. 현행 driver 는 `SLIDE_DECK_INTERACTION_SPEC.md` 다.
> 본 문서는 기능-레벨 벤치마크 참고자료로만 보존 (§2 의 "가이드/정렬 부재"
> 판단은 **오류** — frame-move-snap + Alt+A/… 8종이 이미 존재, 동작 감사로 정정됨).

| Field | Value |
|---|---|
| Status | **PARKED — 참고자료** (WI-182 피벗, driver 는 SLIDE_DECK_INTERACTION_SPEC.md) |
| Owner | hbpark |
| Created | 2026-06-11 |
| Inputs | 코드/레코드 인벤토리 (Explore 스윕) + 7-도구 벤치마크 (Canva·Figma Slides·Google Slides·Keynote·PPT web·Pitch·Gamma) |
| Related | INTERACTIVE_PRESENTATION_SPEC, SLIDE_PRESETS_SPEC (WI-030), WI-153/163/164/166/180 (page-bounded 기반), WI-136 (테마 타이포) |

---

## 1. 문제 정의

slide-deck 플레이버의 **기반 공사는 끝났다** — 페이지=아트보드, page-bounded
편집, EditorModeContext 정책 격리, 모드-스코프 컨테이너(WI-180), 커맨드
검증(WI-181). 그러나 사용자가 "프레젠테이션 도구"라고 느끼는 **편집 경험
표면**은 아직 mixed 의 축소판이다. 빈 슬라이드 + 도형/텍스트 추가가 전부이고,
프레젠테이션 도구의 정체성을 만드는 기능(레이아웃 시작점, 정렬 보조,
발표자 노트, 빌드 순서)이 비어 있다.

벤치마크의 경고가 정확히 우리 위치다: **"Figma Slides 함정" — 캔버스 편집력은
디자이너 데모에선 빛나지만, '화요일 업무 보고 데크' 테스트(노트/빌드/시작
레이아웃)에서 탈락하면 도구가 아니라 장난감으로 읽힌다.**

## 2. 현재 상태 (관찰된 사실)

### 이미 강한 것 (벤치마크 table-stakes 충족)
- **슬라이드 레일**: 썸네일·드래그 재정렬·추가·복제·삭제·클릭 활성화 (WI-155 등)
- **페이지=아트보드 제약**: 이동/리사이즈/삭제 불가 + Cmd-클릭 escape hatch (WI-163/164) — 벤치마크가 "정답 패턴"으로 지목
- **테마 전파**: 3 테마 + 테마별 타이포그래피 롤(body/heading/mono) + 폰트 카탈로그 (WI-136)
- **Present 모드 코어**: 카메라 줌 전환·hotspot·reveal-on-step·presentationOrder (Prezi-류 차별점, 7개 도구 중 유일)
- **AI 에이전트(Aku)**: page.add/duplicate, item/chart add — 페이지 표면으로 동결 (WI-168/169)

### 만들어놓고 안 꺼낸 것 (최저비용 승부처)
- **슬라이드 프리셋 24종** (8 카테고리 × 3 변주, WI-030): 레지스트리·커맨드·단일-undo 트랜잭션까지 **완성**. 그런데 피커 UI가 없고 에이전트 표면에서도 제외 → 사용자는 빈 슬라이드만 받는다.
- **reveal-on-step / hotspot**: 데이터 모델·실행 모두 동작하나 편집 UI 없음(에이전트/수동 attrs 만).
- **flex/grid 레이아웃** (`weave.frame.setLayout`): 커맨드 존재, slide-deck UI 표면 없음.

### 없는 것 (벤치마크 v1 랭킹 대비 갭)
| 벤치마크 v1 랭크 | 기능 | weave 상태 |
|---|---|---|
| 3 | 스마트 가이드 + 정렬/분배 | ❌ 없음 — 캔버스-퍼스트인데 스냅이 없다 (첫 60초 평가 항목) |
| 4 | 발표자 노트 + 프레젠터 뷰 | ❌ 없음 — "장난감" 판정 1순위 신호 |
| 5 | 슬라이드별 레이아웃 템플릿 | 🔶 24종 빌드됨, UI 미연결 |
| 6 | 요소 빌드 순서 (on-click appear) | 🔶 reveal-on-step 박제, 편집 UI 없음 |
| 7 | 슬라이드 전환 프리셋 | 🔶 카메라 전환 1종 고정 |
| 8 | skip/hide 슬라이드, 슬라이드 간 링크 | ❌ / 🔶 hotspot jump 박제 |
| 9 | 표(table) | ❌ kind 없음 |
| — | 슬라이드 rename | ❌ attrs.title 존재, UI 없음 |
| — | 텍스트 부분 스타일(bold/italic 범위) | ❌ 블록 단위만 |

## 3. 포지셔닝 (기존 USP와의 정합)

INTERACTIVE_PRESENTATION_SPEC §1.2: **"Prezi 의 spatial zoom + Genially 의
interactivity + 도메인 혼합"**. slide-deck 모드는 이 USP로 들어오는 **보수적
진입로**다 — 익숙한 슬라이드 편집으로 시작해, 카메라 줌·hotspot·reveal 이라는
weave 고유 자산을 점진 노출한다. 따라서:

- 편집 표면은 **공격적으로 가지치기** (벤치마크: "두 멘탈모델 한 툴바" 함정 회피 — DR-114 정책 레지스트리가 이미 그 장치).
- 빌드/전환은 **Keynote 의 순서 드로어** 모델 (멍청한 ordered list), Figma 프로토타이핑 모델 금지.
- AI 차별점: **outline→deck 파이프라인 (Gamma 패턴) + 캔버스 자유 (Figma 패턴)** 의 결합 — 7개 도구 중 누구도 둘 다 못 한다. 프리셋 24종이 에이전트의 구조화된 페이지 생성 재료.

## 4. 제안 스코프 — 4 단계

### Phase A — "시작점과 정밀함" (편집 코어 완성)
1. **프리셋 피커 UI** — 레일/툴바 "+" → 카테고리 8 → 변주 3 실루엣. 이미 빌드된 24종 연결만. *(최저비용·최대체감)*
2. **스마트 가이드 + 정렬/분배** — 페이지-경계·형제-요소 스냅, 균등 간격, align/distribute 툴바. 캔버스-퍼스트의 자존심.
3. **슬라이드 rename + skip/hide** — 레일 타일 인라인 rename, skip 은 presentationOrder 제외로 구현.

### Phase B — "발표 도구 완성" (toy→tool 전환)
4. **발표자 노트** — 페이지 attrs 확장 + 편집 패널 + (델타 저장 호환).
5. **프레젠터 뷰** — 노트 + 다음 슬라이드 + 타이머 (별창/별패널).
6. **빌드 순서 드로어** — reveal-on-step 의 편집 UI 화. 요소 다중선택 → "클릭 시 등장" 순서 리스트.
7. **전환 프리셋 3–5종** — 기존 카메라 전환을 프리셋화(zoom/fade/slide/none).

### Phase C — "AI 차별화"
8. **에이전트 outline→deck** — 프리셋을 에이전트 표면에 재노출(WI-169 의 단일-경로 결정을 DR로 갱신), "프롬프트 → 아젠다 → 8카테고리 매핑 → 덱 생성" 파이프라인.
9. **표(table) kind** — 업무 데크 필수재. 도메인 kind 추가 체크리스트(~10 touch points) 적용.
10. **텍스트 부분 스타일** — Lexical 기반 bold/italic/underline 범위 스타일.

### Phase D — "신뢰와 이동성" (후순위)
- PDF export (PPT는 그 다음) / Morph 전환(요소 identity 모델만 선설계) / 청중 인터랙션(폴·Q&A).

## 5. 비-목표 (v1에서 의식적으로 안 함)
- 타임라인 기반 애니메이션 에디터 (Keynote 드로어 수준까지만)
- 마스터 슬라이드 편집기 (테마 토큰 + 프리셋 조합으로 대체 — Google 류 멘탈모델 혼란 회피)
- 슬라이드 워크플로 메타데이터(상태/담당자, Pitch 류) — 싱글플레이어 편집이 탁월해지기 전엔 금지
- 전환/애니메이션 zoo — 프리셋 5종 상한

## 6. 열린 결정 (사용자/오너 판단 필요)
- **D1. Phase A vs B 선후**: 편집 정밀함(가이드/정렬) 먼저냐, 발표 완성도(노트/프레젠터 뷰) 먼저냐.
- **D2. 프리셋 에이전트 재노출**: WI-169 가 "페이지 생성은 page.add 단일 경로"로 동결했다. Phase C 의 outline→deck 은 이 결정의 공식 supersede 가 필요.
- **D3. 표 우선순위**: 벤치마크는 "사용자가 빨리 부딪히는 갭"으로 지목 — Phase C 에서 B 로 당길지.
