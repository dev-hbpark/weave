# Decision Record — DR-009 InteractionBehavior 의 extension point registry 패턴

## Metadata

| Field | Value |
|---|---|
| ID | DR-009 |
| Title | Interactive presentation 의 InteractionBehavior 는 closed union 아닌 open registry 로 dispatch. 새 kind 추가 = adapter 정의 + register 한 곳. |
| Status | **Accepted** (2026-05-22) |
| Owner | hbpark |
| Triggering Work Item | WI-009 |
| Pairs with | agocraft DR-005 (capability registry / extension point), DR-007 (design system tooling) |

## Context

WI-009 의 PoC 가 2 InteractionKind (camera-target + hotspot) 으로 시작 단 사용자 명시 — **확장 가능한 구조** 의무. 미래 reveal-on-step / branch / embed-autoplay / timeline / poll 등 5+ kind 의 추가 가능.

선택:
- **Option A (Accepted): Open registry** — `register(kind, adapter)`. PresentPage 의 코드 의존 안 함.
- Option B: Closed union — `type InteractionBehavior = CameraTarget | Hotspot | Reveal | ...`. 모든 추가 시 PresentPage 의 switch / if 의 의무 갱신.

## Decision

**Option A — open registry**. 이유:

1. **PresentPage 의 코드 안정성** — 새 kind 추가 가 PresentPage 의 변경 의무 없음.
2. **Plugin 의 base** — 미래 sister project 가 weave 의 InteractionKind 를 자체 plugin 으로 확장 가능 (e.g., 의료 vertical 의 "annotation-marker" kind).
3. **agocraft 의 capability adapter 패턴 (DR-005) 동행** — 같은 정신.
4. **Tree-shaking 유지** — 사용 안 하는 InteractionKind 의 adapter 가 import 안 되면 bundle 에서 제외.

## Registry shape

```ts
// document/interactions/types.ts

interface InteractionAdapter<K extends string, B extends { kind: K }> {
  readonly kind: K;
  /** Order in sequential navigation. Default: order field if present, else Infinity. */
  readonly getOrder?: (behavior: B, item: Item, doc: Document) => number;
  /** Validate behavior payload. Throws or returns Result. */
  readonly validate?: (behavior: B) => void;
  /** Render overlay element in Present mode (clickable region, indicator). */
  readonly render?: (behavior: B, item: Item, ctx: PresentContext) => ReactNode;
  /** Optional reactor — listens to PresentContext events (step change, click, key). */
  readonly onEvent?: (behavior: B, item: Item, ctx: PresentContext, ev: PresentEvent) => void;
}

interface InteractionRegistry {
  register<K extends string, B extends { kind: K }>(adapter: InteractionAdapter<K, B>): () => void;
  get(kind: string): InteractionAdapter<string, never> | undefined;
  list(): ReadonlyArray<InteractionAdapter<string, never>>;
  forItem(item: Item, kindFilter?: string): ReadonlyArray<{ behavior: InteractionBehavior; adapter: InteractionAdapter<...> }>;
}
```

각 adapter 의 method 는 모두 optional — 단순 marker behavior 도 가능.

## PresentContext

```ts
interface PresentContext {
  readonly doc: Document;
  readonly step: number;                   // current camera-target order
  readonly totalSteps: number;
  readonly cameraTargets: ReadonlyArray<{ item: Item; behavior: CameraTargetBehavior }>;
  readonly history: ReadonlyArray<{ step: number; timestamp: number }>;
  readonly goToStep: (step: number) => void;
  readonly goToCameraId: (id: string) => void;
  readonly reveal: (targetId: string) => void;
  readonly close: () => void;
}
```

각 adapter 가 dispatch 시 ctx 받음. 상태 변경은 ctx 의 method 만 호출 — direct mutation 금지.

## Alternatives ruled out

- **Closed union** — 명시적이지만 미래 확장 의 cost 가 큼. PoC 부터 closed 면 plugin 의 가능성 0.
- **Plugin manifest** (별 JSON 박제) — overhead 큼. PoC scope 안 함. 단 미래 enterprise 의 의도된 path.

## Consequences

- 각 InteractionKind 의 adapter 가 별 file (`document/interactions/<kind>.ts`).
- Registry 의 첫 register 위치는 `apps/web/src/document/interactions/index.ts`. PoC 의 hard-coded 2 kinds.
- 미래 plugin: `apps/web/src/plugins/<plugin-name>/interactions.ts` 의 dynamic register.

## Mitigations

- Conflict — 같은 kind 의 다중 register → register 의 두 번째 호출이 console.warn (PoC) + 첫 등록 유지.
- Type safety — adapter 의 K + B 의 generic 의무. Registry 의 get 은 unknown 으로 cast (consumer 가 narrow).

## Links

- WI-009
- agocraft DR-005 (capability registry — 패턴 차용)
- DR-007 (design system tooling) — Stage/Hotspot/PresentChrome 의 primitive 의무
- (planned) DR-design-002 — presentation primitives
- `features/presentation/UX_DESIGN.md`
