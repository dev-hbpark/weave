import { forwardRef, type SVGAttributes } from "react";
import { cn } from "../cn.js";

interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, "children"> {
  readonly size?: number | string;
}

const baseProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const SvgRoot = forwardRef<SVGSVGElement, IconProps & { children: React.ReactNode }>(
  function SvgRoot({ size = 18, className, children, ...rest }, ref) {
    return (
      <svg
        ref={ref}
        width={size}
        height={size}
        {...baseProps}
        aria-hidden
        className={cn("inline-block shrink-0", className)}
        {...rest}
      >
        {children}
      </svg>
    );
  },
);

export const IconUndo = forwardRef<SVGSVGElement, IconProps>(function IconUndo(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </SvgRoot>
  );
});

export const IconRedo = forwardRef<SVGSVGElement, IconProps>(function IconRedo(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h3" />
    </SvgRoot>
  );
});

export const IconCursor = forwardRef<SVGSVGElement, IconProps>(function IconCursor(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M5 3l4.5 16 2.5-6.5L18.5 10z" />
    </SvgRoot>
  );
});

export const IconHand = forwardRef<SVGSVGElement, IconProps>(function IconHand(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M9 11V5.5a1.5 1.5 0 1 1 3 0V11" />
      <path d="M12 11V4.5a1.5 1.5 0 1 1 3 0V11" />
      <path d="M15 11V6.5a1.5 1.5 0 1 1 3 0v8.25" />
      <path d="M9 11V8.5a1.5 1.5 0 0 0-3 0v6c0 4 3 6.5 6.5 6.5S18 18.5 18 14.75" />
    </SvgRoot>
  );
});

export const IconPlay = forwardRef<SVGSVGElement, IconProps>(function IconPlay(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M6 4l14 8-14 8z" fill="currentColor" />
    </SvgRoot>
  );
});

/** Three overlapping rectangles representing a Z-order layer stack. Used by
 *  the Peek (Z-order) tool to signal "inspect the local stack". */
export const IconLayers = forwardRef<SVGSVGElement, IconProps>(function IconLayers(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <rect x="4" y="13" width="13" height="7" rx="1.5" />
      <rect x="6" y="9" width="13" height="7" rx="1.5" fill="currentColor" fillOpacity="0.18" />
      <rect x="8" y="5" width="13" height="7" rx="1.5" fill="currentColor" fillOpacity="0.32" />
    </SvgRoot>
  );
});

/** Plus / add — used in toolbars to open the new-item menu. */
export const IconPlus = forwardRef<SVGSVGElement, IconProps>(function IconPlus(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M12 5v14M5 12h14" />
    </SvgRoot>
  );
});

export const IconChevronLeft = forwardRef<SVGSVGElement, IconProps>(function IconChevronLeft(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M15 5l-7 7 7 7" />
    </SvgRoot>
  );
});

export const IconChevronRight = forwardRef<SVGSVGElement, IconProps>(function IconChevronRight(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M9 5l7 7-7 7" />
    </SvgRoot>
  );
});

export const IconClose = forwardRef<SVGSVGElement, IconProps>(function IconClose(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </SvgRoot>
  );
});
