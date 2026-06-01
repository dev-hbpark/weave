# WI-067 — Uniform handle interaction pipeline (host side of DR-032)

Status: **P2 done** (dispatcher + vertex/endpoint/midpoint-drag on FSM flow) · P3/P4 pending
Owner: hbpark
Updated: 2026-06-01

## Problem

사용자: 러버밴드 위 **모든** 핸들이 "핸들 클릭 → 핸들별 입력 스테이트머신 → 스테이트가 동작별 커맨드 호출"을 따르고, 다형성 + 코드분리 + 외부확장이 돼야 한다. 기존엔 핸들마다 인라인 document 포인터 루프(`beginVertexDrag`)·onClick·GestureRouter로 제각각.

코어 프레임워크는 agocraft **DR-032 / WI-030**. 본 WI는 host(weave) 측 디스패처 + 인터랙션 등록 + 핸들 마이그레이션.

## Decision

- **디스패처** `selection-chrome/handle-gesture-runner.ts`:
  - `HANDLE_INTERACTIONS = createHandleInteractionRegistry()` — host 인터랙션 레지스트리(외부 확장 지점).
  - `dragGestureStates()` — press→drag→release 표준 FSM(상태가 `sink.update`(move) / `sink.commit`(up) / `sink.cancel`(esc·cancel) 호출). 모든 드래그형 핸들이 공유; **차이는 sink에만**.
  - `startHandleGesture({kind, handleId, itemId, origin, sink, params?})` — **유일한** document 포인터 디스패처: 인터랙션 해소 → `createHandleGesture` → window pointer/key 이벤트를 gesture에 feed → terminal에서 자동 detach. 핸들별 document 루프 보일러플레이트 제거.
  - `toHandlePointer(e)` — DOM/React 이벤트 → 정규화 `HandlePointer`.
  - 등록: `vertex-drag`.

## P2 — vertex/endpoint/midpoint migration (done)

- `poly-vertex-handle.tsx` `beginVertexDrag`가 더 이상 document 리스너를 직접 달지 않음 → `vertex-drag` 인터랙션의 **sink**만 제공(`update`: role 레지스트리(WI-066)로 strategy 해소 후 `weave.item.update`). 디스패처가 포인터 루프 소유.
- vertex·endpoint·midpoint(삽입 후 드래그) 모두 새 파이프라인 경유.
- **검증 (e2e green)**: `line-endpoint-handle`(사각/원 토글·Alt 자유이동·일반 늘이기) + `shape-poly-vertex-edit`(드래그·midpoint 삽입·정점 삭제·45°/30° 회전) — 6/6 패리티. 코어 `handle-interaction.test.ts` 5 green.

## P3 — frame-resize / frame-rotate off GestureRouter (done)

- `frame-resize` / `frame-rotate` 인터랙션 등록(`dragGestureStates` 공유 FSM). FrameStage의 body-scoped GestureRouter host(`createFrameResizeBinding`/`createFrameRotateBinding`)를 **capture-phase pointerdown 디스패처**로 교체 — 동일 DOM 마커로 resize/rotate 핸들 감지 → `frameAccess.computeResize/computeRotate + commitFrame` **그대로 재사용**(수학·mergeKey 완전 동일) → `startHandleGesture`. move/marquee/pan은 핸들이 아니므로 GestureRouter 유지. `createFrameResizeBinding`/`createFrameRotateBinding` import 제거.
- **핸들 해소는 `e.target`만 사용**(이전 GestureRouter와 동일 semantics): closed poly는 shape VM의 resize 핸들과 poly VM의 vertex 핸들이 **겹쳐 쌓이므로**, point-stack 스캔은 vertex 누르기를 resize로 가로채는 회귀를 유발 → press target이 authoritative.
- **검증**: `e2e/handle-fsm-resize.spec.ts`(핸들에 직접 pointerdown dispatch → frame width/height 변경 + Cmd+Z 복원 = FSM 파이프라인 end-to-end 양성 검증). 회귀: vertex/endpoint/midpoint/convert/move 모두 green. (기존 `frame-handles.spec.ts` resize probe는 8–10px 핸들을 bbox-center 마우스로 못 맞히는 **사전 존재 flaky** — 구 GestureRouter에서도 동일 실패, stash로 확인. 본 작업 무관.)

## P4 — midpoint(vertex-insert) + slide bullet(discrete) + decommission (done)

- **`vertex-insert`** 인터랙션 등록(drag FSM 공유). midpoint 핸들이 vertex 삽입 후 `vertex-insert` kind로 gesture 시작(`beginVertexDrag(..., "vertex-insert")`). 핸들별 kind 명시 분리.
- **`discrete-action`** 인터랙션 신규(`discreteActionStates` — press→up→`sink.fire("activate")`, move/Escape/cancel는 미발화 abort). slide "+" bullet 핸들이 onClick → `startHandleGesture({kind:"discrete-action", sink:{fire: …weave.item.update}})`로 이전 → **프레임워크가 드래그-전용이 아님을 증명**(클릭형 핸들도 동일 파이프라인).
- **Decommission**: slide bullet onClick 제거, frame-default-view-model 주석을 새 파이프라인으로 갱신. resize/rotate binding import는 P3에서 제거 완료. 이제 러버밴드 위 **모든** 핸들(vertex/endpoint/midpoint/resize/rotate/bullet)이 `startHandleGesture` 경유.
- **검증**: 단위 `handle-gesture-runner.test.ts`(4 — 5개 kind 등록 / drag kind update·terminate / discrete fire-on-release-not-move / Escape abort). e2e: midpoint 삽입(vertex-insert)·resize(FSM)·vertex·endpoint·convert green. weave 332 unit + 타입체크 + lint clean.

## 최종 상태

러버밴드 위 모든 핸들이 통일 흐름 — **핸들 pointerdown → (FrameStage/핸들) startHandleGesture → 레지스트리 해소 → per-handle FSM → 상태가 sink 호출 → editor.exec**. 5개 인터랙션 kind(vertex-drag/vertex-insert/frame-resize/frame-rotate/discrete-action) 등록, 외부에서 `HANDLE_INTERACTIONS.register` + sink로 신규 핸들 추가 가능. GestureRouter는 핸들이 아닌 move/marquee/pan만 담당.

## Links

- agocraft DR-032 / WI-030 (코어 프레임워크). 선행: WI-066(handle role 레지스트리), DR-018/020/016.
