"use client";

import { useState } from "react";
import { Loader2Icon, PillIcon } from "lucide-react";
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

type WithFood = "before" | "after" | "with" | "any";

const DEFAULT_SLOTS = ["08:00", "20:00"];

function parseSlots(text: string): string[] {
  return text
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s));
}

function formatSlots(slots: string[]): string {
  return slots.join(", ");
}

export function AddMedicationDialog({
  open,
  onOpenChange,
  onSubmit,
  memberId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (values: {
    drugName: string;
    doseValue: number;
    doseUnit: string;
    scheduleTimes: string[];
    withFood: WithFood;
  }) => Promise<void>;
  memberId: string;
}) {
  const [drugName, setDrugName] = useState("");
  const [doseValue, setDoseValue] = useState("1");
  const [doseUnit, setDoseUnit] = useState("tablet");
  const [scheduleText, setScheduleText] = useState(formatSlots(DEFAULT_SLOTS));
  const [withFood, setWithFood] = useState<WithFood>("any");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setDrugName("");
    setDoseValue("1");
    setDoseUnit("tablet");
    setScheduleText(formatSlots(DEFAULT_SLOTS));
    setWithFood("any");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!drugName.trim()) {
      setError("Drug name is required.");
      return;
    }
    const scheduleTimes = parseSlots(scheduleText);
    if (scheduleTimes.length === 0) {
      setError("Add at least one time in HH:MM (24h).");
      return;
    }
    const numericDose = Number.parseFloat(doseValue);
    if (!Number.isFinite(numericDose) || numericDose <= 0) {
      setError("Dose must be a positive number.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        drugName: drugName.trim(),
        doseValue: numericDose,
        doseUnit: doseUnit.trim() || "tablet",
        scheduleTimes,
        withFood,
      });
      reset();
    } catch (err: any) {
      setError(err?.message || "Could not add medication.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      onOpenChange={(o) => {
        if (!o) {
          reset();
        }
        onOpenChange(o);
      }}
      open={open}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PillIcon className="size-4" /> Add medication
          </DialogTitle>
          <DialogDescription>
            One field per line. Times in 24h HH:MM, comma-separated.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-1.5">
            <Label htmlFor="drugName">Drug name</Label>
            <Input
              autoFocus
              id="drugName"
              onChange={(e) => setDrugName(e.target.value)}
              placeholder="Amlodipine"
              value={drugName}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="doseValue">Dose</Label>
              <Input
                id="doseValue"
                inputMode="decimal"
                onChange={(e) => setDoseValue(e.target.value)}
                placeholder="5"
                value={doseValue}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="doseUnit">Unit</Label>
              <Input
                id="doseUnit"
                onChange={(e) => setDoseUnit(e.target.value)}
                placeholder="mg"
                value={doseUnit}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="schedule">Times (24h HH:MM)</Label>
            <Input
              id="schedule"
              onChange={(e) => setScheduleText(e.target.value)}
              placeholder="08:00, 20:00"
              value={scheduleText}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="withFood">With food</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              id="withFood"
              onChange={(e) => setWithFood(e.target.value as WithFood)}
              value={withFood}
            >
              <option value="any">Any time</option>
              <option value="before">Before food</option>
              <option value="with">With food</option>
              <option value="after">After food</option>
            </select>
          </div>

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
              Save medication
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
