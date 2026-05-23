import { Slot } from "@radix-ui/react-slot";
import { type HTMLMotionProps, motion, useReducedMotion } from "motion/react";
import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";
import { cn } from "../cn.js";

type Variant = "primary" | "ghost" | "subtle";
type Size = "md" | "lg";

interface ButtonOwnProps {
  variant?: Variant;
  size?: Size;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  children?: ReactNode;
  /** Render as a Slot — composes onto the immediate child (e.g. react-router `<Link>`). */
  asChild?: boolean;
}

type ButtonMotionProps = ButtonOwnProps & Omit<HTMLMotionProps<"button">, "ref" | "children">;
type ButtonSlotProps = ButtonOwnProps & Omit<ButtonHTMLAttributes<HTMLElement>, "ref" | "children">;

type ButtonProps = ButtonMotionProps | ButtonSlotProps;

const variantClass: Record<Variant, string> = {
  primary: [
    "relative isolate text-[var(--text-on-accent)]",
    "bg-[image:var(--accent-gradient)]",
    "shadow-[var(--shadow-glow)]",
    "hover:brightness-110 active:brightness-95",
  ].join(" "),
  ghost: [
    "text-[color:var(--text-strong)]",
    "bg-[color:var(--surface-1)] backdrop-blur-[var(--surface-blur)]",
    "border border-[color:var(--surface-1-border)]",
    "hover:bg-[color:var(--surface-2)] hover:border-[color:var(--surface-2-border)]",
  ].join(" "),
  subtle: [
    "text-[color:var(--text-default)]",
    "bg-transparent",
    "hover:bg-[color:var(--surface-1)] hover:text-[color:var(--text-strong)]",
  ].join(" "),
};

const sizeClass: Record<Size, string> = {
  md: "h-10 px-4 text-[14px]",
  lg: "h-12 px-6 text-[15px]",
};

const baseClass = [
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-pill)]",
  "font-medium tracking-tight",
  "focus-visible:outline-none",
  "focus-visible:shadow-[var(--focus-ring)]",
  "transition-[background,box-shadow,border-color] duration-[var(--motion-normal)] ease-[var(--motion-spring-soft)]",
  "disabled:opacity-50 disabled:pointer-events-none",
].join(" ");

export const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  const {
    variant = "primary",
    size = "md",
    leadingIcon,
    trailingIcon,
    className,
    children,
    asChild = false,
    ...rest
  } = props as ButtonOwnProps & Record<string, unknown>;

  const composedClass = cn(baseClass, variantClass[variant], sizeClass[size], className as string);
  const reduce = useReducedMotion();

  const content = (
    <>
      {leadingIcon ? <span aria-hidden>{leadingIcon}</span> : null}
      <span>{children}</span>
      {trailingIcon ? <span aria-hidden>{trailingIcon}</span> : null}
    </>
  );

  if (asChild) {
    return (
      <Slot ref={ref} className={composedClass} {...(rest as Record<string, unknown>)}>
        {content}
      </Slot>
    );
  }

  const motionProps = reduce
    ? {}
    : {
        whileHover: { y: -1 },
        whileTap: { scale: 0.97 },
        transition: { type: "spring" as const, stiffness: 500, damping: 30 },
      };

  return (
    <motion.button
      ref={ref}
      className={composedClass}
      {...motionProps}
      {...(rest as HTMLMotionProps<"button">)}
    >
      {content}
    </motion.button>
  );
});

Button.displayName = "Button";
