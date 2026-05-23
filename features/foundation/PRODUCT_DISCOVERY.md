# PRODUCT_DISCOVERY — weave foundation

> OS workflow step 2. WI-001 박제. Date: 2026-05-22.

## 1. 사용자 problem (User-first)

"한 캠페인 / 한 제안서 / 한 기획 의 산출물을 만들 때 도구가 3–5 개로 쪼개진다."

전형적 B2B 마케팅 팀의 1 주일 cycle:

| Step | 도구 | Pain |
|---|---|---|
| 캠페인 컨셉 정의 | Notion | block-doc 만 가능. 시안 시각화 불가 |
| 시안 디자인 | Figma | 캔버스 강함. 단 컨셉 컨텍스트 무시 — Notion 으로 돌아가야 함 |
| 발표 자료 | Google Slides / PPT | 다시 다른 도구. Figma 시안 export → 삽입 → 비주얼 망가짐 |
| 임원 보고 | PPT + Notion | 분리. 임원은 둘 다 봐야 함 |
| 캠페인 dashboard | Looker / Sheets | 또 다른 도구. 캠페인 doc 과 동기화 없음 |

**Job To Be Done**: "한 캠페인 의 모든 산출물 — 컨셉 문서, 시안, 슬라이드, dashboard, 자산 라이브러리 — 를 한 컨텍스트에서 만들고 공유하고 발견할 수 있어야 한다." (도구의 통합이 사용자에게 가치를 줌 — 컨텍스트 스위칭 비용 제거)

## 2. 타겟 사용자

| 우선순위 | Persona | 첫 시도 사이즈 | 입문 동기 |
|---|---|---|---|
| 1 | 마케팅 팀 (5–20 명) | SMB | 캠페인 자료 분산 → 한 곳 통합 |
| 2 | 영업 / 사업 개발 팀 | SMB ~ Mid-market | 제안서 = deck + spec + 시안 한 fold |
| 3 | 제품 PM / 기획자 | SMB | RFC + 아키텍처 다이어그램 + roadmap timeline 한 곳 |
| 4 | 디자인 팀 | SMB | brand asset workspace |

확장 (M4+ 의 GTM): K-12 / 대학 교육 (Horizontal MVP + 쇼케이스 의 자연스러운 부산물 — 교사가 인터랙티브 교재 만들 때 같은 problem 보임).

## 3. 기존 도구 매핑 (Benchmark, do not copy)

| 도구 | 강점 | 약점 (우리 차별화 자리) |
|---|---|---|
| **Notion** | block-doc + 임베드 + 협업 강. 진입 장벽 낮음 | 시각 디자인 약. 무한 캔버스 없음. 슬라이드 약함 |
| **Figma / FigJam** | 캔버스 + 디자인 강. FigJam 으로 whiteboard 영역 확장 | 문서 / 슬라이드 약. 결합한 단일 doc 개념 없음 |
| **Miro / Mural** | 무한 whiteboard + 콜라보 강 | 디자인 마감 약. 문서 약. "ideation" 도구 포지셔닝 |
| **Canva** | 디자인 진입 장벽 낮음. 템플릿 강 | 협업 약. 문서/슬라이드 별도 도구 |
| **PowerPoint / Google Slides** | 슬라이드 전용. 익숙함 | 캔버스 약. 문서 별도 |
| **Coda / Tana** | 문서 + 데이터 통합 시도 | 시각 디자인 / 캔버스 약함. block-doc 중심 |
| **Whimsical** | flowchart + sticky + doc 통합 시도 | 디자인/슬라이드/미디어 약. 가벼움이 한계 |

**Gap**: 4 도메인 (slide / canvas / block-doc / media) 을 production-grade 로 통합한 도구는 없음. weave 의 USP 가설.

## 4. Discovery 결정 박제

| 차원 | 결정 | 결정 turn |
|---|---|---|
| Service kind | 멀티-도메인 캔버스 (agocraft USP 활용) | 2026-05-22 |
| Target user | 업무 팀 (B2B SaaS) | 2026-05-22 |
| MVP scope | Horizontal MVP + 교육·쇼케이스 우선 | 2026-05-22 |
| 사업 모델 | Freemium per-seat (Notion/Figma 류) | 2026-05-22 |
| Codename | weave (직조 metaphor) | 2026-05-22 |

## 5. 핵심 가설

| 가설 ID | 문장 | 검증 방법 | M-stone |
|---|---|---|---|
| H1 | "4 도메인 통합" 자체가 의미있는 사용자 가치다 (단순 호기심 아닌 retention 시작점) | M2 prototype + first-100-user 인터뷰 (D7/D30 retention ≥ 25/15%) | M2 |
| H2 | 도구 간 컨텍스트 스위칭 비용이 SMB 마케팅 팀의 top-3 pain 에 속한다 | M0 의 사용자 인터뷰 (n=10 mkt 팀 리더) | M0 |
| H3 | 교육·쇼케이스 우선 GTM 이 적극적 광고보다 효율적 (CAC payback < 12mo) | M4 의 첫 conversion funnel 측정 | M4 |
| H4 | Freemium per-seat 의 $10–20/seat/mo PRO 가 SMB 의 willingness-to-pay 와 일치 | M4 의 가격 인터뷰 + 첫 conversion rate | M4 |
| H5 | agocraft 의 6 도메인 library 가 service 의 ~70% capability 를 흡수하여 build 시간을 절반 이상 절약한다 | M0 의 monorepo 결정 + M1 의 첫 prototype 시간 측정 | M1 |

## 6. Non-goals (Discovery 차원)

- **AI 자동화로 차별화**: 첫 MVP 는 AI 없음. AI 는 통합 도구가 자리잡은 다음 (M5+) layered. AI 가 main USP 면 Gamma / Tome / Genially-AI 과 직접 경쟁이라 우리 자리 모호해짐.
- **데이터 연동 (live data embed)**: 첫 MVP 는 정적 visual 만. enterprise 도구 이미지 잡으면 SMB 진입 어려움.
- **Pixel-perfect 디자인 도구 경쟁**: Figma 의 design system / Auto Layout 깊이까지는 안 가. weave 는 "good-enough 디자인 + 통합" 으로 positioning.
- **모바일 편집**: view-only 만. 편집은 데스크탑 우선.

## 7. Success metrics (D90)

- M0 (2026-06-05): 사용자 인터뷰 ≥ 10 건 완료. H1/H2 가설 첫 evidence.
- M1 (2026-06-26): agocraft↔weave monorepo 설정 + 첫 prototype 4 도메인 1 doc 내 동작.
- M2 (2026-07-24): 회원가입 + workspace + doc 저장 + 공유 동작. Closed beta n=20.
- M3 (2026-08-14): Closed beta 사용자 D7 retention ≥ 25%, NPS ≥ 30, 4 도메인 모두 사용한 doc 비율 ≥ 30%.
- M4 (2026-08-31): Open beta + 첫 template gallery + 첫 blog 5 편 + waitlist conversion ≥ 5%.

## 8. Next steps (이 Discovery 의 immediate output)

1. → **FR-001** (Technical Feasibility Review) — horizontal multi-domain workspace 의 기술적 ceiling.
2. → **RISK_NOTES** — first risk list.
3. → **ENGINEERING_PLAN** — M0–M4 90-day plan + DR-001 (monorepo).
4. → **WI-001 status update** — Discovery 완료 박제.
