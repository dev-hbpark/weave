// DEV-only diversity sample collector (DR-077 D6).
//
// Accumulates a DesignSignature per live generation so a developer can score the
// REAL output variety across runs — the full-turn diversity is server-sampled, so
// it can't be a deterministic CI gate; this is the periodic-measurement path.
// Gated behind `import.meta.env.DEV`: the window accessor is only installed in
// dev, and the call site in use-aku-agent is DEV-guarded, so production bundles
// neither install the global nor collect (apps/web CLAUDE.md § dev-only globals).
//
// Usage (dev console): generate N designs, then
//   __weaveDiversity.report()   → { n, meanDeltaE, layoutEntropyBits, converged, … }
//   __weaveDiversity.reset()    → clear the buffer between experiments

import {
  type DesignSignature,
  type DiversityReport,
  diversityReport,
  documentToSignature,
  type SigDocument,
} from "./diversity-metric.js";

export interface DiversitySample {
  readonly signature: DesignSignature;
  /** Inspection label — the resolved preset id + variation seed of the run. */
  readonly label: string;
}

const samples: DiversitySample[] = [];
let installed = false;

/** The collected report plus the per-sample labels (dev inspection). */
export function diversityCollectorReport(): DiversityReport & {
  readonly labels: ReadonlyArray<string>;
} {
  return {
    ...diversityReport(samples.map((s) => s.signature)),
    labels: samples.map((s) => s.label),
  };
}

export function resetDiversityCollector(): void {
  samples.length = 0;
}

function installGlobal(): void {
  (window as unknown as Record<string, unknown>).__weaveDiversity = {
    report: diversityCollectorReport,
    reset: resetDiversityCollector,
    samples: (): ReadonlyArray<DiversitySample> => samples.slice(),
  };
}

/** Collect one signature from a freshly generated document. No-op in production
 *  (the call site is DEV-guarded; this guards again for safety). Installs the
 *  `__weaveDiversity` window accessor on first dev collection. */
export function collectDiversitySample(
  doc: SigDocument,
  bgHint: string | undefined,
  label: string,
): void {
  if (!import.meta.env.DEV) return;
  if (!installed) {
    installGlobal();
    installed = true;
  }
  samples.push({ signature: documentToSignature(doc, bgHint), label });
}
