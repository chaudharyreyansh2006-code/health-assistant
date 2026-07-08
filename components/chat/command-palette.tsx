"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { SearchIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

export type PaletteAction = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  keywords?: string[];
  onSelect: () => void;
};

export function CommandPalette({
  open,
  onOpenChange,
  actions,
  placeholder = "What do you want to log?",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  actions: PaletteAction[];
  placeholder?: string;
}) {
  // Reset the cmdk search value when the dialog closes so the next open
  // doesn't show a stale filter.
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (!open) {
      // Defer to next tick so the unmount doesn't kill the search input's
      // controlled value before the dialog animation finishes.
      const t = setTimeout(() => setSearch(""), 150);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  const grouped = actions.reduce<Record<string, PaletteAction[]>>(
    (acc, a) => {
      if (!acc[a.group]) {
        acc[a.group] = [];
      }
      acc[a.group].push(a);
      return acc;
    },
    {}
  );
  const groupKeys = Object.keys(grouped);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-w-lg gap-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command
          // `cmdk` wants a label; we hide it from assistive tech via the
          // surrounding Dialog title.
          label="Command palette"
          shouldFilter
          className="flex flex-col"
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <Command.Input
              autoFocus
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              onValueChange={setSearch}
              placeholder={placeholder}
              value={search}
            />
            <kbd className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              esc
            </kbd>
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nothing matches "{search}".
            </Command.Empty>
            {groupKeys.map((group, gi) => (
              <Command.Group
                className="px-1 pb-1 text-foreground"
                heading={group}
                key={group}
              >
                {grouped[group].map((action) => (
                  <Command.Item
                    className="flex cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm aria-selected:bg-muted/60 data-[selected=true]:bg-muted/60"
                    key={action.id}
                    keywords={action.keywords}
                    onSelect={() => {
                      action.onSelect();
                      onOpenChange(false);
                    }}
                    value={`${action.label} ${action.hint ?? ""} ${(action.keywords ?? []).join(" ")}`}
                  >
                    <span className="flex-1 truncate">
                      <span className="text-foreground">{action.label}</span>
                      {action.hint ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {action.hint}
                        </span>
                      ) : null}
                    </span>
                  </Command.Item>
                ))}
                {gi < groupKeys.length - 1 ? (
                  <div className="mx-3 my-1 h-px bg-border/60" />
                ) : null}
              </Command.Group>
            ))}
          </Command.List>

          <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
            <span>Navigate</span>
            <span className="flex items-center gap-2">
              <kbd className="rounded border border-border bg-muted/40 px-1 py-0.5">
                ↑↓
              </kbd>
              <span>select</span>
              <kbd className="rounded border border-border bg-muted/40 px-1 py-0.5">
                ↵
              </kbd>
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook: open the palette on ⌘K / Ctrl-K. Returns a ref-like open/close
 * pair so callers can also wire their own trigger button.
 */
export function useCommandPaletteShortcut(setOpen: (o: boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
}
