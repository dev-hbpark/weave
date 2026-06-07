// WI-136 — theme typography manager (the "테마에서 폰트 관리" UI).
//
// A pill trigger (mounts next to the design-system ThemePicker) opening a
// popover with one control per font role (제목 / 본문 / 모노). Each control is a
// DropdownMenu listing "테마 기본" + the curated catalog (grouped by category);
// picking a font sets the ACTIVE theme's override via useThemeTypography, which
// applies it as an inline CSS var on <html> and loads the webfont on demand.
//
// Text bound to a role (the default for new text) follows these choices with no
// document mutation — switching themes restores each theme's own typography.

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconChevronDown,
  IconText,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@weave/design-system";
import { Fragment, useState } from "react";
import { resolveFontEntryById } from "./adhoc-registry.js";
import { FONT_GROUPS, FONT_ROLES } from "./catalog.js";
import { FontBrowseDialog } from "./FontBrowseDialog.js";
import { ensureFontByStack } from "./font-loader.js";
import { type RoleId, useThemeTypography } from "./use-theme-typography.js";

export function TypographyPicker({ className }: { readonly className?: string }) {
  const { current, defaults, setRole, resetTheme } = useThemeTypography();
  const [open, setOpen] = useState(false);
  // Which role's "모든 폰트 찾아보기" dialog is open (null = none).
  const [browseRole, setBrowseRole] = useState<RoleId | null>(null);
  const hasOverrides = FONT_ROLES.some((r) => current[r.id] !== undefined);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="테마 글꼴 관리"
            data-testid="typography-picker"
            data-tip="글꼴"
            className={[
              "inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] pl-2.5 pr-2.5",
              "bg-[color:var(--surface-1)] backdrop-blur-[var(--surface-blur)]",
              "border border-[color:var(--surface-1-border)]",
              "text-[13px] font-medium text-[color:var(--text-soft)]",
              "transition-[color,background,border-color] duration-[var(--motion-normal)] ease-[var(--motion-spring-soft)]",
              "hover:text-[color:var(--text-strong)] hover:border-[color:var(--surface-2-border)]",
              "focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
              hasOverrides ? "text-[color:var(--text-strong)]" : "",
              className ?? "",
            ].join(" ")}
          >
            <IconText size={16} aria-hidden />
            <span className="hidden sm:inline">글꼴</span>
            <IconChevronDown size={14} />
          </button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-[260px] px-3 py-3">
          <div className="flex items-center justify-between pb-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--text-overlay-muted)]">
              테마 타이포그래피
            </p>
            {hasOverrides ? (
              <button
                type="button"
                onClick={() => resetTheme()}
                data-testid="typography-reset"
                className="text-[11px] text-[color:var(--text-overlay-soft)] hover:text-[color:var(--text-overlay)] focus-visible:outline-none"
              >
                초기화
              </button>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            {FONT_ROLES.map((role) => {
              // Effective font = user override ?? theme default ?? base. Ids may
              // be catalog OR ad-hoc (browse-picked) — resolveFontEntryById covers both.
              const overrideId = current[role.id];
              const overrideEntry =
                overrideId !== undefined ? resolveFontEntryById(overrideId) : undefined;
              const defaultId = defaults[role.id];
              const defaultEntry =
                defaultId !== undefined ? resolveFontEntryById(defaultId) : undefined;
              const triggerLabel =
                overrideEntry?.label ??
                (defaultEntry !== undefined ? `${defaultEntry.label} · 테마` : "테마 기본");
              const triggerStack = (overrideEntry ?? defaultEntry)?.stack;
              return (
                <div key={role.id} className="flex items-center gap-2">
                  <span className="w-9 shrink-0 text-[12px] text-[color:var(--text-overlay-soft)]">
                    {role.label}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="md"
                        data-testid={`typography-role-${role.id}-trigger`}
                        className="flex-1 justify-between"
                        style={{ fontFamily: triggerStack }}
                      >
                        {triggerLabel}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      sideOffset={6}
                      className="max-h-[50vh] overflow-y-auto"
                    >
                      <DropdownMenuItem
                        onSelect={() => setRole(role.id, null)}
                        data-testid={`typography-role-${role.id}-default`}
                      >
                        테마 기본
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setBrowseRole(role.id)}
                        data-testid={`typography-role-${role.id}-browse`}
                      >
                        모든 폰트 찾아보기…
                      </DropdownMenuItem>
                      {FONT_GROUPS.map((g) => (
                        <Fragment key={g.category}>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>{g.label}</DropdownMenuLabel>
                          {g.fonts.map((f) => (
                            <DropdownMenuItem
                              key={f.id}
                              onPointerEnter={() => ensureFontByStack(f.stack)}
                              onSelect={() => setRole(role.id, f.id)}
                              data-testid={`typography-role-${role.id}-${f.id}`}
                            >
                              <span style={{ fontFamily: f.stack }}>{f.label}</span>
                            </DropdownMenuItem>
                          ))}
                        </Fragment>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <FontBrowseDialog
        open={browseRole !== null}
        onOpenChange={(o) => {
          if (!o) setBrowseRole(null);
        }}
        onPick={(entry) => {
          // The dialog has already registered the ad-hoc font; bind it to the
          // role being edited (resolveFontEntryById will find it).
          if (browseRole !== null) setRole(browseRole, entry.id);
          setBrowseRole(null);
        }}
      />
    </>
  );
}
