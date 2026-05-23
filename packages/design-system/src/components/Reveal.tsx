import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

type Mode = "entrance" | "onScroll";

interface RevealProps {
  mode?: Mode;
  delay?: number;
  y?: number;
  className?: string;
  children: ReactNode;
  as?: "div" | "section";
}

const EASE = [0.22, 1, 0.36, 1] as const;

export function Reveal({
  mode = "onScroll",
  delay = 0,
  y = 24,
  className,
  children,
  as = "div",
}: RevealProps) {
  const reduce = useReducedMotion();
  const Comp = as === "section" ? motion.section : motion.div;

  if (reduce) {
    return <Comp className={className}>{children}</Comp>;
  }

  const initial = { opacity: 0, y };
  const transition = { duration: mode === "entrance" ? 0.6 : 0.55, ease: EASE, delay };

  if (mode === "entrance") {
    return (
      <Comp
        className={className}
        initial={initial}
        animate={{ opacity: 1, y: 0 }}
        transition={transition}
      >
        {children}
      </Comp>
    );
  }

  return (
    <Comp
      className={className}
      initial={initial}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={transition}
    >
      {children}
    </Comp>
  );
}
