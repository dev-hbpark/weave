# 프레젠테이션 모드 인터랙션 동작 명세 — 사용자 조작 관점

| Field | Value |
|---|---|
| Status | **Discovery → 동작 명세** (WI-182, 관점 피벗: 기능 로드맵 ❌ → 조작-단위 동작 ✅) |
| Owner | hbpark |
| Created | 2026-06-11 |
| Inputs | 5-도구 동작 컨벤션 리서치 (Keynote/PPT/Google Slides/Canva/Figma Slides) + weave 인터랙션 핸들러 전수 감사 (file:line 근거) |
| Question | "슬라이드를 편집하는 사용자의 손끝에서, 각 제스처/키가 어떻게 동작해야 하는가" |

## 0. 원칙

1. **머슬-메모리 계약 우선** — 5개 도구 중 ≥3 이 합의한 동작을 위반하면
   에디터가 "고장난 것"으로 읽힌다. 합의 동작을 기본값으로 한다.
2. **모드-가변 동작은 EditorModeContext 다형성으로** (DR-114) — 소비처에
   flavor 비교 금지.
3. 도구 간 분기가 있는 곳은 **weave 의 정체성(Figma-류 캔버스 + page-bounded
   슬라이드)** 기준으로 한쪽을 선택하고 §3 에 기록한다.

## 1. 머슬-메모리 계약 vs weave 현재

✅ 충족 · 🔶 부분 · ❌ 부재 · ❓ 미확인

### 1a. 선택/텍스트 (대부분 충족)

| 제스처 | 컨센서스 기대 동작 | weave 현재 | 판정 |
|---|---|---|---|
| 요소 클릭 | 최상위 톱레벨 선택 (parent-first) | WI-033 parent-first | ✅ |
| 빈 곳 클릭 | 전체 해제 | 동일 | ✅ |
| Cmd-클릭 | deep select (leaf 직행) | figma-cmd-click-deep-select | ✅ |
| 마키 | **intersection** (걸치면 선택) — 캔버스-계열 픽 | intersection (MarqueeSelectionLayer:4) | ✅ |
| Esc 래더 | 텍스트 캐럿 → 요소 → 해제 | 차트 datum → vertex → 요소 → 해제 | ✅ |
| Cmd+A | 현재 슬라이드 스코프 | WI-180 | ✅ |
| 텍스트 더블클릭 | 캐럿 진입 (클릭 지점) | 진입하나 **전체 선택** (TextBlock:588) | 🔶 |
| **Enter (텍스트 선택 중)** | 텍스트 편집 진입 (4/5 도구) | ❌ 더블클릭만 | ❌ |
| Tab / Shift+Tab | 형제 순회 | WI-033 | ✅ |
| Shift+클릭 | 선택 토글 | ❓ (마키는 Cmd=토글 확인, 클릭은 미확인) | ❓ |

### 1b. 이동/리사이즈/회전 (최대 갭 영역)

| 제스처 | 컨센서스 | weave 현재 | 판정 |
|---|---|---|---|
| **Shift+드래그** | 수평/수직 축 고정 (5/5) | ❌ 자유 이동 | ❌ |
| **Alt/Option+드래그** | 복제 드래그 (5/5) | ❌ | ❌ |
| **Shift+코너 리사이즈** | 비율 고정 (모던 기본: 자유, Shift=고정) | ❌ (input 이 shift 캡처하나 manipulation 에 aspect 처리 없음) | ❌ |
| **Alt+리사이즈** | 중심 기준 | ❌ | ❌ |
| Shift+회전 | **15°** 디텐트 (3/5) | 10° (rotation-snap.ts:10) | 🔶 |
| 화살표 / Shift+화살표 | 1px / 10px | WI-181 검증 | ✅ |
| 스마트 가이드 | 형제+슬라이드 중심/엣지 + 균등간격 배지 | frame-move-snap.ts + SnapFeedbackLayer | ✅ |
| 정렬/분배 | 툴바/단축키 | Alt+A/H/D/W/V/S 8종 (`resizeMulti`) | ✅ |
| 멀티선택 드래그 | 강체 그룹 이동 | WI-159 | ✅ |
| 이미지만 비율 자동-고정 | (사진은 기본 고정) | ❓ | ❓ |

### 1c. 클립보드/복제

| 제스처 | 컨센서스 | weave 현재 | 판정 |
|---|---|---|---|
| **크로스-슬라이드 paste** | **원본과 동일 좌표** (office 5/5 — 페이지 가구·헤더 워크플로의 하중 지지) | 커서 중심 / 8px 스택 (paste-coord.ts:50-72) | ❌ |
| 같은 슬라이드 paste | 우하향 소폭 오프셋 | 8px 스택 (유사) | ✅ |
| Cmd+D | 복제+오프셋 | WI-181 검증 | ✅ |
| **smart duplicate** | 복제→이동→Cmd+D 재타 시 **델타 반복** (배열 생성, 4/5) | ❌ | ❌ |
| 스타일 paste | Cmd+Alt+V | Paste Special (editor-hotkeys:690) | ✅ |
| **OS 이미지 paste** | 클립보드 비트맵 → 이미지 요소 (5/5) | ❌ | ❌ |
| 크로스-디자인 paste | 위치 보존 | 세션-스코프 store (WI-041) | ✅ |

### 1d. 그룹/z-order/메뉴

| 제스처 | 컨센서스 | weave 현재 | 판정 |
|---|---|---|---|
| **Cmd+G / Cmd+Shift+G** | 그룹 / 언그룹 | ❌ — frame 이 유일 컨테이너; Cmd+Backspace dissolve 가 언그룹 반쪽 | ❌ |
| z-order 단축키 | ]/[/Cmd+]/Cmd+[ (Canva/Figma 계열) | 동일 4종 (editor-hotkeys:404-446) | ✅ |
| **요소 우클릭** | Cut/Copy/Paste → Duplicate/Delete → Order ▸ 4종 → Group → Lock | 레이어 피커만 (LayerPickerMenu) | 🔶 |
| **빈 슬라이드 우클릭** | Paste · New slide · 배경 변경 | ❌ 없음 | ❌ |

### 1e. 슬라이드 단위 워크플로 (slide-deck 전용 — 두 번째 큰 갭)

| 제스처 | 컨센서스 | weave 현재 | 판정 |
|---|---|---|---|
| **레일 ↑/↓ 키** | 슬라이드 간 이동 (5/5) | ❌ 클릭만 | ❌ |
| **PageUp/PageDown (캔버스)** | 이전/다음 슬라이드 (office 3/5 — 슬라이드가 작업 단위) | ❌ | ❌ |
| **포커스 규칙** | 레일 포커스→화살표=슬라이드 이동, 캔버스 선택→화살표=넛지 (5/5; 위반=고장) | 레일 키보드 부재로 미성립 | ❌ |
| **레일 다중선택** | Shift=범위, Cmd=토글 → 복사/복제/삭제/재정렬 **세트로** (5/5) | ❌ 단일 선택만 | ❌ |
| 새/복제 슬라이드 삽입 위치 | **현재 슬라이드 뒤** (5/5) | duplicate=뒤 ✅ (commands:2442) / "+" 추가=❓ (끝?) | 🔶 |
| 레일 우클릭 | New·Duplicate·Delete·**Skip**·배경 | Duplicate·Delete 만 | 🔶 |
| 슬라이드 rename | (Keynote 외 약함 — 보너스) | ❌ attrs.title 만 존재 | ❌ |
| 줌: fit / 단계 / 핀치 / 스페이스 팬 | Cmd+0 / Cmd+= / 핀치 / Space | 전부 있음 | ✅ |
| 줌-투-셀렉션 | Figma Shift+2 (소수파, 채택 가치) | ❌ | ❌ |

## 2. 종합 판정

- **선택 모델·스냅·정렬·z-order·Esc 래더·넛지** — 이미 컨센서스 충족. 기반은 건강.
- **갭 클러스터 1 — 변형 모디파이어**: Shift 축고정·Alt 복제드래그·Shift 비율고정·Alt 중심리사이즈 전부 부재. "첫 60초" 평가에서 가장 먼저 들키는 부류.
- **갭 클러스터 2 — 슬라이드 단위 키보드 워크플로**: 레일 키보드 내비·포커스 규칙·다중선택·PageUp/Down 전부 부재. 마우스로 레일 타일을 클릭하는 것이 슬라이드 전환의 유일한 경로.
- **갭 클러스터 3 — paste 좌표 계약 + 그룹 + 우클릭 메뉴 + OS 이미지 paste.**

## 3. 분기 결정 (도구 간 합의가 갈리는 곳 — weave 의 픽)

| # | 분기 | 픽 | 근거 |
|---|---|---|---|
| D-1 | 타이핑-삽입(PPT/Keynote) vs 단일키 툴숏컷(Figma/Canva) | **툴숏컷 유지** (R/T/F 기존) | 캔버스 파워유저 루프. Enter-편집 추가로 PPT 습관 완화 |
| D-2 | 더블클릭 = 그룹 디센드(Figma/Keynote/Canva) vs 줌핏 | **RESOLVED (DR-119)** — 전제 정정: "현재 weave=줌핏"은 stale 주석발 감사 오류였고, fit 카운터는 WI-033 P2 에서 이미 제거됨. 현행 더블클릭 = 평클릭 2회 = parent-first→leaf 드릴 — **그룹 진입은 이미 충족**. 줌핏 거처 = 빈 영역 더블클릭(fit-all)/레일 타일(프레임 핏), 무변경 | Figma 의 레벨당-1 vs weave 의 leaf 직행 뉘앙스는 수용 (중간 레벨 = Shift+Enter/Cmd 딥클릭) |
| D-3 | 마키 containment vs intersection | **intersection (현행 유지)** | 캔버스-계열 합의, 이미 일치 |
| D-4 | 텍스트 코너 리사이즈: reflow(4/5) vs 폰트 스케일(Canva) | **reflow 유지** + 폰트 스케일은 명시 어포던스로만 | 템플릿 데크의 타이포 일관성. ratio fontSize(WI-135) 와의 상호작용은 구현 시 검증 항목 |
| D-5 | paste 좌표: 커서 중심(Figma, 현행) vs 위치 보존(office 5/5) | **slide-deck 은 office 계약** — 크로스-슬라이드 동일 좌표, 같은 슬라이드 오프셋. mixed 는 커서 중심 유지 | 슬라이드 간 위치 정체성은 하중 지지 워크플로. **모드-가변 → InsertionPolicy 또는 신규 정책 조각** |
| D-6 | 슬라이드 밖 배치: off-canvas 파킹(5/5, 렌더 클립) vs 하드 클램프(현행 WI-153) | **클램프 유지 (의도적 divergence)** | 페이지=아트보드 모델·에이전트 add-clamp 와 일관. 파킹 도입 시 페이지-스코프 뷰·델타 저장·present 클립 전부 재설계 — 가성비 없음 |

## 4. 구현 배치 (동작 단위, 우선순위순)

### Batch 1 — 변형 모디파이어 (캔버스 머슬메모리 회복) — **DONE (WI-183 / DR-119)**
1. Shift+드래그 축 고정 (수평/수직)
2. Alt/Option+드래그 복제
3. Shift+코너 리사이즈 비율 고정 (+이미지는 기본 고정 검토)
4. Alt+리사이즈 중심 기준
5. Shift+회전 15° 정렬 (10°→15°)
6. Enter = 선택된 텍스트 편집 진입 (+더블클릭 캐럿 위치 = 클릭 지점)

*주의: 1–4 는 agocraft manipulation(FrameMove/ResizeBinding) 경계 — 수정이
vendored 패키지 측이면 agocraft 작업 + 재vendor 절차 필요.*

### Batch 2 — 슬라이드 단위 키보드 워크플로 (slide-deck 정체성) — **DONE (WI-184 / DR-120)**
7. 레일 포커스 모델 + ↑/↓ 슬라이드 이동 + 포커스 시각 표시
8. PageUp/PageDown = 이전/다음 슬라이드 (캔버스 포커스에서도)
9. 레일 다중선택 (Shift 범위/Cmd 토글) + 세트 복제·삭제·드래그 재정렬
10. "+" 추가 삽입 위치 = 현재 슬라이드 뒤 (확인 후 정정)
11. 레일 우클릭에 Skip(presentationOrder 제외) + rename 추가

### Batch 3 — 좌표 계약·그룹·메뉴
12. paste 좌표 D-5 (모드-가변 — 정책 조각)
13. smart duplicate (Cmd+D 델타 반복)
14. Cmd+G = 선택을 frame 으로 랩 / Cmd+Shift+G = dissolve 별칭
15. 요소 우클릭 표준 메뉴 (Cut/Copy/Paste/Duplicate/Delete/Order/Group/Lock — 레이어 피커는 유지·통합)
16. 빈 슬라이드 우클릭 (Paste·New slide·배경)
17. OS 클립보드 이미지 paste
18. 줌-투-셀렉션 (Shift+2)

### 미확인 항목 (Batch 착수 전 사실 확인)
- 이미지 기본 비율 고정 여부 / 드래그 임계값
- ~~Shift+클릭 토글 여부~~ → ⑨에서 Shift=범위/Cmd=토글로 해소 (DR-120 결정 2)
- ~~"+" 추가 삽입 위치~~ → 확인 결과 이미 현재 슬라이드 뒤 (`weave.page.add` afterId) — stale 주석만 정정 (WI-184 ⑩)

## 5. 비-목표
- 타이핑-삽입 (D-1 기각측)
- off-canvas 파킹 (D-6 기각측)
- 코너 리사이즈 폰트 스케일 기본화 (D-4 기각측)
- 프로토타이핑식 트리거/이징 — 빌드는 추후 ordered-list 모델로만 (별도 기획)
