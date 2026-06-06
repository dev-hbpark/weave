# WI-112 — Aku 디자인 다양성 천장 올리기 (톤/배경/타이틀 변주 강화)

- **Date:** 2026-06-06 · **Status:** Phase 1+2+3 완료 · D5 small-think 수용 완료 · **DR:** DR-077
- **Owner:** weave (D1–D4, D6) · **Cross:** small-think (D5 — HANDOFF-024 발신 → DR-043 수용 → HANDOFF-025 반환)

## Progress

- **Phase 1 (D2+D3) 완료 (2026-06-06):** 의존성 0, 기존 7톤 유지한 채 톤-내 변주.
  - `aku-styles.ts` — 7톤 팔레트를 고정 hex → **계열(family) 범위 규칙**으로(D2);
    `COMMIT_TAIL`이 "이번 생성에서 범위 안 팔레트를 새로 정하라"로. 신규
    `variationLine(seed)` — 직교 knob(바탕 명암·구도·밀도·강조) 회전 + 시드 캐리(D3).
  - `aku-settings.ts` — 신규 `jitteredTemperature(level, seed)`: base ± 시드 유도
    오프셋, [0,1] 클램프, "consistent"는 정확히 0 유지(결정론).
  - `use-aku-agent.ts` — per-submit `variationSeedRef` 증가 → `[변주]` 주입 +
    temperature jitter. 톤이 있을 때만 변주 주입.
  - 검증: 순수함수 단위 테스트 추가, aku 피처 74 테스트 + `tsc --noEmit` green.

- **Phase 2 (D1+D4) 완료 (2026-06-06):** 천장을 7 → 축 곱집합으로.
  - 신규 `tone-axes.ts` — 5축 registry(`palette×typography×layout×decor×shape`),
    각 축 flat 옵션 배열 + `sampleOption`(시드 결정론 + D4 배제). **DecorAxis가
    배경·타이틀 장식 전략 직접 담당.** 천장 7×5×5×6×4 = 4200.
  - 신규 `compose-tone.ts` — 7 named 톤을 **프리셋(핀 축 + 자유 축)**으로 재정의
    (`TONE_PRESETS`), `resolveTonePicks`(핀=정체성 고정, 자유=시드 샘플 + 직전
    배제), `composeToneTask`. 프리셋 픽도 자유 축이 매 생성 변주.
  - `use-aku-agent.ts` — 톤 해석을 프리셋+축 합성으로 교체, `prevTonePicksRef`로
    D4 배제 셋 보관(regenerate가 점프). `AkuComposer.tsx` 칩은 `TONE_PRESETS` 사용.
  - **Decommission Sweep:** Phase 1의 `aku-styles.ts`(+test) 제거 — `variationLine`
    knob을 LAYOUT/DECOR 축으로 흡수, 커버리지는 `tone-axes.test.ts`/
    `compose-tone.test.ts`로 이관(프리셋 핀 무결성 검증 포함).
  - 검증: aku 피처 **78 테스트** + `tsc --noEmit` + `biome check`(0 error) green.

- **Phase 3 (D5+D6) 완료 (2026-06-06):**
  - **D5 (handoff):** small-think `records/decision-handoffs/HANDOFF-024-from-weave-
    tone-register-convergence.md` 발신 — review 파이프라인의 "RESTRAINED/Hold the
    tone"(`profiles.ts:343-365`)을 톤 register에 조건화(bold/playful은 절제 가드
    해제)하고, 선택적 `toneMeta` 프로토콜 힌트를 받도록 요청. small-think 응답 대기
    (weave Phase 1+2가 이미 입력측을 개선했으므로 미응답 시 회귀 없음).
  - **D6 (메트릭 하네스):** `features/aku/diversity/`
    - `color-metrics.ts` — CSS 색 파싱(hex/rgb, 토큰은 null) + sRGB→Lab +
      **CIEDE2000(ΔE00)**. Sharma et al. 레퍼런스 값 6쌍으로 1e-3 검증.
    - `diversity-metric.ts` — `documentToSignature(doc)`(직렬화 JSON 덕타이핑;
      배경/타이틀 색 + 레이아웃 시그니처 추출) + `diversityReport(sigs)`
      (배경색 페어와이즈 ΔE 평균/최소 + 레이아웃 키 Shannon 엔트로피 →
      `converged` 플래그). 수렴/다양 합성 배치로 검증.
    - 오프라인 주기 측정용(서버 샘플링 비결정성으로 CI 게이트 아님, DR-077 D6).
  - 검증: 신규 **19 테스트**, aku 피처 합계 **97 테스트** + `tsc` + `biome`(0 error) green.

- **Phase 3 후속 (2026-06-06):**
  - **D5 수용:** small-think이 HANDOFF-024를 받아 **DR-043(register-aware restraint
    policy)** 구현 — 톤-매너 baseline을 "Match restraint to the register"로 바꾸고
    expressive/playful은 절제 가드 해제, prune 패스에 REGISTER GUARD 추가, 선택적
    `DesignTaskOptions.register` 채널 노출. small-think 74 테스트 green. 반환
    **HANDOFF-025** 수신(weave가 `presetToRegister`로 register를 per-submit 전송하는
    트랜스포트 배선은 후속 — client/server hop 2-3 필요).
  - **D6 dev 수집 경로:** `features/aku/diversity/collector.ts` — 생성 성공 시
    `documentToSignature`로 시그니처 수집(DEV 한정, `window.__weaveDiversity.report()`),
    `use-aku-agent.ts`에 DEV-guard로 연결(프로덕션 트리셰이크). 실제 생성물 N개로
    ΔE/엔트로피 사후 측정 가능.

- **트랜스포트 배선 완료 (2026-06-06) — HANDOFF-025 해소:** register를 weave→server까지 end-to-end 전달.
  - **hop 1 (weave):** `compose-tone.ts` `presetToRegister`(프리셋→register lookup,
    Rule 6) + `use-aku-agent.ts` submit 옵션에 `register` 주입(자동/무프리셋 → 생략).
  - **hop 2 (@small-think/client):** `SubmitOptions.register` + 요청 프레임 직렬화.
  - **hop 3 (agent-server):** `TaskRequest.register` + `registerOf` 검증(RESTRAINT_POLICIES
    멤버십) + `server-agent-session` runner가 `editDesign/designFromContent`에 전달.
  - **re-vendor:** agent-client가 `@small-think/client`를 tsup `external`로 두므로 **client
    tgz만 교체**하면 충분(agent-client 재빌드 불필요). client 0.1.1→**0.1.2** 빌드·팩,
    `weave/apps/web/vendor/small-think/`에 복사, override 2곳(package.json·pnpm-workspace.yaml)
    갱신, `pnpm install`(+1 -1). 활성 agent-client→client 링크가 0.1.2(register 포함) 확인.
  - 검증: weave aku **98 테스트** + `tsc`; small-think client **29**/agent-server **21**/
    design **74** + 각 `tsc` + `biome` 전부 green.

## Problem

에이전트가 타이틀·배경 영역을 강화된 "디자인 톤 / 테마 추천"으로 꾸며도
**생성물이 다양하지 않고 수렴**한다. 톤 피커·자동 톤 변주·테마 추천을 모두 켜도
같은 톤을 고르면 매번 거의 같은 팔레트·레이아웃이 나온다.

## Root cause (코드 근거)

1. **닫힌 7-톤 카탈로그 + 리터럴 hex 박제** — `aku-styles.ts:30-73`, `COMMIT_TAIL`(28).
   천장이 7이고 각 톤 *안*의 분산이 0.
2. **분산이 per-request가 아니라 per-setting** — `aku-settings.ts:54-62`,
   `use-aku-agent.ts:575`. 같은 톤 + 고정 temperature → 거의 동일 출력.
   `autoRotateTone`은 톤 *사이*만 회전.
3. **review 파이프라인의 수렴 압력** — small-think `review-pipeline.ts`,
   `profiles.ts:338-400` ("RESTRAINED palette", "Hold the tone identical").
   톤별 quirk를 "올바른 디자인"으로 다림질.

## Scope

DR-077 D1–D6. weave feature-local(`features/aku/`) + small-think handoff(D5).

## Acceptance

- 같은 입력 N회 생성 시 배경/타이틀 지배색의 페어와이즈 ΔE 분산과 레이아웃
  시그니처 엔트로피가 기준 이상(DR-077 D6 메트릭).
- "regenerate"가 직전과 다른 팔레트·레이아웃 축을 사용.
- 기존 7 named 톤은 프리셋으로 보존(하위호환).
