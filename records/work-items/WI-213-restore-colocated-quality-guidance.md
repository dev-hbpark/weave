# WI-213 — 트림 품질 회귀 복구: per-kind 품질 가이드 콜로케이션 + 편집노트 full 복원 (1단계)

- **Status:** DONE (구현·단위검증 완료 · 라이브 육안 검증 운영 대기) · 2026-06-13
- **DR:** DR-136 (DR-131/DR-134 부분 supersede)
- **Relates:** WI-206/DR-131(편집노트 슬림 — 되돌림), WI-209/DR-134(§N 포인터화 — 되돌림),
  WI-205/DR-130·WI-207/DR-132(도구 de-list — **유지**), WI-212(회귀 시그니처 2건 — 보존),
  HANDOFF-029, small-think DR-067
- **Origin:** 운영자 DR-048 육안 게이트 판정 — "경량화 이후 전반적 완성도가 떨어졌다.
  Claude·OpenAI 두 모드 모두." 로그상 하드 에러(item.add 거부 17건·stale-id 3건)는 빙산의
  일각이고, 본질은 두 모델 공통의 **완성도 저하**.

## 진단

트림이 "중복 텍스트"와 "콜로케이션된 가이드"를 혼동했다.

- **WI-209/DR-134**: 같은 per-kind 모델이 itemKinds·item.add·domain에 3중 기술된다고 보고
  itemKinds의 품질 산문(text SIZING/PLACEMENT/COLOR, frame 슬라이드·배경·레이아웃 불릿,
  chart STYLE, line/poly 예외)을 domain §N 포인터로 치환. **그러나 콜로케이션 자체가 품질을
  떠받치고 있었다** — 모델은 해당 kind를 추론하는 바로 그 순간 규칙을 봐야 하고, §N 교차참조는
  두 모델 모두 불완전하게 수행한다(WI-212의 GPT §3 추적 실패가 첫 사례, 이제 Claude에서도
  미묘한 완성도 저하).
- **WI-206/DR-131**: 편집 도구(item.update/items.update) attrs를 slim 포인터로. 다듬기/보완
  패스의 품질이 떨어짐. DR-131 자체가 "편집 품질 회귀 시 롤백"을 운영 게이트로 명시했다.
- **WI-205/207 de-list는 무혐의**(WI-212 확정): de-list된 마이크로옵 사용 이력 0.

## 변경 (1단계 — 알려진-양호 상태로 복원)

- `apps/web/src/features/aku/agent/weave-capabilities.ts` + `weave-command-schemas.ts`를
  **트림 직전(`6f27e01^`) 콘텐츠로 복원** — WI-206(편집노트 슬림) + WI-209(§N 포인터화)의
  프롬프트-콘텐츠 변경을 모두 되돌림. itemKinds 품질 산문 콜로케이션 + item.update/items.update
  full `ATTRS_WITH_TEXT_NOTE` + CHART_ATTRS_NOTE full 복귀.
- **WI-212 보존**: text PLACEMENT의 신규 사실(명시 frame일 때 width 0/근사-0 → add REJECTED)만
  복원된 인라인 산문에 1줄 graft(포인터 형태가 아닌 콜로케이션 형태로). batch op명 정규화
  (`document/commands.ts`)는 별도 파일이라 그대로 유지.
- **WI-205/207 de-list 유지**: 도구 표면 allow-list는 `document/editor-mode/pieces/agent-surface.ts`
  로 별도 파일 — 본 복원이 건드리지 않음. 광고 도구 수 감소(50→31)는 그대로.

## 토큰 트레이드오프 (의도된 것)

- 복원량 ≈ +6–7K tok/턴 (WI-206 ~4.4K + WI-209 ~2.5K 환원). capabilities 67,955→74,735 chars.
- 유지 절감: WI-205/207 도구 de-list(광고 −16%) + 순수 중복 제거분은 트림 직전 상태에 이미 없음.
- 예측: crPerTurn 개선이 HANDOFF-029의 −33%/−16.5%에서 ~−8% 수준으로 축소. **품질을 위해
  절감의 약 절반을 반납** — 운영자 승인된 트레이드오프. 2단계(동적 광고)가 이를 회수한다.

## SVL (Continuous Self-Verification)

- `tsc --noEmit` 클린.
- biome 클린(weave-capabilities.ts, weave-command-schemas.ts).
- 단위: aku/agent 20파일 191 green + commands.test 151 + agent-surface.coverage green (de-list
  무회귀) + command-schemas coverage/layout/kit/chart green. 슬림 ATTRS_EDIT_NOTE 참조 0건
  (decommission 깨끗 — 별도 정리 불요).
- **라이브 육안 게이트(대기)**: Vercel push 후 Claude·OpenAI 양 모드에서 완성도 회복 + item.add
  거부/stale-id 재발 여부 확인(HANDOFF-029 합산 게이트와 동행). 미회복 시 영역별 추가 조정.

## 후속 — 2단계 (별도 WI)

동적 광고: 현재 태스크가 건드리는 kind/tool에만 full 가이드, 나머지 slim. 평균 토큰 손실 없이
완성도 유지 — 1단계의 토큰 반납을 회수하는 구조적 해법. 1단계 라이브 검증 통과 후 착수.
