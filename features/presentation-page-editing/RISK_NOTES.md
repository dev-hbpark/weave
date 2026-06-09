# Presentation / Doc Page-Bounded Editing — Risk Notes (WI-153)

레코드: WI-153 · FR-024 · DR-111.

## R1 — bleed/클립 정합 (편집 vs Present vs Export)
영향: 中. 세 경로의 클립 경계가 어긋나면 WYSIWYG 깨짐. 기존 "불릿 bleed"는 의도 기능
(`viewport-cull-context.ts:24`)이라 하드 클립이 기존 디자인을 바꿀 수 있음.
완화: bleed 허용 + 가장자리 클립으로 확정(D5/D9) → 기존 bleed 보존하며 경계에서만 잘림. P5에서 세 경로
클립 지점을 페이지 박스로 단일화 + 시각 회귀 확인.

## R2 — 에이전트(Aku) 페이지 외부 배치
영향: 中. 프레젠테이션 포맷에서 Aku가 root/페이지 밖에 아이템을 두면 page-bounded 불변이 깨짐.
완화: WI-150 `enforceContainerIsFrame` 가드 + 기본 containerId=활성 페이지 + 포맷별 프롬프트(P4). 가드가
이미 leaf 부모를 거부하므로 결합 효과.

## R3 — 무한 캔버스 포맷 회귀
영향: 中. 레지스트리 전환(P1) 중 mixed/canvas-board의 팬/줌·핸드툴 동작이 바뀌면 광범위 회귀.
완화: P1은 동작 변화 0 목표(boolean→config 동치 치환). 기존 editor 테스트 + 스냅샷 + 수동 확인으로 게이트.

## R4 — 소프트 클램프 × 회전/멀티셀렉트
영향: 低~中. 회전된 박스의 AABB-vs-페이지 정합, 다중 선택 그룹 이동의 min-overlap이 까다로움.
완화: 비회전·단일 우선 구현(P3), 회전/그룹은 후속. 소프트 클램프는 "분실 방지"가 목적이라 근사로 충분.

## R5 — 페이지 추가/복제 × presentationOrder 정합
영향: 低. 새 페이지가 presentationOrder/시퀀서/카메라 락과 일관돼야 함.
완화: presentationOrder가 이미 트리 독립이고 reconcile 존재(`effectivePresentationOrder`). 추가/복제는 기존
프레임 add + order 갱신 경로 재사용.

## R6 — 범위 2포맷 동시(slide-deck + doc-page)
영향: 低. 두 포맷 동시 검증 부담.
완화: 동일 page-bounded 프리셋 공유라 추가 비용 작음. 차이(툴바 등)는 P5에서만 분기.

## 게이트
각 단계 SVL(타입체크 + editor/aku 테스트 + 브라우저 확인) 통과 후 다음 단계. P1은 회귀 0 확인이 핵심.
