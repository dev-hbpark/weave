# DR-132 — free-placement 표면에도 비정규 de-list 적용 ({ allExcept } 정책 변형)

- **Status:** ACCEPTED (2026-06-13)
- **Work Item:** WI-207
- **Relates:** DR-130/WI-205(page 표면 축소 — 본 DR이 그 §트레이드오프 "FREE=all 유지" 부분을 확장),
  DR-131/WI-206(description dedup), DR-115/WI-168(AgentSurfacePolicy), DR-064,
  small-think DR-067(입력토큰 ≈ 턴수 × 정적 prefix)

## 컨텍스트

WI-205/DR-130은 광고 도구 스키마를 19개 de-list로 −13% 줄였으나 **page-bounded
flavor 한정**으로 보수 설계했다(FREE는 DR-064대로 `tools:"all"`). 운영 텔레메트리
확인 결과 **실사용 세션이 전부 free-placement**(agent-server ready 이벤트
`tools: 52/53` — page라면 ~30대) — 즉 −13%의 수혜가 실사용에 닿지 않고 있었다.
de-list 19개의 근거는 전부 "정규 funnel(weave-capabilities §6)이 이미 커버"라는
**flavor-중립** 논리이고 page-특정 논리가 아니다.

## 결정

1. **같은 19개 de-list를 free 표면에도 적용.** 단일 소스
   `NONCANONICAL_AGENT_TOOLS`(pieces/agent-surface.ts, 사유 주석 포함)로 추출 —
   page 트리아지(coverage test PAGE_EXCLUDED)는 이를 spread + page-특정 5개만
   별도 유지.
2. **정책 변형 `{ allExcept }` 추가** (AgentSurfacePolicy.tools 3번째 형태):
   등록 전부 pass-through MINUS 닫힌 de-list. free의 "새 커맨드는 에이전트에
   자동 노출" 철학(DR-064/DR-115)을 유지하면서 비정규 동사만 광고 제거 —
   closed allow-list로 바꾸면 이중 트리아지 부담 + 철학 변경이라 거부.
3. **bindAgentSurface는 lazy 라이브-레지스트리 뷰**로 구현: list/get/has가
   읽기 시점 필터(첫 렌더 시 레지스트리가 비어 있는 기존 제약과 합치),
   de-list 이름 exec는 advertisement 필터와 별개로 fail-closed
   (`agent-tool-not-exposed`) — 방어 2겹.

## 효과 (실측, 임시 프로브)

- free 광고: **50 → 31 도구**, 스키마 ~17,488 → **~14,656 tok 추정 (−16%)**.
  (chars/3.6 추정 — WI-205/206의 측정기와 절대값 비교 불가, 비율 참조)
- WI-206 dedup은 base 카탈로그 수정이라 free에 이미 적용 — 본 변경과 합산 효과.

## 거부한 대안

- **free를 closed allow-list로**: 모든 신규 커맨드를 두 표면에서 이중 트리아지
  — DR-115가 free에 의도한 "자동 노출" 철학 파기. de-list만 닫는 `allExcept`가
  결정의 형태와 일치.
- **레지스트리 등록 자체에서 제거**: UI가 같은 커맨드를 쓴다(Rule 4 단일
  레지스트리). 광고 표면만 정책이다(DR-115 §전제).

## 트레이드오프

free에서 de-list 동사의 직접 호출이 사라진다 — 전부 정규 도구로 도달 가능
(WI-205와 동일 논거). 품질 게이트는 WI-206과 동일하게 라이브 운영 측정
(HANDOFF-029 재측정에 합산)으로 확인; 회귀 시 `FREE_AGENT_SURFACE`를
`tools:"all"` 한 줄로 롤백.
