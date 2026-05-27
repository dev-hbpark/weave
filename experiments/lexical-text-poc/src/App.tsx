import { useEffect, useMemo, useState } from "react";
import { LexicalTextBox } from "./LexicalTextBox.tsx";
import { createSharedYDocPair } from "./yjs-bridge.ts";

/**
 * PoC App — DR-015 의 4 검증 시나리오를 한 페이지에 노출.
 *
 * - 왼쪽 editor (Actor A) + 오른쪽 editor (Actor B) — 같은 anchorId 의 root XmlText 를
 *   공유하므로 한 actor 의 변경이 다른 actor 에게 즉시 sync.
 * - "Toggle Mount" 버튼: 두 editor 를 언마운트 → 재마운트. StrictMode 더블 마운트
 *   sequence 와 결합하여 editor 인스턴스의 lifecycle 검증.
 */

export function App() {
  const sharedDocs = useMemo(() => createSharedYDocPair(), []);

  useEffect(() => {
    return () => {
      sharedDocs.destroy();
    };
  }, [sharedDocs]);

  const [mounted, setMounted] = useState(true);

  return (
    <main>
      <h1>Lexical Text PoC</h1>
      <p className="note">
        weave DR-015 + RISK-001 condition #1 의 gate. 자세한 검증 plan 은
        <code style={{ marginLeft: 4 }}>README.md</code>.
      </p>

      <div className="controls">
        <button type="button" onClick={() => setMounted((m) => !m)}>
          {mounted ? "Toggle Mount (unmount editors)" : "Toggle Mount (remount editors)"}
        </button>
      </div>

      {mounted ? (
        <div className="grid">
          <LexicalTextBox label="Actor A (Y.Doc A)" yDoc={sharedDocs.docA} anchorId="poc-root" />
          <LexicalTextBox
            label="Actor B (Y.Doc B, mirrors A)"
            yDoc={sharedDocs.docB}
            anchorId="poc-root"
          />
        </div>
      ) : (
        <div className="note">Editors unmounted. Click toggle to remount.</div>
      )}

      <details className="stats">
        <summary>검증 체크리스트 (RESULT.md 박제 전)</summary>
        <ul>
          <li>
            Tree-shaking 3-gate: <code>pnpm size</code> + <code>pnpm tree-shake-gate</code> (또는
            README §실행 의 grep 명령)
          </li>
          <li>
            한국어 IME 100자 (Test M-1) — Galaxy Chrome / iOS Safari / Mac Chrome / Mac Safari
          </li>
          <li>StrictMode mount/unmount/remount (Test M-2) — 위 버튼으로 시뮬레이션</li>
          <li>2-actor concurrent edit + format LWW (Test M-3) — 양 editor 동시 입력</li>
        </ul>
      </details>
    </main>
  );
}
