# WI-182 — 프레젠테이션 모드 편집 경험 기획검토

- **Status**: DISCOVERY — 동작 명세 완료, 구현 배치 승인 대기 (2026-06-11)
- **Date**: 2026-06-11
- **Origin**: 사용자 — "프레젠테이션 모드에서 제공할 편집경험을 기획검토부터"
  → **관점 피벗**: "기능 로드맵이 아니라, 편집하는 사용자의 조작 관점에서
  어떤 기능이 어떻게 동작해야 하는지를 리서치하고 반영"
- **Deliverable**: `docs/product/SLIDE_DECK_INTERACTION_SPEC.md` (driver)
  / `docs/product/SLIDE_DECK_EDITING_DISCOVERY.md` (1차 산출물 — PARKED 참고자료)
- **Related**: WI-180/181 (컨테이너·커맨드 검증), WI-033 (선택 모델), WI-153/163 (page-bounded)

## 진행

1. 1차: 기능-레벨 discovery (7-도구 기능 벤치마크 + 4-Phase 로드맵) → 오너
   피드백으로 **피벗** — 문서는 PARKED 마킹.
2. 2차: 조작-단위 리서치 — 5-도구(Keynote/PPT/GS/Canva/Figma Slides) 동작
   컨벤션 (머슬-메모리 계약 ~25항 + 분기 5곳) + weave 인터랙션 핸들러 전수
   감사(file:line) + 불확실 사실 직접 확인(마키=intersection,
   manipulation 에 aspect 처리 부재 등).
3. 종합 → 계약 vs 현재 대조표 (✅/🔶/❌), 분기 결정 D-1~D-6,
   구현 배치 3개(변형 모디파이어 / 슬라이드 키보드 워크플로 / 좌표·그룹·메뉴).

## 핵심 발견

- 선택 모델·스냅 가이드·정렬 8종·z-order·Esc 래더·넛지 = 이미 컨센서스 충족.
  (1차 문서의 "가이드 부재" 판단은 오류 — 동작 감사가 정정.)
- 갭 클러스터: ① Shift/Alt 변형 모디파이어 전무(축고정·복제드래그·비율고정·
  중심리사이즈) ② 슬라이드 단위 키보드 워크플로 전무(레일 키 내비·포커스
  규칙·다중선택·PageUp/Down) ③ paste 좌표 계약(office 5/5 = 크로스-슬라이드
  동일 좌표) 미충족 + Cmd+G 부재 + 우클릭 표준 메뉴 부재 + OS 이미지 paste 부재.
- 의도적 divergence 유지: 하드 클램프(D-6, vs 5/5 off-canvas 파킹), 툴숏컷(D-1).
- 감사 에이전트 오류 1건 교차 검증으로 차단: "Cmd+D 없음" → DesignPage:1756
  존재 + WI-181 e2e 검증 (editor-hotkeys.ts 만 본 탓).

## 다음 단계

- 오너 결정: D-2 (더블클릭 = 그룹 디센드 vs 줌핏), Batch 순서 승인.
- Batch 1 은 agocraft manipulation 경계 확인 → 필요 시 agocraft 측 작업 +
  재vendor (HANDOFF 또는 직접 수정 + DR).
