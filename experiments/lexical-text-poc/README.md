# Lexical Text Editor PoC

DR-015 의 Lexical 1순위 결정을 검증하는 self-contained Vite + React 18 + Lexical 0.44 + Yjs PoC. RISK-001 의 condition #1 (gate).

**목적**: 다음 4 질문에 RESULT.md 박제로 답한다.

1. **트리쉐이킹 3-gate** — Lexical + `@lexical/react` + `@lexical/yjs` 가 ESM build, `"sideEffects": false`, reflect-metadata 비의존인지 (`pnpm install` 후 node_modules 직접 검증).
2. **번들 사이즈** — `pnpm build` 후 dist gzipped size 가 ≤ 60 KB 인지 (`gzip -c dist/assets/*.js | wc -c`).
3. **한국어 IME 안정성** — Galaxy Chrome + iOS Safari + Mac Chrome + Mac Safari 4-browser 에서 100자 한국어 합성 입력 시 누락·중복 0%인지 (수동 검증 + screenshot 박제).
4. **StrictMode 안전성** — dev mode 의 더블 마운트 + mount → unmount → remount sequence 에서 editor 인스턴스 영구 disable 미발생 + 한국어 IME 정상 동작 ([[feedback-react-strictmode-singleton-dispose]] 회귀 방지).

추가로 다음 데모:

- **2-actor concurrent edit** — 한 페이지 내 두 LexicalComposer + 단일 Y.Doc + 양방향 sync 시뮬레이션. concurrent format LWW 동작 시각 확인.
- **applyRange 패턴** — 선택 영역에 bold/italic/color 적용 (FR-002 §4.4 의 `weave.text.applyRange` 의 PoC).

## 디렉터리 구조

```
experiments/lexical-text-poc/
├── README.md                       이 파일
├── RESULT.md                       검증 결과 박제 (Build 후 작성)
├── package.json                    pnpm install 으로 deps 설치
├── tsconfig.json
├── vite.config.ts
├── index.html
├── playwright.config.ts            (TODO — 다음 phase)
└── src/
    ├── main.tsx                    StrictMode entry
    ├── App.tsx                     two-editor demo
    ├── LexicalTextBox.tsx          minimal LexicalComposer wrapper
    └── yjs-bridge.ts               in-memory Yjs provider (2-actor sim)
```

## 실행

```bash
cd workspace/weave/experiments/lexical-text-poc
pnpm install               # 또는 npm install
pnpm dev                   # http://localhost:5173

# 번들 사이즈 측정
pnpm build
gzip -c dist/assets/*.js | wc -c
# 기준: ≤ 61440 (60 KB gz)

# 트리쉐이킹 3-gate 검증
node -e "console.log(JSON.stringify(require('lexical/package.json'), null, 2))" \
  | grep -E '"main"|"module"|"exports"|"sideEffects"'
node -e "console.log(JSON.stringify(require('@lexical/yjs/package.json'), null, 2))" \
  | grep -E '"main"|"module"|"exports"|"sideEffects"'
grep -r "reflect-metadata" node_modules/lexical/ node_modules/@lexical/ 2>/dev/null
# 기준: ESM module export 존재, sideEffects: false, reflect-metadata 미발견
```

## 수동 검증 plan (4-browser IME)

각 brower 에서 다음 sequence 수행 후 **글자 누락·중복 0%** 확인. 실패 시 screenshot 박제 + RESULT.md 기록.

### Test M-1: 한국어 100자 입력 (Galaxy Chrome / iOS Safari / Mac Chrome / Mac Safari)

1. `http://localhost:5173` 접속
2. 왼쪽 텍스트 박스 클릭
3. 다음 100자 한국어 입력 (각 글자마다 합성 진행) — 천천히 (1초/글자) + 빠르게 (5자/초) 두 번:
   ```
   안녕하세요반갑습니다오늘날씨가매우좋네요바람도시원하고햇살도따스해서산책하기에딱좋은날이에요점심은무엇을드셨나요저는김치찌개를먹었습니다맛있었어요
   ```
4. 입력 완료 후 화면의 텍스트 = 위 원본 일치 확인

### Test M-2: StrictMode mount/unmount/remount

1. App.tsx 의 `mountTrigger` 버튼 ("Toggle Mount") 클릭 — 텍스트 박스 언마운트
2. 다시 클릭 — 재마운트
3. 한국어 입력 시도 → Test M-1 동일 sequence
4. 첫 입력과 재마운트 후 입력의 동작 일치 + 글자 누락 0% 확인

### Test M-3: 2-actor concurrent edit

1. App.tsx 의 두 텍스트 박스 모두 활성화
2. 왼쪽 박스에 "Hello"
3. 오른쪽 박스의 같은 위치에 다른 글자 "World" 입력
4. 양쪽 박스의 최종 상태가 동일 (Yjs CRDT 자동 merge) 확인
5. 왼쪽 박스의 글자 일부를 선택 → applyRange 의 bold 적용
6. 오른쪽 박스에서도 동일 글자에 다른 color 적용
7. concurrent format LWW 가 어느 쪽이 살아남는지 확인 (RESULT.md 박제)

## 자동 e2e (playwright + CDP)

3 spec 파일이 `e2e/` 에 박제됨. **자동화는 manual 의 대체가 아니라 보강** — mechanical 회귀 (mount/unmount race, double-mount dispose, 2-actor sync race, CDP-수준 IME composition 안정성) 를 빠르게 catch. **production 신뢰도의 source 는 여전히 4-browser manual** (CDP IME 가 OS-native 한국어 jamo 결합을 재현 못 함).

| Spec | 검증 영역 | Manual 의무? |
|---|---|---|
| `e2e/strict-mode.spec.ts` | mount → unmount → remount + dispose-related console error | OK, mechanical |
| `e2e/collab-sync.spec.ts` | 2-actor sync + 양쪽 동시 입력 보존 + format sync | OK, mechanical |
| `e2e/ime-composition.spec.ts` | CDP IME composition (chromium-only, **partial** 자동화) | ⚠️ 한국어 jamo 결합은 CDP 미지원 → 4-browser manual 여전히 필요 |

실행:

```bash
pnpm e2e:install   # chromium binary 다운로드 (1회)
pnpm e2e           # 3 spec 전부 실행
pnpm e2e -- e2e/strict-mode.spec.ts   # 단일 spec
```

## Result 박제

검증 완료 후 [`RESULT.md`](./RESULT.md) 의 각 섹션 채움:

- Tree-shaking 3-gate (PASS / FAIL + 증거)
- Bundle size (실측 KB + ≤ 60 KB 충족?)
- IME 4-browser (PASS / FAIL per browser + screenshot)
- StrictMode (PASS / FAIL + 동작 로그)
- 2-actor LWW (동작 정성 평가)
- Final verdict — DR-015 의 Lexical 1순위 채택을 Accepted 또는 Slate fallback 으로 supersede

## Links

- DR-015 — Lexical pick (PoC 가 그 의사결정의 evidence)
- RISK-001 — Condition #1 (이 PoC 가 PR-block gate)
- FR-002 §2 — capability requirements (이 PoC 가 검증하는 4 capability)
- TEXT_ITEM_SPEC.md §8.1 — open question (편집기 선택의 evidence 입력)
