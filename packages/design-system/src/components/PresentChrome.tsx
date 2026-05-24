import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconClose } from "./Icon.js";

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

  // PresentChrome floats above the user's design canvas, which can be any
  // color the user picks. Theme tokens alone aren't enough: on a white
  // canvas Aurora's light text + translucent-white chips disappear. The
  // chrome here hard-codes a dark glass surface + light text so the chrome
  // stays readable against any background, edit theme, or user wallpaper.
  // Same chip shape on every chrome element keeps the system coherent.
  const CHIP_BG = "rgba(15, 23, 42, 0.62)";
  const CHIP_BG_HOVER = "rgba(15, 23, 42, 0.78)";
  const CHIP_BORDER = "rgba(255, 255, 255, 0.14)";
  const CHIP_TEXT = "rgba(255, 255, 255, 0.96)";
  const CHIP_TEXT_SOFT = "rgba(255, 255, 255, 0.74)";

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
            <div
              className="pointer-events-auto flex items-center gap-3 text-[12px] tracking-[0.18em] uppercase h-9 px-3 rounded-[var(--radius-pill)] backdrop-blur-[8px] border"
              style={{
                color: CHIP_TEXT_SOFT,
                background: CHIP_BG,
                borderColor: CHIP_BORDER,
              }}
            >
              <span className="font-medium" style={{ color: CHIP_TEXT }}>
                {step + 1} / {total}
              </span>
              {title ? <span className="opacity-80">{title}</span> : null}
            </div>
            <div
              className="pointer-events-auto flex-1 h-[3px] rounded-full overflow-hidden"
              style={{ background: CHIP_BG }}
            >
              <motion.div
                className="h-full bg-[image:var(--accent-gradient)]"
                animate={{ width: `${progress}%` }}
                transition={{ type: "spring", stiffness: 90, damping: 22 }}
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="pointer-events-auto h-9 px-3.5 rounded-[var(--radius-pill)] text-[13px] backdrop-blur-[8px] border transition-colors duration-[var(--motion-normal)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              style={{
                color: CHIP_TEXT,
                background: CHIP_BG,
                borderColor: CHIP_BORDER,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = CHIP_BG_HOVER;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = CHIP_BG;
              }}
              aria-label="Exit present mode"
            >
              <span className="inline-flex items-center gap-1.5">
                <IconClose size={14} />
                Esc
              </span>
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
              className="pointer-events-auto h-11 px-5 rounded-[var(--radius-pill)] text-[14px] backdrop-blur-[8px] border disabled:opacity-40 disabled:pointer-events-none transition-colors duration-[var(--motion-normal)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              style={{
                color: CHIP_TEXT,
                background: CHIP_BG,
                borderColor: CHIP_BORDER,
              }}
              onMouseEnter={(e) => {
                if (e.currentTarget.disabled) return;
                e.currentTarget.style.background = CHIP_BG_HOVER;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = CHIP_BG;
              }}
              aria-label="Previous scene"
            >
              <span className="inline-flex items-center gap-1.5">
                <IconChevronLeft size={16} />
                Prev
              </span>
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={step >= total - 1}
              className="pointer-events-auto h-11 px-5 rounded-[var(--radius-pill)] text-[14px] font-medium text-[var(--text-on-accent)] bg-[image:var(--accent-gradient)] shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-40 disabled:pointer-events-none transition-[filter] duration-[var(--motion-normal)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              aria-label="Next scene"
            >
              <span className="inline-flex items-center gap-1.5">
                Next
                <IconChevronRight size={16} />
              </span>
            </button>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
