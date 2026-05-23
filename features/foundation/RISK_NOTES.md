# RISK_NOTES — weave foundation

> OS workflow step 4. WI-001 / FR-001 박제 기반. Date: 2026-05-22.

## Risk register

| ID | Risk | Severity | Likelihood | Owner | Mitigation | Re-check |
|---|---|---|---|---|---|---|
| R-1 | Notion+Figma+Miro 교차점 가설 시장 미검증 — PMF 실패 | **P1** | Med | Product | M0 인터뷰 ≥ 10 건 → M2 closed beta 20 명 retention 측정. D7 < 25% 시 USP 가설 재검토 | M3 retro |
| R-2 | agocraft 의 production wiring (storage upload / blob revoke / magic-byte / hls.js / IntersectionObserver / playwright baseline) 미해결 — weave 의 production 진입 차단 | **P1** | High | Engineering | agocraft 측 HANDOFF 발행, weave M0–M2 안에 6 항목 모두 처리 | M2 |
| R-3 | 4 도메인 통합 UI complexity → 학습 곡선 → adoption 실패 | **P1** | Med | Product | Template-first onboarding (M4 의 template gallery). 빈 doc 첫 진입 금지. SaaS landing 의 onboarding video. | M4 |
| R-4 | DR-001 monorepo 결정 잘못 시 dev/build 비효율 | **P2** | Low | Engineering | M0 의 첫 sprint 안에 DR-001 verdict 검증. dev cycle 측정 (agocraft 한 줄 변경 → weave 반영까지 시간). > 5min 이면 strategy 재검토 | M1 |
| R-5 | 실시간 multi-cursor 없는 first MVP 의 경쟁력 | **P2** | Med | Product | M0–M2 closed beta 가 last-write-wins + lock 으로 충분한지 측정. 충분하지 않으면 M3 의 별도 WI 발행 (Yjs / Liveblocks 통합) | M3 |
| R-6 | Backend 선택 (DR-003) vendor lock | **P2** | Med | Engineering | DR-003 의 의무. infrastructure-cost-optimization-agent 사인 필요. 첫 stage: Node + Hono + Drizzle + Postgres (open-stack). enterprise 단계에 BYO. | DR-003 |
| R-7 | Multi-tenant 격리 + GDPR/CCPA/PIPA 한국 미준수 | **P0** | Med | Engineering + Legal | privacy-data-protection-agent 사인 M2 의무. per-tenant DB schema 또는 row-level security 의 결정 (DR-004 후보) | M2 |
| R-8 | 교육·쇼케이스 우선 GTM 의 SEO + AI visibility 미작동 — adoption 막힘 | **P1** | Med | Growth | seo-ai-visibility-agent 사인. AI_VISIBILITY_PLAN 의 박제. structured data + LLM-friendly schema. blog/template/showcase 매 발행 시 SEO 체크 | M4 |
| R-9 | Auth (DR-002) vendor 잘못 — 비용·격리·기능 미스 | **P2** | Low | Engineering | DR-002 의 의무. library-adoption-supply-chain-governance-agent 사인. Clerk / Supabase Auth / WorkOS / Lucia 비교 | DR-002 |
| R-10 | PRO tier 가격 미스 — willingness-to-pay 측정 안 됨 | **P2** | Med | Product | M4 가격 인터뷰 (n=5). Notion ($10/seat) / Figma ($15) 의 anchor 참조. 첫 가격은 $10/seat/mo 가설 | M4 |
| R-11 | agocraft 의 PRODUCTION_BACKLOG 우선순위 0 의 R-13 (storage) / R-15 (auto-pause) / R-17 (magic-byte) 가 weave 진입 시 미해결 → 보안 / UX risk 직접 전달 | **P1** | High | Engineering | weave 의 M0 첫 task = sister project 에 HANDOFF 발행하여 우선순위 0 의 status 동기화 + weave 자체에서 처리할 항목 명시 | M2 |
| R-12 | agocraft 의 cross-project boundary 위반 가능성 — weave 의 코드가 sister project 의 source 를 import (dev hack) | **P1** | Med | Engineering | DR-001 의 Option E (npm publish) 가 답. validate_workspace.py 의 CI 통합. PR 시 자동 lint | M0 |
| R-13 | 첫 SMB 의 deck/제안서 사용 시 PPT 호환성 부재 — import/export 의 .pptx 미지원 | **P2** | Med | Product | first MVP non-goal 박제. M3+ 별도 WI. import 의 first-class 는 deferred | M3 |
| R-14 | 모바일 view-only 제한 — 모바일 사용자가 doc 못 본다는 인식 | **P2** | Med | Product | Discovery 의 명시적 trade-off 박제 (FR-001 § 7). landing 에 device support matrix 표시 | M2 |
| R-15 | weave 의 도메인 별 agent (e.g., editor-engine-agent / canvas-design-agent / collab-agent) 부재 → 결정 일관성 부족 | **P3** | Low | Operations | M2 의 records cluster ≥ 3 도달 시 `/bootstrap-domain` 실행 | M2 |
| R-16 | agocraft handoff 사이클 의 응답 지연 — sister 가 답 안 줄 경우 weave blocking | **P2** | Med | Operations | 양 프로젝트 owner 동일 (hbpark). handoff 의 target SLA = 2 영업일. SLA 미스 시 사용자 직접 의사결정 | 진행 중 |
| R-17 | UI animation 의 scale-based motion 이 자동화 검증 (playwright/CDP) 의 element stability check 영원히 fail — UI 검증 불가 | **P2** | Med | Engineering | WI-009 의 Hotspot 에서 발견 (opacity-only 로 fix). 모든 미래 motion primitive 의 의무 — 자동화 검증 가능성 우선, scale/translate 의 infinite repeat 회피 | M3 review |
| R-18 | React 18 strict mode 의 mount-unmount-mount cycle + navigation 직후 첫 keydown listener attach 의 race — PoC 의 Esc 같은 키바인딩 의 첫 입력 손실 가능 | **P2** | Low (PoC) | Engineering | WI-009 의 theme switch test 의 race 로 발견. Phase 3 의 `@agocraft/input/hotkey` swap 시 자연 해결 (의도된 listener 라이프사이클). PoC 단계 의 사용자 영향 minimal. | Phase 3 swap |
| R-19 | OS workflow step 7 (Continuous Self-Verification) 의 의무를 agent 가 종종 회피 — curl HTTP 200 의 단순 verify 후 사용자에게 시각 검증 떠넘김 | **P1** | High (재발) | Operations | 이 conversation 의 사용자 지적 (2026-05-22) — 박제된 룰의 정직한 인지. 모든 UI 변경 의 의무 절차: playwright e2e 작성 + 첫 run 의 failure 분석 + fix. 박제: [[feedback-svl-mandatory]] memory + 매 UI WI 의 acceptance criteria 의 명시. | 매 라운드 review |

## Non-trivial decisions awaiting (Decision Records 후보)

- DR-001 (proposed) — agocraft dependency strategy (이 doc 동행)
- DR-002 (planned) — auth vendor (Clerk / Supabase Auth / WorkOS / Lucia)
- DR-003 (planned) — backend platform (Node+Hono vs CF Workers vs Supabase vs Convex vs Rails)
- DR-004 (planned) — multi-tenant 격리 형식 (per-tenant schema vs RLS)
- DR-005 (planned) — first storage (Postgres BLOB / S3 / R2 / Supabase Storage)
- DR-006 (planned) — public SEO platform (Next.js 14 / Astro / Remix)

## Linked specialists (의무 사인 — FR-001 § 8 의 동기화)

- `standards-runtime-platform-intelligence-agent` — M0 의무
- `infrastructure-cost-optimization-agent` — DR-003 동행 의무
- `sre-reliability-agent` — M2 의무
- `privacy-data-protection-agent` — M2 의무 (P0 risk R-7)
- `library-adoption-supply-chain-governance-agent` — DR-002, DR-003 동행 의무
- `frontend-performance-agent` / `rendering-performance-architecture-agent` — M1, M3 의무
- `seo-ai-visibility-agent` — M4 의무 (R-8)
