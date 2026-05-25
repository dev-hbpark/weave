# WI-028 — Collaborative Editing Infrastructure (`@agocraft/sync`)

## Metadata

| Field | Value |
|---|---|
| ID | WI-028 |
| Status | **Phase 1-6 full wire complete** — agocraft sync core + HTTP-poll provider + weave API routes + bidirectional host wire (write + read) + presence components mounted in DesignPage + snapshot policy + IndexedDB offline. End-to-end collaborative editing functional. |
| Date opened | 2026-05-25 |
| Trigger | 사용자 — "옵션 C 로 제대로 만들고 싶어. 동시 편집 관련 최적화된 관리를 ago 라이브러리에 존재" |
| Cross-references | OS-root Rule 4 (loose change coupling), Rule 5 (round-trip integrity), Rule 6 (declarative branching), DR-005 (capability dispatch), agocraft `@agocraft/core` Change/Patch model |

## 1. 동기

현재 weave 의 storage 는 매 mutation 마다 전체 design snapshot 을 통째로 PUT 한다 (localStorage / KV 모두 full replacement). frame 한 개 위치만 바뀌어도 800 KB design 전체가 전송 — payload 한계 (413) + KV 한계 (Upstash 1MB / 10MB) 의 단일 fail point. 또한 동시 편집 (다중 탭 / 다중 사용자) 시 last-write-wins 충돌 가능.

**해결**: **CRDT 기반 (Yjs) collaborative editing**. agocraft Document 와 Yjs Y.Doc 의 양방향 매핑 — local mutation 이 Y.Doc transaction → CRDT update (binary delta) → 다른 actor 들이 자동 merge. 협업 인프라는 agocraft 측 framework 로 — 미래 sister project 들이 같은 인프라 위에서 협업.

## 2. 핵심 설계 결정

### 2.1 Patch-based event sourcing

agocraft 는 이미 `Patch` (`item.attrs` / `item.children` / `unit.attrs`) + `invertPatch` + `Change` (`transactionId` / `timestamp` / `origin`) 모델 보유. WI-028 는 그 위에 *전송 가능한* 단위 `PatchEnvelope` 정의:

```ts
interface PatchEnvelope {
  readonly patchId: string;       // unique within actor's stream
  readonly actorId: ActorId;
  readonly clock: LamportClock;   // causal order
  readonly transactionId: TransactionId;  // groups multi-patch txn
  readonly patch: Patch;
  readonly committedAt: number;   // wall clock (display only)
}
```

EventLog 는 `PatchEnvelope[]` 의 append-only sequence.

### 2.2 Snapshot policy

매 N patches (default 50) 또는 매 T seconds (default 30) → full state snapshot 저장. Load 시 latest snapshot + 그 이후 patches replay = current state. patches log 는 snapshot 이후 부분만 retain (compaction).

### 2.3 Conflict resolution: **CRDT (Yjs)** — 사용자 확정 (2026-05-25)

| 전략 | 채택? | 이유 |
|---|---|---|
| **Operational Transform** | ✗ | 매우 복잡 / 잘 알려진 corner case / agocraft Patch 모델과 fit 안 함 |
| **Full CRDT (Yjs)** | **✅** | 검증된 CRDT 알고리즘 (ItemBlock / Awareness / GC) / ESM + sideEffects false / ~50KB gzipped / 풍부한 provider ecosystem (WebSocket / WebRTC / IndexedDB) |
| **Automerge** | ✗ | ~200KB gzipped 라이브러리 크기 / immutable 모델이 agocraft mutable Document 와 fit 떨어짐 |
| **Causal + LWW per-attribute** | ✗ | hard conflict 시 사용자 prompt 필요. CRDT 가 정통 |

**핵심 architecture — Yjs 가 source of truth, agocraft Document 는 derived view**:

```
local mutation
  → editor.exec("weave.X", input)
  → Command.run() returns Patch[]
  → SyncEngine.applyLocalPatch(patches)
      ├─ Y.Doc.transact(() => { /* apply patches as Y.Map / Y.Array ops */ })
      │   → Yjs internally produces CRDT update (binary blob)
      └─ Y.Doc observer fires → derive agocraft Document → emit on ChangeStream
                                                          → React re-render

remote awareness
  → Yjs provider receives binary update
  → Y.Doc.applyUpdate(bytes) → CRDT-resolved state
  → Y.Doc observer fires → derive agocraft Document → emit ChangeStream(origin: "remote")
                                                       → React re-render
```

**왜 Y.Doc 가 source of truth**:
- CRDT 가 *자동* 으로 모든 concurrent edit 합병 — LWW 의 hard-conflict prompt 불필요
- Yjs 의 binary update 가 압축적 (1 byte cursor move 같은 minimal delta 지원)
- offline 편집 후 online sync 시 자동 merge — 사용자 개입 0
- Awareness API (cursor / selection 공유) ready-made

**agocraft Document ↔ Y.Doc 매핑** (DR-028 별도 발행):

```
Document.items     ↔  Y.Map<string, Y.Map>  (id → item)
Item.attrs         ↔  Y.Map<string, unknown>
Item.units         ↔  Y.Array<Y.Map>
Item.children      ↔  Y.Array<Y.Map>  (ItemId references)
DocumentMeta       ↔  Y.Map (top-level metadata)
```

agocraft 의 Patch 가 Y.Doc transaction 으로 변환되는 *adapter layer* — Patch.kind 별로:
- `item.attrs` → `yItem.get("attrs").set(key, value)` per attr
- `item.children` (added) → `yChildren.push([yNewItem])`
- `item.children` (removed) → `yChildren.delete(index, 1)`
- `unit.attrs` → 동일

역방향 (Y.Doc observer → agocraft Document) 도 한 adapter — observer event 의 `change.target` 으로부터 Patch 재생산.

### 2.4 Transport — Yjs Provider abstraction

Yjs 가 이미 자체 Provider model 보유 — `y-websocket`, `y-webrtc`, `y-indexeddb`, custom. agocraft 의 transport interface 는 Yjs Provider 를 wrap:

```ts
interface SyncProvider {
  /** Connect provider to the underlying Y.Doc. */
  connect(): void;
  disconnect(): void;
  /** Awareness for presence (cursor / selection / mode). */
  readonly awareness: import("y-protocols/awareness").Awareness;
  /** Current connection status. */
  readonly status: "disconnected" | "connecting" | "connected";
  subscribe(listener: (status: SyncProvider["status"]) => void): () => void;
}
```

호스트가 구체 provider 선택:
- `InMemoryProvider` — test / single-process (Phase 1)
- `HttpSseProvider` — Vercel API routes + Upstash pubsub for Y.Doc update broadcast (Phase 2)
- `WebSocketProvider` — `y-websocket` server (별도 host) (선택)
- `IndexedDBProvider` — `y-indexeddb` for offline persistence (선택)

**Vercel + Upstash 조합** (Phase 2 target):
- `POST /api/sync/update` — Yjs binary update 받아서 Upstash list 에 append + pubsub 으로 다른 클라이언트에 broadcast
- `GET /api/sync/state-vector` — 클라이언트의 state vector 보내고 missing updates 가져옴 (offline 복귀 시)
- `GET /api/sync/sse` — SSE 로 새 updates 실시간 push
- `GET /api/sync/snapshot/:id` — 주기 snapshot (Y.Doc.encodeStateAsUpdate) 받아옴

### 2.5 Identity & Awareness

- `ActorId` — `device-<uuid>` 또는 `user-<uid>`. Y.Doc clientID 와 매핑.
- **Y.Awareness** — ephemeral, 사용자별 state (cursor, selection, mode, color, name 등). Yjs 가 broadcast 처리.

### 2.6 Presence (Phase 4) — Y.Awareness 활용

Yjs 의 Awareness 모듈 그대로 사용. agocraft 는 thin wrapper:

```ts
interface PresenceState {
  readonly actorId: string;
  readonly name?: string;
  readonly color?: string;
  readonly cursor?: { x: number; y: number };  // design-space coords
  readonly selection?: ReadonlyArray<string>;  // selected item ids
  readonly mode?: string;
}
```

actor 가 `presence.setLocalState(...)` 호출 → Y.Awareness 가 broadcast → 다른 actor 의 `presence.subscribe(actors => ...)` 가 받음. 100ms throttle 자동 적용 (Yjs awareness 내부).

## 3. 패키지 구조 (agocraft `@agocraft/sync`)

```
packages/sync/
  package.json                  # depends on @agocraft/core + yjs + y-protocols
  tsconfig.json
  tsup.config.ts
  src/
    index.ts                    # barrel — public API
    types.ts                    # PresenceState, SyncProvider, SyncEngineDeps
    actor.ts                    # ActorId, color/name defaults
    ydoc-bridge.ts              # agocraft Document ↔ Y.Doc bidirectional mapping
    patch-to-yjs.ts             # apply agocraft Patch as Y.Doc transaction
    yjs-to-patch.ts             # Y.Doc observer → agocraft Patch[]
    sync-engine.ts              # orchestrator: editor ↔ Y.Doc ↔ provider
    snapshot.ts                 # Y.Doc.encodeStateAsUpdate snapshot persistence
    presence.ts                 # Y.Awareness wrapper
    provider-in-memory.ts       # InMemoryProvider for tests
    *.test.ts
```

dependencies:
- `@agocraft/core` — workspace
- `yjs` — `^13.6.x`
- `y-protocols` — `^1.0.x` (Awareness)

dependency-cruiser: `@agocraft/sync` → `@agocraft/core` + `yjs` + `y-protocols` 만. renderer / editor / domain-* 무의존.

## 4. Phase 분해

### Phase 1 ✅ — agocraft sync core (이번 사이클)
- `@agocraft/sync` 패키지 신설 + build/tsup/depcheck
- Yjs + y-protocols dependency 추가
- `agocraft Document ↔ Y.Doc` 양방향 mapping (ydoc-bridge.ts / patch-to-yjs.ts / yjs-to-patch.ts)
- SyncEngine — local Patch → Y.Doc / Y.Doc 변경 → ChangeStream emit
- SnapshotPolicy — `Y.encodeStateAsUpdate` 기반 압축 snapshot
- Y.Awareness 기반 PresenceChannel
- InMemoryProvider (test 용 — Y.Doc 들 사이 binary update relay)
- 30+ vitest — 양방향 mapping / concurrent edit / snapshot round-trip / presence
- `pnpm verify` 그린

### Phase 2 ✅ — HTTP poll transport (Vercel)
**채택 결정**: SSE 대신 long-poll. Vercel function timeout / Edge function complexity 회피. polling 이 EventSource 의 reconnect 책임을 대체. 정통 SSE 는 후속 WI 에서 검토.

구현 완료:
- `@agocraft/sync` `createHttpPollProvider({ yDoc, endpoint, pullIntervalMs?, pushDebounceMs?, fetch?, requestTimeoutMs? })`
- weave Vercel API routes:
  - `POST /api/sync/[roomId]/push` — base64 Yjs update → KV append
  - `GET /api/sync/[roomId]/since?vector=…` — server side `Y.encodeStateAsUpdate(yDoc, remoteVector)` 로 missing delta 응답
  - `GET / POST /api/sync/[roomId]/snapshot` — fetch/store latest snapshot + state vector
- KV schema (`_lib/keys.ts`):
  - `shared:sync:<roomId>:updates` — list of base64 binary updates
  - `shared:sync:<roomId>:snapshot` — base64 snapshot
  - `shared:sync:<roomId>:vector` — base64 state vector
- weave 측에 `yjs ^13.6.18` + `y-protocols ^1.0.6` + `@agocraft/sync` 의존 추가 + re-vendor

### Phase 3a ✅ — weave host wire (write side)
구현 완료:
- `useWeaveEditor({ ..., sync: { roomId } })` opt-in
- 한 design 당 Y.Doc + HttpPollProvider + SyncEngine 자동 생성
- Y.Doc 첫 mount 시 `seedYDocFromDocument(yDoc, doc)`
- ChangeStream subscriber 가 매 local Patch 를 `applyPatchToYDoc(yDoc, patch)` 호출 (Rule 6 single-site permitted exception — `changeToPatch(c: Change)` switch on c.type)
- Y.Doc observer → provider → POST `/api/sync/<roomId>/push`

### Phase 3b ✅ — remote → React state (read side)
구현 완료:
- `useDesign` 에 `replaceDocument(next: AgocraftDocument)` 추가 — History bypass (remote 는 우리가 undo 할 대상 아님)
- `useWeaveEditor` deps 에 `replaceDocumentFromRemote?` 추가, ref-mirror
- useEffect 안에서 `yDoc.on("update", (update, origin) => { if (origin === "agocraft.sync.remote") replaceDocumentFromRemote(deriveDocumentFromYDoc(yDoc)); })`
- DesignPage 가 `replaceDocumentFromRemote: replaceDocument` 전달
- 기존 full-PUT 경로 (storage.ts / cloud-sync.ts) 는 dual-active. production telemetry 후 deprecation

### Phase 4 ✅ — Presence UI 컴포넌트 + DesignPage mount
구현 완료:
- `apps/web/src/document/presence/PresenceCursors.tsx` — `SyncEngine.presence.subscribe` → SVG cursor + actor 이름 + per-actor color. 새 `project?` prop 으로 design-space → host-pixel 변환 위임 (host 가 자신의 plane scale 알기 때문).
- `apps/web/src/document/presence/use-presence-local-cursor.ts` — pointermove throttle (60ms ≈ 16Hz) → `presence.setLocal({ cursor: { x, y } })`
- **DesignPage mount 완료**: `<PresenceCursors engine={sync.engine} project={designToHost} />` 가 `<main>` 안 absolute overlay, `usePresenceLocalCursor({ engine, hostRef, clientToLocal })` 가 design-space 좌표 broadcast.
- `screenToDesign` + `designToHost` 가 동일한 frame-sampling 로직 inverse 로 페어 — infinite-canvas zoom 상태에서도 정렬.

### Phase 5 ✅ — Snapshot policy + useWeaveEditor wire
구현 완료:
- `@agocraft/sync` `createSnapshotPolicy({ yDoc, upload, thresholdUpdates?, thresholdMs? })`
- updates count ≥ 50 또는 elapsed ≥ 60s → uploader 호출 → POST `/api/sync/<roomId>/snapshot` (snapshot + state vector base64)
- `policy.snapshotNow()` on `pagehide` 이벤트 — 탭 닫기 직전 flush
- useWeaveEditor 안에서 syncBundle 와 함께 mount, cleanup 시 dispose

### Phase 6 ✅ — IndexedDB offline persistence + useWeaveEditor wire
구현 완료:
- `apps/web/src/document/sync/offline-persistence.ts` — `attachIndexedDbPersistence(yDoc, roomId)` async, dynamic-import `y-indexeddb ^9.0.12` (browser-only safe)
- useWeaveEditor syncBundle effect 안에서 fire-and-forget. catch 절이 SSR / private mode 등 IndexedDB 사용 불가 환경 silent fallback.
- cleanup 시 handle.dispose()
- CRDT 의 멱등 merge 덕에 first-pull + IndexedDB hydrate 의 race 가 안전 (어느 쪽이든 같은 최종 상태로 수렴)

## 5. weave 측 통합 시점 (Phase 3)

현재 코드 흐름:
```
mutation → editor.exec → ChangeStream → applyChange → setDesign → saveDesign (full PUT)
```

Phase 3 후 (Yjs 기반):
```
mutation
  → editor.exec("weave.X", input)
  → Command.run() returns Patch[]
  → SyncEngine.applyLocalPatch(patches)
      ├─ Y.Doc.transact(() => apply patches as Y.Map / Y.Array ops)
      │     ↓
      │  Yjs CRDT update (binary)
      │     ├─ SyncProvider.push(update)  → API → Upstash list + pubsub
      │     └─ local Y.Doc observer
      │          ↓ derive agocraft Document
      │          → ChangeStream.emit(change, origin: "local")
      │          → React re-render
      └─ (snapshot every N patches → snapshot.ts → KV save)

remote update arrives (SSE):
  → SyncProvider receives binary update
  → Y.Doc.applyUpdate(bytes)  → CRDT auto-merge
  → local Y.Doc observer fires
    → derive agocraft Document
    → ChangeStream.emit(change, origin: "remote")
    → React re-render (다른 사용자의 변경이 즉시 화면에 반영)
```

Origin tagging (`local` / `remote` / `system`) 이 ChangeStream subscriber 의 filter 로 작동 — render path 는 모두 적용, persist path 는 local 만 push (loop 방지).

## 6. 위험 / Trade-off

| 측면 | 평가 |
|---|---|
| **agocraft 의 큰 새 surface** | sync 패키지 + Phase 2~6 의 host 측 wire. 1~2주 작업 |
| **Yjs 라이브러리 의존** | ~50KB gzipped. ESM + sideEffects:false ✓. OS Rule 2 통과 |
| **agocraft Document ↔ Y.Doc 매핑 정확성** | round-trip identity 의무 (apply local patches → Y.Doc → derive doc → 원본과 semantic equal). 광범위 vitest 필수 |
| **conflict 자동 해결** | CRDT 가 모든 concurrent edit 자동 merge — hard-conflict prompt 0 |
| **bandwidth** | Yjs binary update 가 매우 압축적. 1 char text edit ~ 5-15 bytes. frame.x 변경 ~ 10-20 bytes |
| **storage** | snapshot (Y.encodeStateAsUpdate) + delta log. snapshot 자체가 매우 압축 |
| **offline 편집** | Yjs 의 design 그대로 — local Y.Doc 에 update accumulate → online 시 sync. 자동 |
| **agocraft purity 위반?** | sync 가 Patch / Document / Change 만 호스트-agnostic 으로 사용 ✓ |
| **다른 sister project 가 협업 도입 시** | 동일 `@agocraft/sync` 사용 + 자기 Provider 구현만 → 일관 |

## 7. 검증 (Phase 1 끝나면)

- Phase 1 단위 — vitest 만 (transport 는 InMemory)
- Phase 2 끝나면 — 2 browser 띄워 동시 편집 시나리오 e2e
- Phase 3 끝나면 — weave 의 production-like 운영 검증

## 8. 변경 이력

- 2026-05-25 — WI-028 발행. Phase 1 시작.
- 2026-05-25 — Phase 2~6 minimum-wire 완료. HTTP-poll provider + Vercel API routes + weave host write-only wire + presence components + snapshot policy + IndexedDB offline. agocraft `pnpm verify` GREEN. weave `tsc + vite build` GREEN.
- 2026-05-25 (later) — **Phase 3b + 4 mount + 5 mount + 6 mount 완료**. Y.Doc → React read loop 닫음 (`replaceDocument` via `deriveDocumentFromYDoc`). DesignPage 에 PresenceCursors + usePresenceLocalCursor 박제 + design-space coord 변환 페어. Snapshot policy + IndexedDB attach 가 useWeaveEditor syncBundle effect 안에서 라이프사이클 관리. weave typecheck + build + tests + declarativecheck + puritycheck GREEN. baseline lint 297 → 291 (regression 없음, 사실 net positive).
- 2026-05-25 (further) — **Continuous self-verification 사이클**. e2e `sync-read-loop.spec.ts` 작성, 3 가지 design bug 박제 & 수정:
  1. **`applyPatchToYDoc("item.children")` 가 added 의 ID 만 children 배열에 push 하고 실제 Item content 를 `items` Y.Map 에 seed 안 함** → remote actor 가 받는 update 가 dangling id, deriveDocumentFromYDoc 가 silent drop. 해결: `addItemTreeToYDoc(yDoc, item)` 신설 + useWeaveEditor sync sink 에서 pendingCreationsRef 로 full Item lookup 해서 patch 적용 전 seed.
  2. **`seedYDocFromDocument` 가 멱등하지 않음** → StrictMode / HMR double-seed 또는 race 시 기존 state overwrite. 해결: `struct.root.has(Y_ROOT_ID_FIELD)` guard, 두 번째 호출은 no-op + return false.
  3. **`deriveDocumentFromYDoc` 가 `schema: undefined` 반환** → host re-inject 의무. useWeaveEditor 의 Phase 3b observer 에서 `docRef.current.schema` 로 패치. 미시: FrameStage 가 schema-undefined 상태에서는 모든 frame rendering drop (SlideBlock crash 등).
  
  agocraft sync tests 8 → 11 (3 신규: addItemTreeToYDoc happy / idempotent / seedYDocFromDocument idempotent). weave 98 e2e 모두 PASS (regression 없음, 새 sync-read-loop.spec.ts 1건 추가).
