# DR-113 — 델타 저장 전송 설계 (장애물 C)

Status: **Accepted** (2026-06-10)
Context: [WI-161](../work-items/WI-161-delta-persistence-transmission.md) · 선행 [WI-156](../work-items/WI-156-delta-persistence-patch-completeness.md)/[DR-112](DR-112-delta-persistence-patch-completeness.md)(패치 완결성 토대) · 대안 [WI-028](../work-items/WI-028-collaborative-sync.md)(Yjs CRDT, paused)

## Context

저장이 매 변경마다 전체 `Design`을 POST `/api/designs`로 덮어썼다(full-replacement, LWW). WI-156에서
"패치 스트림 = 스냅샷 무손실 대체물"이 증명·타입잠금되어, 이제 그 패치를 실제로 전송해 대역폭·KV 부담을
줄인다. 공유 익명 워크스페이스(계정/스코프 없음, 모두가 같은 KV 키)라는 제약 위에서 설계한다.

## Decisions

### D1 — 권위 상태 = `스냅샷 + 패치 로그(append)`; 서버는 agocraft-free

전체 스냅샷 blob(`designKey`)에 더해, 변경 패치를 `string[]`(JSON)로 `designPatchesKey(id)`에 append.
서버는 패치를 **파싱하지 않는다**(불투명 문자열) — 직렬화/replay는 클라이언트 소유. sync 엔드포인트의
검증된 패턴(`string[]` KV) 재사용. 로드 = 스냅샷 GET(+로그) → 클라이언트가 replay.

**근거**: 서버에 agocraft를 올리지 않아 함수 번들이 가볍고, replay 로직이 클라이언트 한 곳(이미 reducer
보유)에 집중된다. 패치는 이미 JSON 안전(WI-156).

### D2 — replay = Patch에 `{transactionId,timestamp,origin:deserialize}`을 씌워 기존 reducer로 폴드

`applyPatch`(=`applyChangeToDocument`)가 `Change`를 받으므로, 저장 Patch를 deserialize-origin Change로
감싸 순서대로 적용. **in-session 편집과 동일한 reducer** → 같은 결과(라운드트립 테스트로 잠금).

### D3 — 컴팩션: 전체 스냅샷 저장이 곧 로그 비움

`COMPACT_THRESHOLD`(50) 도달 시 / 첫 저장 / 폴백 시 전체 스냅샷을 보내고, POST `/api/designs`가
`designPatchesKey`를 `[]`로 비운다. 스냅샷이 전체 문서를 담으므로 버퍼/로그를 **항상 안전하게 대체**.
서버 backstop `MAX_PATCH_LOG_ENTRIES`(500)로 무한 성장 차단.

### D4 — 동시성: `baseCount` 낙관적 가드 + 전체 스냅샷 폴백 (절대 LWW보다 나빠지지 않음)

클라가 마지막으로 본 로그 길이(`baseCount`)를 함께 보내고, 서버 길이와 다르면 **409 conflict**. 클라는
충돌·overflow·엔드포인트 부재·네트워크 오류 **모든 실패 경로에서 전체 스냅샷 저장으로 폴백** — 이는 정확히
오늘의 LWW다. 따라서 happy path(단일 편집자)는 델타, 경합 시 LWW로 **무회귀** 강등. 진짜 동시 협업(문자
단위 머지)은 [WI-028](../work-items/WI-028-collaborative-sync.md)(Yjs CRDT) 영역 — 본 WI 범위 밖.

### D5 — `DELTA_PERSIST_ENABLED` 킬 스위치, 기본 ON (폴백이 안전망)

견고한 폴백 덕에 엔드포인트가 없는 환경(미배포·오프라인)에서도 자동으로 today's full-PUT로 강등되므로
기본 ON이 안전. 문제 시 단일 상수로 즉시 차단.

## 검증 제약 (정직성)

live KV/HTTP 라운드트립은 sandbox 네트워크 차단으로 직접 e2e 불가(WI-028과 동일). 대응: **순수 코어 +
통합(in-memory 서버) 테스트로 전 경로 커버** — append/conflict, controller(버퍼/컴팩션/폴백), replay
라운드트립, **그리고 record→flush→append→load-replay 전체 루프 통합 테스트**가 실제 명령이 만든 패치로
스냅샷+로그 재구성이 라이브 문서와 일치함을 증명. 실배포에서 플래그로 최종 확인.

## Consequences

- 일반 편집 저장 페이로드가 수백 KB → 패치 몇 개(수 KB)로 감소. KV 용량 한계 완화.
- 후속: rename/canvas-resize 기능 추가 시 그 명령이 `document.attrs` 패치를 내야 envelope도 델타에 반영
  (WI-156/DR-112). 진짜 협업은 WI-028.
- 라우팅: 패치 엔드포인트는 `[id].ts` 파일과의 dynamic-route 충돌 회피 위해 `/api/patches/:id`(top-level).
