# WI-191 — weave 서비스 사용 매뉴얼 (Confluence) + Playwright 캡처 도구

- 상태: DONE (2026-06-12)
- 출처: 사용자 요청 — "playwright를 활용해서 위브서비스를 안내하는
  매뉴얼같은걸 컨플루언스 페이지로 만들수있을까?"
- 산출물 (외부): Confluence 페이지 **「weave 서비스 사용 매뉴얼」**
  - 사이트: miridih.atlassian.net (cloudId `604308f5-a532-417c-b3de-1d9ed01845cc`)
  - pageId `2600829088` / spaceId `219253894` (개인 스페이스) /
    parentId `219254105` (기존 agocraft 개발 매뉴얼 형제)
  - 단축 링크: https://miridih.atlassian.net/wiki/x/oIAFmw

## 접근

문서를 추측으로 쓰지 않고 **Playwright로 실제 제품을 구동해 근거를 추출**:
랜딩 → 위저드 → mixed/slide-deck 편집기 → 추가 메뉴 → 요소/페이지/레일
우클릭 메뉴 → 테마 → 아쿠 패널 → Present 모드를 걸으며 ① 스크린샷 14장
② 보이는 모든 UI 라벨(`aria-label`/`title`/text + testid)을 JSON으로 덤프.
단축키는 `DesignPage.tsx` 키 핸들러와 `figma-tool-hotkeys.spec.ts`에서 교차
확인 (V/H, R/T/F, ⌘⌫=프레임 해체, Shift+2, PageUp/Down 등).

## 변경 파일 (repo 측)

| 파일 | 변경 |
|---|---|
| `apps/web/e2e/manual-capture.spec.ts` | 신규 — 캡처 도구. `MANUAL_CAPTURE=1` 없으면 skip (assert 없음 — 테스트 아님) |
| `.gitignore` | `manual-shots` (재생성 가능한 캡처 산출물) |

재생성: `MANUAL_CAPTURE=1 pnpm exec playwright test manual-capture`
→ `apps/web/manual-shots/*.png` + `labels.json`.

## 제약 / 메모

- Atlassian MCP에는 **첨부 업로드 scope가 없음** → 스크린샷은 페이지에
  자동 삽입 불가. 본문 부록에 파일명↔장면 표를 넣고 수동 드래그-드롭
  안내로 대체.
- Atlassian MCP HTTP+SSE 엔드포인트는 2026-06-30 이후 미지원 —
  `https://mcp.atlassian.com/v1/mcp` (Streamable HTTP)로 이전 필요.
- 캡처 중 확인된 함정: radix 메뉴 닫힘 애니메이션이 닫힌 뒤에도 잠시
  포인터를 가로챔(Escape 후 ~800ms 대기 필요), mixed 레일 타일은
  frame-kind 최상위 아이템만 생성됨.
- WI-190은 동시 세션이 선점(랜딩 멀티셀렉트) — committed-wins 규칙에
  따라 본 작업은 WI-191.

## 검증

- 캡처 스펙 2/2 green (도구 모드), 게이트 후 기본 실행 2 skipped —
  스위트 무영향. tsc / biome green.
- 매뉴얼 본문 라벨은 전부 `labels.json` 덤프와 대조 (요소 메뉴 13행,
  추가 메뉴 9종, 테마 10종, 아쿠 스타일 프리셋 7종, 크기 프리셋 6종).
