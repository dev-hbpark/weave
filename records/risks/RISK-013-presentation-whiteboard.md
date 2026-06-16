# RISK-013 — 프레젠테이션뷰 화이트보드 (ephemeral ink + 멀티유저)

- 관련: WI-239, DR-154, FR-025, WI-028(paused infra)
- 등급: **MEDIUM** (Phase 1은 LOW — 휘발성·읽기전용·신규 격리 surface, 보안/법무 노출 없음 / 비용·인프라 노출은 Phase 2에 집중)

## R1 — Phase 2 멀티유저 인프라 (DOWNGRADED: HIGH→LOW(비용)/MEDIUM(ops), FR-026)

~~실시간 멀티유저는 `SYNC_ENABLED = false`인 paused 인프라(Upstash 비용)에 의존.~~
**FR-026에서 재평가 — 이 전제는 틀림:** 기존 HTTP-poll 전송은 **문서**만 나르고 **awareness(잉크)는 네트워크로 안 나감**(provider의 Awareness 객체가 로컬 전용). present는 읽기전용이라 문서 CRDT 불필요, 잉크는 휘발성이라 Upstash 미사용 → **WI-028 정지 사유(폴링 비용)는 Phase 2에 적용 안 됨.**
- 해소: 비용 게이트 **사실상 제거** — 무료 상시가동 호스트(Oracle Always-Free VM / small-think Cloudflare-tunnel 박스) 위 thin awareness-only WS relay = **마진 비용 ≈ $0**(DR-054: 지속 WS는 관리형 PaaS 무료티어 전부 실패, 무료 적합은 always-on VM뿐).
- 완화: 잉크 브로드캐스트는 throttle된 포인트 배치(~20–30Hz)로 커서 수준 부하.
- 잔여(진짜 게이트, 비용 아님): **ops**=안정 `wss://` 엔드포인트(ephemeral quick-tunnel 금지, named tunnel/Caddy+도메인 필요)+재접속/grace. **product**=라이브 세션/룸 모델(최소=발표자 일방 브로드캐스트).

## R2 — present 라이브 입력 피드백루프 (MEDIUM)

워크스페이스 기록상 present 라이브 입력은 반복되는 함정(observer/엔진 충돌, revert 빈발).
- 완화: 잉크는 **read-only Stage 위 컴포지트 오버레이** → 레이아웃 엔진과 결합 없음. `editor.exec` 미사용.
- 완화: **라이브 검증 필수**(self-verification loop) — 유닛만으로 머지 금지.
- 잔여: 카메라 transform과 잉크 투영 동기화는 라이브로만 확증 가능.

## R3 — 잉크 모드 ON이 발표 내비를 가로챔 (MEDIUM)

포인터 캡처가 켜지면 클릭-투-어드밴스/키보드 내비를 삼킬 수 있음(1-step 고사 위험).
- 완화: 모드 게이트 단일소스 `useInkModeActive()` — OFF일 때 포인터 핸들러 미장착, 기존 present 동작 byte-for-byte 불변.
- 완화: 회귀 e2e — "잉크 OFF → ArrowRight 전진·스트로크 미캡처" 가드.
- 잔여: 없음(게이트로 차단).

## R4 — 줌/팬 중 잉크 좌표 드리프트 (MEDIUM)

카메라가 움직이는 present에서 잉크가 슬라이드에서 떨어질 수 있음.
- 완화: **design-space 저장 + clientToLocal 재사용**(PresenceCursors와 동일 투영) → 콘텐츠에 고정, 원격 뷰포트 호환(Phase 2).
- 잔여: 스케일 극단(초고배율)에서 스트로크 굵기 시각 보정은 후속 튜닝.

## R5 — Phase 2 awareness 잉크의 본질적 손실성 (LOW)

awareness는 best-effort·비영속 → 중간 입장 뷰어는 그 시점 이후 잉크만 봄, 재생 없음.
- 완화: 휘발성 계약과 일치(DR-154) — 라이브 발표용, 영속 산출물 아님. UX 문구로 기대치 설정.
- 잔여: 영속/재생이 필요해지면 WI-028 문서 CRDT 영역으로 별도 범위 — 현재 명시 제외.

## R6 — 멀티유저 잉크의 그리기 권한/낙서 남용 (LOW, Phase 2)

모두가 그릴 수 있으면 뷰어가 화면을 낙서로 덮을 수 있음.
- 완화: **MVP=발표자 일방 브로드캐스트(WI-240/DR-155)** → 뷰어는 그리기 불가, 남용 표면 0. 액터별 색(`colorForActor` 존재)+발표자 clear-all은 양방향 후속에서.
- 잔여: 양방향 화이트보드(전원 그리기) 후속 WI로 이월.

## R7 — present 모드의 신규 opt-in WS 연결 표면 (LOW, Phase 2 / WI-240)

읽기전용 present 페이지가 라이브 세션 시 외부 `wss://` 연결을 염 → 신규 연결/공격 표면.
- 완화: **opt-in 한정** — "Go live"/`?session` 일 때만 연결, 절대 자동연결 안 함 → 기본 present 경로는 무변경·무연결.
- 완화: roomId가 유일 capability(unlisted, 비밀 아님), 글로벌-익명 모델 그대로. 릴레이는 도메인 무지·비영속·바운드(룸/멤버/메시지/레이트 캡, HANDOFF-032).
- 완화(ops): ephemeral quick-tunnel URL은 세션 중엔 안정, `cloudflared` 재시작 시 회전→`VITE_WEAVE_RELAY_URL` 갱신+재배포(named tunnel+도메인이면 해소).
- 잔여: 선택적 공유 토큰 게이트는 HANDOFF-032 회신에서 확정.
