"use client";

import { useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type VitalType = "bp" | "glucose" | "weight" | "spo2" | "hr" | "temp" | "sleep";

const META: Record<
  VitalType,
  { label: string; unit?: string; context?: "fasting" | "pp" | "random" }
> = {
  bp: { label: "Blood pressure" },
  glucose: {
    label: "Glucose",
    unit: "mg/dL",
    context: "fasting",
  },
  weight: { label: "Weight", unit: "kg" },
  spo2: { label: "SpO₂", unit: "%" },
  hr: { label: "Heart rate", unit: "bpm" },
  temp: { label: "Temperature", unit: "°C" },
  sleep: { label: "Sleep", unit: "h" },
};

export function LogVitalDialog({
  open,
  onOpenChange,
  onSubmit,
  type,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (payload: {
    type: VitalType;
    value?: number;
    unit?: string;
    systolic?: number;
    diastolic?: number;
    pulse?: number;
    context?: string;
  }) => Promise<void>;
  type: VitalType | null;
}) {
  // BP fields
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [pulse, setPulse] = useState("");
  // Single-value field
  const [value, setValue] = useState("");
  // Glucose context
  const [context, setContext] = useState<"fasting" | "pp" | "random">(
    "fasting"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSystolic("");
      setDiastolic("");
      setPulse("");
      setValue("");
      setContext("fasting");
      setError(null);
    }
  }, [open, type]);

  if (!type) {
    return null;
  }
  const meta = META[type];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const payload: Parameters<typeof onSubmit>[0] = { type };

    if (type === "bp") {
      const s = Number.parseInt(systolic, 10);
      const d = Number.parseInt(diastolic, 10);
      const p = pulse ? Number.parseInt(pulse, 10) : undefined;
      if (!Number.isFinite(s) || !Number.isFinite(d) || s <= 0 || d <= 0) {
        setError("Systolic and diastolic are required.");
        return;
      }
      payload.systolic = s;
      payload.diastolic = d;
      if (p && Number.isFinite(p)) {
        payload.pulse = p;
      }
    } else {
      const v = Number.parseFloat(value);
      if (!Number.isFinite(v) || v <= 0) {
        setError("Value is required.");
        return;
      }
      payload.value = v;
      payload.unit = meta.unit;
      if (meta.context) {
        payload.context = context;
      }
    }

    setSaving(true);
    try {
      await onSubmit(payload);
    } catch (err: any) {
      setError(err?.message || "Could not save reading.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Log {meta.label.toLowerCase()}</DialogTitle>
          <DialogDescription>
            Defaults to right now. Edit if you’re backfilling.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {type === "bp" ? (
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="systolic">Systolic</Label>
                <Input
                  autoFocus
                  id="systolic"
                  inputMode="numeric"
                  onChange={(e) => setSystolic(e.target.value)}
                  placeholder="120"
                  value={systolic}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="diastolic">Diastolic</Label>
                <Input
                  id="diastolic"
                  inputMode="numeric"
                  onChange={(e) => setDiastolic(e.target.value)}
                  placeholder="80"
                  value={diastolic}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pulse">Pulse</Label>
                <Input
                  id="pulse"
                  inputMode="numeric"
                  onChange={(e) => setPulse(e.target.value)}
                  placeholder="72"
                  value={pulse}
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="value">
                {meta.label}
                {meta.unit ? ` (${meta.unit})` : ""}
              </Label>
              <Input
                autoFocus
                id="value"
                inputMode="decimal"
                onChange={(e) => setValue(e.target.value)}
                placeholder="0"
                value={value}
              />
              {meta.context ? (
                <div className="mt-2 flex gap-1">
                  {(["fasting", "pp", "random"] as const).map((c) => (
                    <button
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        context === c
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                      key={c}
                      onClick={() => setContext(c)}
                      type="button"
                    >
                      {c === "pp" ? "post-meal" : c}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : null}

          <DialogFooter>
            <Button
              disabled={saving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button disabled={saving} type="submit">
              {saving ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
              Save reading
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
