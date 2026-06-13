# WI-212 — 경량화 회귀 시그니처 2건 수정 (text width-0 인라인 규칙 + batch 명령명 정규화)

- **Status:** DONE (2026-06-13) · **Relates:** WI-209/DR-134(롤백 정책 = 영역별 복원),
  WI-207/DR-132, small-think WI-056(openai-api 신규 모드), HANDOFF-029
- **Origin:** 운영자 "경량화 작업 이후 프레임의 레이아웃을 조작하는 능력이 떨어진 것 같다"
  — 로그 전수 확인 결과 도구 에러율이 배포 후 상승(api 1.3→5.8%, byo-ssh 1.7→3.5%,
  신규 openai-api 6.7%)이고, 신규 실패 모드 2건이 특정됨.

## 진단 (배포 경계 = 로그 line 12196)

1. **WI-207 de-list는 무혐의**: `agent-tool-not-exposed` 0건, de-list된 grid/flex
   마이크로옵은 전체 로그에서 사용 이력 0, `frame.setLayout` 124건 전부 성공.
2. **width-0 text add ×3 연속 (openai-api/GPT, 배포 전 0건)**: WI-209가 text
   PLACEMENT 상세(DR-098 "width/height 충분히")를 domain §3 포인터로 바꾼 자리 —
   GPT가 포인터 추적에 실패해 같은 실수를 3턴 반복 후 4턴째 회복.
3. **batch op 명령명 혼동 ×3 (openai-api)**: sanitize된 도구 철자
   (`weave.item_update` 혼종)를 op command로 기입 → unknown-command로 배치 전체 중단.
4. api(Claude) stale-id batch 실패 ×2는 자가 회복 — WI-054 스냅샷 캡과의 인과 미확정,
   본 WI 범위 외.

## Change

- `features/aku/agent/weave-capabilities.ts` — itemKinds.text PLACEMENT에 1문장
  인라인 복원: 명시적 frame을 줄 때 frame.width는 부모의 실질 지분이어야 하며
  0/근사-0 폭은 add가 거부됨 (~30 tok — DR-134 §롤백의 "영역별 복원" 적용).
- `document/commands.ts` — weave.batch op 명령명 lookup 정규화: 정식 레지스트리에
  없으면 `"_"→"."` 치환 후 재조회 (정식 명령명에 underscore가 없어 무모호).
  BATCH_DISALLOWED 검사도 정규화된 이름 기준 (`weave_batch` 철자로 중첩 우회 불가).
  에러 메시지는 원문 철자 유지.

## SVL

- commands.test.ts 151 green (신규: sanitized/hybrid 철자 정규화 + 정규화된
  disallowed 검사), features/aku/agent 20파일 191 green.
- `tsc --noEmit` 클린, biome 3파일 클린.
- 라이브 검증: Vercel push 후 openai-api 모드 레이아웃 태스크에서
  width-0 거부·unknown-command 재발 여부를 로그로 확인 (HANDOFF-029 합산 게이트와 동행).
