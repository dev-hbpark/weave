import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

interface PresentChromeProps {
  readonly step: number;
  readonly total: number;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onClose: () => void;
  readonly title?: string;
}

const IDLE_MS = 4500;

export function PresentChrome({ step, total, onPrev, onNext, onClose, title }: PresentChromeProps) {
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (reduce) {
      setVisible(true);
      return;
    }
    let timer: number;
    const reset = () => {
      setVisible(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setVisible(false), IDLE_MS);
    };
    reset();
    window.addEventListener("mousemove", reset);
    window.addEventListener("keydown", reset);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousemove", reset);
      window.removeEventListener("keydown", reset);
    };
  }, [reduce]);

  const progress = total > 0 ? ((step + 1) / total) * 100 : 0;

  return (
    <AnimatePresence>
      {visible ? (
        <>
          {/* Top — progress + close */}
          <motion.div
            key="top"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-0 inset-x-0 z-50 px-6 py-4 flex items-center gap-4 pointer-events-none"
          >
            <div className="pointer-events-auto flex items-center gap-3 text-[12px] tracking-[0.18em] uppercase text-[color:var(--text-soft)]">
              <span className="font-medium text-[color:var(--text-strong)]">
                {step + 1} / {total}
              </span>
              {title ? <span className="opacity-70">{title}</span> : null}
            </div>
            <div className="pointer-events-auto flex-1 h-[3px] rounded-full bg-[color:var(--surface-1)] overflow-hidden">
              <motion.div
                className="h-full bg-[image:var(--accent-gradient)]"
                animate={{ width: `${progress}%` }}
                transition={{ type: "spring", stiffness: 90, damping: 22 }}
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="pointer-events-auto h-9 px-3.5 rounded-[var(--radius-pill)] text-[13px] text-[color:var(--text-default)] bg-[color:var(--surface-1)] backdrop-blur-[var(--surface-blur)] border border-[color:var(--surface-1-border)] hover:bg-[color:var(--surface-2)] transition-colors duration-[var(--motion-normal)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              aria-label="Exit present mode"
            >
              ✕ Esc
            </button>
          </motion.div>

          {/* Bottom — prev / next */}
          <motion.div
            key="bottom"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-0 inset-x-0 z-50 px-6 py-5 flex items-center justify-center gap-3 pointer-events-none"
          >
            <button
              type="button"
              onClick={onPrev}
              disabled={step <= 0}
              className="pointer-events-auto h-11 px-5 rounded-[var(--radius-pill)] text-[14px] text-[color:var(--text-default)] bg-[color:var(--surface-1)] backdrop-blur-[var(--surface-blur)] border border-[color:var(--surface-1-border)] hover:bg-[color:var(--surface-2)] disabled:opacity-40 disabled:pointer-events-none transition-colors duration-[var(--motion-normal)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              aria-label="Previous scene"
            >
              ← Prev
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={step >= total - 1}
              className="pointer-events-auto h-11 px-5 rounded-[var(--radius-pill)] text-[14px] font-medium text-[var(--text-on-accent)] bg-[image:var(--accent-gradient)] shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-40 disabled:pointer-events-none transition-[filter] duration-[var(--motion-normal)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              aria-label="Next scene"
            >
              Next →
            </button>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
