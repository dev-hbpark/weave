# WI-187 — 크로스탭 마커 건강도 전파

- 상태: DONE (2026-06-12)
- 출처: WI-186 잔여 ("마커 건강도는 탭-로컬 — 크로스탭 수신 탭은 레거시 라우팅 유지")
- 결정: DR-123
- 선행: WI-186 / DR-122 (마커 = 최신성 오라클, 건강도 폴백)

## 문제

마커 건강도(`unknown|ok|failed`)가 탭-로컬이라, 크로스탭 transports로
페이로드만 받은 탭은 Cmd+V 키다운이 레거시 프로브 라우팅(내부 우선)에
머물렀다 — 그 탭에서는 "weave copy 이후에 복사된 OS 이미지가 이긴다"는
recency 해소가 비활성.

## 해결 (상세는 DR-123)

OS 클립보드는 머신-전역이므로 **어느 탭의 마커 쓰기가 성공했든 마커
라우팅은 모든 탭에서 신뢰 가능**하다. `mountMarkerHealthTransport()` —
전용 BroadcastChannel(`weave.clipboard.marker-health.v1`)로 로컬 건강도
천이(ok/failed)를 방송, 수신 탭이 채택(최신 천이 우선 = 로컬 쓰기와 동일
시맨틱). `useClipboardCommands`의 기존 transports effect에서 마운트/해제.

- ok만이 아니라 **failed도 전파**: 어느 탭의 쓰기가 실패하면 OS 클립보드가
  최신 내부 copy를 반영하지 않으므로, 모든 탭이 레거시로 격하되는 것이
  올바른 안전 방향.
- 채택은 재방송하지 않음(에코 루프 없음). BroadcastChannel 부재 환경은
  무동작 — 기존 탭-로컬 건강도(WI-186 동작)로 잔존.
- e2e 셰임: DEV-게이트 `__weaveMarkerRoutingActive()` (DesignPage 진단 블록).

## 검증

- 단위: 건강도 transport 3건 (원격 채택/무효 드롭, 로컬 천이 방송, dispose)
  — `os-clipboard-marker.test.ts`, 전체 vitest 1197 green.
- e2e `clipboard-os-marker.spec.ts` ⑤: 탭 A copy → 탭 B
  `__weaveMarkerRoutingActive()` true 폴링 → B에서 OS 이미지 덮어쓰기 →
  B의 Cmd+V가 이미지를 ingest (WI-187 이전엔 내부 shape가 paste됐을 경로).
- tsc / biome / build / 게이트 green.

## 잔여

- 없음 (WI-186 잔여 1번 항목 종결).
