# Decision Record — DR-001

## Metadata

| Field | Value |
|---|---|
| ID | DR-001 |
| Title | weave 의 agocraft 의존 전략 (cross-project library 의존 형식) |
| Status | **Accepted** (user confirmed 2026-05-22) |
| Owner | hbpark |
| Date | 2026-05-22 |
| Triggering Work Item | WI-001 |
| Related Feasibility Review | FR-001 |

## Context

weave 는 agocraft (sister service project, multi-domain editing engine library) 의 12 packages 위에서 동작하는 service. 두 프로젝트는 모두 `workspace/<name>/` 의 별도 service project — OS 의 cross-project boundary 룰 의해 직접 파일 read/write 금지. 단 build graph 의존은 별도 영역 (NPM 의존은 OS path 가 아닌 registry 경유).

## Constraint

OS-root `CLAUDE.md` § Cross-Project Boundary:
- 다른 프로젝트의 파일을 직접 read/modify 금지.
- 프로젝트 문서·agent·skill 산출물에 `workspace/<other>/...` 경로 박제 금지 (handoff 외).

→ weave 의 `package.json` 에 `"file:../agocraft/..."` 또는 `workspace:*` 으로 agocraft source 를 직접 참조하는 것은 boundary 위반.

## Options

### Option A: agocraft 를 private npm registry 로 publish, weave 가 의존

- agocraft 가 자체 CI 로 `@agocraft/core` 등 12 packages 를 private npm (GitHub Packages / Verdaccio / npm pro) 에 publish.
- weave 의 `package.json` 은 `"@agocraft/core": "^1.0.0"` 처럼 일반 npm 의존.
- **장점**: boundary 깨끗. 버전 명시. 다른 service 도 동일 mechanism 으로 의존 가능.
- **단점**: agocraft 의 변경이 publish 사이클 거쳐야 weave 에 반영. dev cycle 길어짐. publish infra 셋업 부담 (private registry 또는 GitHub Packages auth).

### Option B: agocraft 의 빌드된 dist 를 npm tarball 로 weave 안에 vendored

- agocraft 의 빌드 산출물 (`.tgz`) 를 weave 의 `vendor/` 안에 commit.
- weave 의 `package.json` 은 `"@agocraft/core": "file:./vendor/agocraft-core-1.0.0.tgz"`.
- **장점**: registry 필요 없음. boundary 깨끗 (workspace path 없음). 버전 명시 가능.
- **단점**: tarball 매번 manual copy. 큰 binary 가 git history 부풀림. dev cycle 길음.

### Option C: workspace OS 의 cross-project boundary 룰 예외 — root-level pnpm workspace 통합 (NOT recommended)

- OS-root `pnpm-workspace.yaml` 추가, `workspace/*/packages/*` 통합.
- weave 의 `package.json` 은 `"@agocraft/core": "workspace:*"`.
- **장점**: dev cycle 가장 빠름. agocraft 변경 즉시 weave 반영.
- **단점**: OS 의 cross-project boundary 룰 침해. 두 service 가 build graph 상 하나 → 격리 약화. validate_workspace.py 가 fail.

### Option D: weave 와 agocraft 를 하나의 workspace project 로 통합 — 두 사이드 프로젝트 합치기

- `workspace/weave/` 안에 packages/* (agocraft 의 12 packages 흡수) + apps/web (service).
- agocraft 의 별도 정체성은 archive 또는 deprecate.
- **장점**: dev cycle 가장 빠름. 단일 monorepo. 격리/boundary 문제 없음 (한 project).
- **단점**: agocraft 의 별도 정체성 손실 (PoC 의 박제된 6 도메인 통합 library 의 reusable 가치 약화). 다른 service 가 agocraft 만 의존하기 어려움.

### Option E (Recommended): Hybrid — agocraft 를 npm publish (private), dev cycle 단축은 별도 도구

- Production / commit 시: Option A.
- Local dev 시: agocraft 안에서 `npm pack` → weave 의 `node_modules` 에 link (commit 안 됨).
- 또는 agocraft 의 watch 모드 + symlink 으로 단순 hack (개발자 local 만).
- **장점**: production 은 깨끗. dev 는 빠른 cycle.
- **단점**: dev/prod 셋업 분리, 첫 onboarding 약간 복잡.

## Decision (Accepted 2026-05-22)

**Option E (Hybrid)**: agocraft 를 GitHub Packages (private) 로 publish, weave 가 일반 npm 의존. Local dev cycle 은 `npm pack` + 수동 install 또는 yalc 같은 도구.

이유:
1. OS 의 cross-project boundary 룰 준수 (validate_workspace.py PASS).
2. agocraft 의 reusable library 정체성 유지 — 미래에 weave 외 다른 service 도 의존 가능.
3. 버전 명시로 weave 의 deploy 가 agocraft 의 random push 에 영향 안 받음.
4. dev cycle 은 yalc / npm pack 으로 mitigate.

## Alternatives ruled out

- Option B: tarball commit 의 git history 부담 큼. + dev cycle 동일하게 길음.
- Option C: OS 룰 정면 위반. 룰 자체를 바꾸는 게 정당화되어야 하는데 그 만큼의 evidence 없음.
- Option D: agocraft 의 reusable 정체성 손실. PoC 의 6 도메인 library 가치 약화. 두 사이드 합치는 시점이 PMF 후 진행이 더 안전.

## Consequences

- agocraft 가 자체 CI 의 publish workflow 추가 의무 (별도 WI 발행 — agocraft 의 `records/decision-handoffs/` 로 handoff). M0 의 첫 의무.
- weave 의 `package.json` 은 `@agocraft/core@1.0.0-rc.1` 같은 prerelease 부터 시작. 양 프로젝트 모두 prerelease 단계.
- 두 프로젝트의 owner 가 동일하므로 publish auth 셋업은 단순 (GitHub Packages PAT).

## Mitigations

- M0 의 첫 일 — agocraft 측 publish workflow handoff 발행. agocraft 의 `records/decision-handoffs/HANDOFF-001-publish-as-npm.md` 작성 (weave 가 작성).
- M0 의 첫 dev: yalc 또는 `npm link` 의 onboarding 문서 weave 의 `docs/engineering/AGOCRAFT_DEPENDENCY.md` 박제.

## Links

- WI-001
- FR-001
- (planned) HANDOFF to agocraft requesting publish setup
- DR-002 (planned: auth)
- DR-003 (planned: backend)
