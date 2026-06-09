# DR-107 — sync sink가 agocraft 정본 `changeToPatch`를 소비 (10-kind 드롭 버그 수정)

- 상태: ACCEPTED — 코드 적용 완료 (sync e2e는 오너 게이트, 아래 참조)
- 관련: agocraft HANDOFF-022 / agocraft commit 53c86de(`@agocraft/core` export); 전수 코드리뷰(2026-06-09) 책임역전 axis-A
- 영역: `apps/web/src/document/use-weave-editor.ts` (WI-028 sync sink)

## 맥락 — 잠복 sync 버그

`use-weave-editor.ts`의 sync sink는 `Change → Patch`를 **로컬에서 손으로 재구성**했다 — `switch (c.type)`로 **4개 variant만**(`item.attrs`/`item.children`/`item.units`/`unit.attrs`) 매핑, `default: undefined`. weave가 emit하는 patch는 14종인데, 나머지 10종(`item.create`(붙여넣기/삽입)·`item.reparent`·`item.text`(타이핑)·`unit.create`·`document.attrs`·`item.remove`·`relations.*` 등)이 드롭돼 `applyPatchToYDoc`(유일한 Y.Doc write 경로)에 도달하지 못했다. → **협업 sync가 켜지면 붙여넣기·reparent·타이핑이 협업자에게 전파되지 않는다.** (`sync !== undefined` 게이트로 협업 sync 기본 OFF라 잠복.)

agocraft `@agocraft/editor`의 history에 **17-variant 정본 + exhaustiveness 가드**가 있었으나 미export. 호스트가 들고 있던 건 그 stale subset이었다.

## 결정

agocraft가 `changeToPatch`를 **`@agocraft/core`에서 export**(HANDOFF-022, commit 53c86de — Change/Patch 정의 옆이 본래 home)했고, weave는 로컬 사본을 삭제하고 이를 import한다. 새 kind는 core의 `assertNeverChange`가 컴파일 에러로 막으므로 다시는 silent 드롭이 없다.

## 배치/재벤더 — 왜 core인가

처음엔 agocraft가 editor에서 export했으나, weave가 editor를 재벤더하면 `editor@0602→HEAD`로 버전 업되며 **DR-043(ChromeNode) drift**까지 끌려와 `NestedFrame.tsx:728` selection-chrome가 깨졌다(e2e 필요). weave는 **core를 더 최신(`0607`)으로 핀**하고 core의 0607 이후 drift는 주석/lint 2커밋뿐이라, **core 재벤더는 drift 0**(검증: swap 전 weave typecheck 0). → agocraft가 changeToPatch를 core로 이동, weave는 core만 재벤더.

- 재벤더: `agocraft-core-1.0.0-rc.20260609193000.tgz`(신규 버전 문자열, integrity-cache 회피) → weave 3개 override 위치 갱신 + `pnpm install`(`+1 -1` 클린). 옛 `…20260607010000.tgz` 제거.

## 검증

- weave typecheck 0, biome 0, declarativecheck 0(로컬 switch 제거), `apps/web/src/document` 단위 테스트 **731 green**.
- **sync e2e는 미검증(오너 게이트):** 이 sandbox엔 브라우저/2-client 협업 환경이 없음. 협업 ON에서 붙여넣기/reparent/타이핑이 둘째 클라이언트에 전파되는지 e2e 필요. 코드/타입 레벨은 정본 소비로 해소됨.

## 후속

협업 sync e2e(WI-028 경로) 추가 권장 — 이 클래스(누락 variant 드롭)가 회귀하지 않도록 게이트.
