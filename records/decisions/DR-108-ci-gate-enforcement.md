# DR-108 — 경계 게이트를 CI에서 강제 + biome lint 적색 해소

- 상태: ACCEPTED — 구현 완료
- 관련: 전수 코드리뷰(2026-06-09) 근본 원인 "enforcement asymmetry"; agocraft DR-051(동일 패턴)
- 영역: `.github/workflows/gates.yml`, `package.json` (`gates` 스크립트), `apps/web/src/document/domains/EmbedBlock.tsx`, `apps/web/e2e/*.spec.ts`

## 맥락

weave는 이미 `declarativecheck`/`puritycheck` 게이트를 `verify`에 묶고 있었으나 **CI도 훅도 없어** 강제되지 않았다. 게다가 `pnpm lint`(biome)가 **적색 4건**이라 게이트화 자체가 막혀 있었다:
- `EmbedBlock.tsx:107` — 장식용 재생 SVG가 `noSvgWithoutTitle` 위반(빈 title).
- e2e spec 3개 — biome format 위반.
(`noNonNullAssertion`은 weave에서 warning이라 비차단.)

## 결정

1. **biome 적색 해소** — EmbedBlock SVG에 `role="img"` + `<title>재생</title>` 추가(장식이지만 린트 명시), e2e format은 `biome check --write` 자동수정. → `pnpm lint` exit 0.
2. **`gates` 스크립트**(신설) = `lint && declarativecheck && puritycheck`(빌드-프리).
3. **GitHub Actions** push/PR마다 `gates` + `typecheck`(build 선행) 2 job. `pnpm/action-setup`이 `packageManager`(pnpm 11.5.1)로 버전 결정. e2e는 브라우저/dev-server 필요라 게이트 제외(오너 수동/릴리스 게이트).

## 트레이드오프

- main 직커밋이라 CI는 post-hoc(차단하려면 branch protection — 오너 GitHub 설정).
- `test`/e2e 풀 verify는 게이트 제외.

## 검증

`pnpm lint`/`declarativecheck`/`puritycheck` 전부 exit 0, `pnpm gates` exit 0, `pnpm install --frozen-lockfile` exit 0. `apps/web/src/document` 단위 731 green(EmbedBlock 변경 무영향). 첫 CI 실행은 오너 확인.
