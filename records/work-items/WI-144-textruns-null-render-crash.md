# WI-144 — TextBlock null `textRuns` 렌더 크래시 수정

Status: **Done**
Owner: hbpark
Updated: 2026-06-08
유형: Bug fix (런타임 크래시) / 발견: 아쿠 에이전트 실행 중

## 증상

아쿠 에이전트가 다수 편집(item.add/update 등)을 수행하던 중 화면 전체가 React 에러 바운더리로
크래시:

```
TextBlock.tsx:71 Uncaught TypeError: Cannot read properties of null (reading 'length')
```

(에이전트 동작과는 별개의 잠재 버그 — fixed-box(WI-143/DR-098)와 무관. 복잡한 편집 흐름이 트리거.)

## 근본 원인

1. **소스**: `commands.ts` `normalizeTextAttrs` — 에이전트의 open attrs bag이 `attrs.textRuns: null`을
   보내면(런 초기화 시도 등), `"textRuns" in provided`는 true이나 `Array.isArray(null)`은 false라
   `text`만 동기화하고 **`textRuns`는 null 그대로 둠** → null이 아이템에 영속.
2. **렌더**: `TextBlock`의 두 가드가 `=== undefined`만 검사 → `null !== undefined`가 통과되어
   `null.length` 역참조 크래시(line 71, `renderReadOnly` line 603). `initialTextRuns`(line 456)도 null 전달.

`TextAttrs.textRuns` 타입은 `TextRun[] | undefined`(null 아님)지만, 에이전트 open bag이 null을 주입할 수 있음.

## 수정 (HEAD에 반영됨 — 5927d64/bd197e7에 번들로 커밋, 아래 provenance 참고)

- **소스 차단**: `normalizeTextAttrs` — `textRuns`가 배열이 아니면(null/비배열) 현재 `text`에서 유효한
  runs 배열을 파생(`text.length>0 ? [{insert:text}] : []`). null이 절대 영속되지 않음.
- **렌더 방어**: `TextBlock` 세 지점을 `Array.isArray(...)` 가드로 변경(line 71 `hasRuns`,
  `initialTextRuns` 스프레드, `renderReadOnly`). null/비배열에 크래시 없이 plain text로 폴백.
  (line 495 `a.textRuns?.some`는 옵셔널 체이닝으로 이미 안전.)
- **회귀 테스트**: `commands.test.ts`에 textRuns:null → 유효 배열 강제 2건.

## 검증

- 단위 `commands.test.ts` **117/117**, agent 스위트 포함 **191/191**. typecheck·biome 클린.

## Provenance 메모 (정리 필요)

본 수정은 작업 중 **병렬 세션의 `5927d64`("docs: renumber …") 커밋이 `git add -A`로 미커밋
편집을 함께 쓸어담아** 번들됨 — 그 커밋 메시지는 "No logic change"라고 하나 실제로는 본 크래시
로직 수정(TextBlock/commands/commands.test)을 포함. 코드는 정상 반영·검증됨. 감사 추적 정확성을
위해 본 WI로 기록. 향후 커밋 메시지 정정이 필요하면 별도 처리.
