import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";

interface HotspotProps {
  /** Region in item-local 0..1 coordinates. */
  readonly region: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly label: string;
  readonly onTrigger: () => void;
}

export function Hotspot({ region, label, onTrigger }: HotspotProps) {
  const reduce = useReducedMotion();
  const wrapperStyle: CSSProperties = {
    position: "absolute",
    left: `${region.x * 100}%`,
    top: `${region.y * 100}%`,
    width: `${region.width * 100}%`,
    height: `${region.height * 100}%`,
  };

  // Opacity-only pulse: keeps the bounding box stable so playwright (and any
  // pointer-based input layer) can treat the hotspot as a normal clickable
  // target. Scale-driven pulses look slightly better but make the element
  // permanently "unstable" from automation's perspective.
  const pulseProps = reduce
    ? {}
    : {
        animate: { opacity: [0.55, 0.95, 0.55] },
        transition: {
          repeat: Number.POSITIVE_INFINITY,
          duration: 2.2,
          ease: "easeInOut" as const,
        },
      };

  return (
    <div style={wrapperStyle}>
      <motion.button
        type="button"
        aria-label={label}
        onClick={onTrigger}
        className="absolute inset-0 rounded-[var(--radius-lg)] border-2 border-[color:var(--accent)]/80 bg-[color:var(--accent)]/8 backdrop-blur-sm transition-colors duration-[var(--motion-normal)] ease-[var(--motion-spring-soft)] hover:bg-[color:var(--accent)]/18 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] cursor-pointer"
        {...pulseProps}
      >
        <span className="absolute -top-7 left-0 text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--accent-strong)] bg-[color:var(--bg-page-soft)]/70 backdrop-blur-sm rounded-full px-2 py-0.5">
          ✦ {label}
        </span>
      </motion.button>
    </div>
  );
}
