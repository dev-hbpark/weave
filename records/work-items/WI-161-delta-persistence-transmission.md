# WI-161 — 델타 저장 전송 (장애물 C): 변경분만 서버에 append + 스냅샷 컴팩션

Status: **Done — 델타 전송 구현 완료 (기본 ON, full-PUT 폴백). live KV e2e는 환경 차단 → 통합 테스트로 증명**
Owner: hbpark
Updated: 2026-06-10

> ℹ️ 번호 정정: 동시 진행된 page-bounded 세션이 WI-158·159(group-min-overlap, 커밋 73bf2d1)와 WI-160(rotated-box-page-clamp)을 선점 → [HANDOFF-001](../handoffs/HANDOFF-001-wi-number-collision.md) 요청대로 본 작업을 **WI-161**로 확정(코드 주석/경로/레코드/메모리 전부 갱신). 처음엔 WI-158→159→160로 잡았다 차례로 충돌.

관련: 선행 [WI-156](WI-156-delta-persistence-patch-completeness.md)(패치 완결성 토대) · [DR-112](../decisions/DR-112-delta-persistence-patch-completeness.md) · [DR-113](../decisions/DR-113-delta-transmission-design.md) · 후속/대안 [WI-028](WI-028-collaborative-sync.md)(Yjs CRDT, paused)

## Problem

저장 시 매 변경마다 전체 `Design`(수백 KB)을 POST `/api/designs`로 덮어쓴다(full-replacement, LWW).
사용자 요청: **변경분(패치)만 전송**해 대역폭·KV 용량 부담을 줄인다. WI-156에서 "패치 스트림 = 스냅샷
무손실 대체물"이 증명·타입잠금되어 토대가 마련됨. 본 WI는 그 패치를 실제로 서버에 전송한다.

## 설계 (상세 DR-113)

- **모델**: 권위 상태 = `스냅샷(전체 blob) + 패치 로그(append)`. 저장 시 패치만 전송(작음), 주기적으로
  전체 스냅샷으로 컴팩션(로그 비움). 로드 시 스냅샷 + 패치 로그를 받아 **클라이언트에서 replay**.
- **서버는 dumb**: agocraft 미탑재. 패치는 `string[]`(JSON) 배열로 KV에 저장(sync 엔드포인트와 동형).
- **replay**: agocraft `applyPatch`가 Change를 받으므로, 저장 Patch에 `{transactionId,timestamp,
  origin:system}`을 씌워 기존 `applyChangeToDocument`로 순차 적용.
- **동시성(공유 워크스페이스)**: `baseCount` 낙관적 가드 — 클라가 마지막으로 본 로그 길이를 보내고,
  서버 길이와 다르면 409. **충돌·오류·엔드포인트 부재 시 전체 스냅샷 저장(full-blob)으로 폴백** →
  현재 LWW보다 절대 나빠지지 않음(무회귀). 진짜 동시 협업은 WI-028(Yjs) 영역.
- **킬 스위치**: `DELTA_PERSIST_ENABLED` 단일 상수. 폴백이 견고해 켜져 있어도 엔드포인트가 없으면
  자동으로 today's full-blob 경로로 강등.

## 검증 제약

live KV/HTTP 라운드트립은 sandbox 네트워크 차단으로 직접 e2e 불가(WI-028과 동일 제약). 대응:
**순수 코어를 단위 테스트로 완전 커버** — replay round-trip(빈 doc + 패치 = 원본), append/conflict
가드, 컨트롤러(버퍼/flush/컴팩션/충돌→폴백). I/O 배선은 correct-by-construction + 실배포에서 플래그
검증.

## 단계 (구현 완료)

- **P1 (순수, 테스트됨)**: `delta/replay.ts`(+`applyPatchToDocument`/`replaySerializedPatches`), `delta/patch-log.ts`(append+conflict 순수함수), `delta/delta-controller.ts`(버퍼/flush/컴팩션/폴백). 테스트: patch-log 6 · controller 7 · replay 라운드트립 3.
- **P2 (I/O)**: `_lib/keys.ts` `designPatchesKey`; **`api/patches/[id].ts`**(GET/POST — `[id].ts`와의 dynamic-route 충돌 회피 위해 top-level 경로); `api/designs/index.ts` POST가 패치 로그 비움(컴팩션); `api/designs/[id].ts` GET이 `{design,patches}` 반환(1-request 로드) + DELETE가 로그 제거; `cloud-sync.ts` `fetchDesignWithPatchesCloud`/`pushDesignPatchesCloud`; `use-design.ts` 로드 replay(2곳); `use-weave-editor.ts` 델타-record 싱크 + storage flush 라우팅 + reset=boundary; `DesignPage.tsx` `deltaTransport` 배선.
- **P3**: `DELTA_PERSIST_ENABLED=true`(킬 스위치, 폴백 안전망). 통합 테스트 2(전체 루프 재구성 + 충돌 폴백 일관성).

## Build 완료 (2026-06-10)

검증(Continuous Self-Verification):
- `pnpm typecheck` ✅ · `pnpm test` ✅ **962 tests green**(델타 18: patch-log 6·controller 7·replay 3·integration 2) · `pnpm lint`(biome) ✅ · declarative/purity/inheritance ✅ · `pnpm build`(vite) ✅ · api 핸들러 standalone tsc ✅.
- **e2e(live KV/HTTP) 미실행** — sandbox 네트워크 차단(WI-028과 동일). 대신 **in-memory 서버 통합 테스트**가 record→flush→append→load-replay 전체 루프를 실제 명령 패치로 검증(스냅샷+로그 재구성 = 라이브 문서). 실배포에서 플래그로 최종 확인.

## 동작 방식 (요약)

편집 → ChangeStream → `changeToPatch` → controller 버퍼(즉시) → debounce(500ms) flush → **델타 append**
(`POST /api/patches/:id` with baseCount) / 임계 초과·첫 저장·충돌 시 **전체 스냅샷**(`POST /api/designs`,
로그 비움). 로드 → `GET /api/designs/:id`가 스냅샷+로그 → `replaySerializedPatches`로 재구성. reset →
스냅샷 경계. 모든 실패 경로 → full-PUT 폴백(무회귀).
