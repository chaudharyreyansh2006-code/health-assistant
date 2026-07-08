"use client";

import { useState } from "react";
import { Loader2Icon, PillIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type WithFood = "before" | "after" | "with" | "any";

export type AddMedicationValues = {
  drugName: string;
  doseValue: number;
  doseUnit: string;
  scheduleTimes: string[];
  withFood: WithFood;
  // Optional fields the parser may surface; we pass them through when present.
  brandName?: string;
  notes?: string;
};

type ParsedDraft = {
  drugName: string;
  brandName?: string | null;
  doseValue: number;
  doseUnit: string;
  frequency: "once-daily" | "twice-daily" | "thrice-daily" | "as-needed";
  scheduleTimes: string[];
  withFood: WithFood;
  notes?: string | null;
};

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

const PLACEHOLDER_EXAMPLES = [
  "Amlodipine 5 mg morning after breakfast",
  "Metformin 500 mg twice daily",
  "Atorvastatin 10 mg at bedtime",
  "Paracetamol 650 mg as needed",
];

export function AddMedicationDialog({
  open,
  onOpenChange,
  onSubmit,
  memberId: _memberId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (values: AddMedicationValues) => Promise<void>;
  memberId: string;
}) {
  // ---- Parser view (default) ----
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // ---- Review / Adjust view (after parse) ----
  const [draft, setDraft] = useState<ParsedDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // ---- Adjust form local state (mirrors ParsedDraft) ----
  const [drugName, setDrugName] = useState("");
  const [doseValue, setDoseValue] = useState("1");
  const [doseUnit, setDoseUnit] = useState("tablet");
  const [scheduleText, setScheduleText] = useState("");
  const [withFood, setWithFood] = useState<WithFood>("any");

  const reset = () => {
    setText("");
    setParseError(null);
    setDraft(null);
    setEditing(false);
    setSaving(false);
    setDrugName("");
    setDoseValue("1");
    setDoseUnit("tablet");
    setScheduleText("");
    setWithFood("any");
  };

  const handleClose = (o: boolean) => {
    if (!o) {
      reset();
    }
    onOpenChange(o);
  };

  const handleParse = async () => {
    setParseError(null);
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      setParseError("Type the prescription in your own words first.");
      return;
    }
    setParsing(true);
    try {
      const res = await fetch("/api/health/medications/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setParseError(
          data?.error || "Couldn't parse that. Try rewording or click Adjust."
        );
        return;
      }
      const p: ParsedDraft = data.parsed;
      setDraft(p);
      // Pre-fill the adjust form too
      setDrugName(p.drugName);
      setDoseValue(String(p.doseValue));
      setDoseUnit(p.doseUnit);
      setScheduleText(formatSlots(p.scheduleTimes));
      setWithFood(p.withFood);
    } catch (err: any) {
      setParseError(err?.message || "Parser is unavailable right now.");
    } finally {
      setParsing(false);
    }
  };

  const handleSave = async (values: {
    drugName: string;
    doseValue: number;
    doseUnit: string;
    scheduleTimes: string[];
    withFood: WithFood;
  }) => {
    setSaving(true);
    try {
      await onSubmit(values);
      handleClose(false);
    } catch (err: any) {
      toast.error(err?.message || "Could not save medication.");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDraft = () => {
    if (!draft) {
      return;
    }
    handleSave({
      drugName: draft.drugName,
      doseValue: draft.doseValue,
      doseUnit: draft.doseUnit,
      scheduleTimes: draft.scheduleTimes,
      withFood: draft.withFood,
    });
  };

  const handleSaveFromForm = () => {
    if (!drugName.trim()) {
      toast.error("Drug name is required.");
      return;
    }
    const scheduleTimes = parseSlots(scheduleText);
    if (scheduleTimes.length === 0) {
      toast.error("Add at least one time in HH:MM (24h).");
      return;
    }
    const numericDose = Number.parseFloat(doseValue);
    if (!Number.isFinite(numericDose) || numericDose <= 0) {
      toast.error("Dose must be a positive number.");
      return;
    }
    handleSave({
      drugName: drugName.trim(),
      doseValue: numericDose,
      doseUnit: doseUnit.trim() || "tablet",
      scheduleTimes,
      withFood,
    });
  };

  return (
    <Dialog onOpenChange={handleClose} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PillIcon className="size-4" /> Add medication
          </DialogTitle>
          <DialogDescription>
            {draft && !editing
              ? "Confirm the schedule, or adjust a field."
              : "Type the prescription in your own words. The parser fills the rest."}
          </DialogDescription>
        </DialogHeader>

        {/* ---- Step 1: Parse (default view) ---- */}
        {!draft || editing ? (
          <div className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="nlp-text">Prescription</Label>
              <textarea
                autoFocus
                className="flex min-h-[88px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                disabled={parsing}
                id="nlp-text"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    handleParse();
                  }
                }}
                placeholder={`e.g. ${PLACEHOLDER_EXAMPLES[0]}`}
                value={text}
              />
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                ⌘⏎ to parse
              </p>
            </div>

            {parseError ? (
              <p className="text-xs text-destructive">{parseError}</p>
            ) : null}

            <div className="flex items-center justify-between">
              <Button
                disabled={parsing}
                onClick={() => handleClose(false)}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button
                disabled={parsing || text.trim().length < 3}
                onClick={handleParse}
                type="button"
              >
                {parsing ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <SparklesIcon className="size-3.5" />
                )}
                Parse
              </Button>
            </div>

            {/* When user already has a draft and clicked "Adjust", show the form below */}
            {editing && draft ? (
              <>
                <div className="h-px bg-border" />
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Adjust
                </p>
                <div className="flex flex-col gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="drugName">Drug name</Label>
                    <Input
                      id="drugName"
                      onChange={(e) => setDrugName(e.target.value)}
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
                        value={doseValue}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="doseUnit">Unit</Label>
                      <Input
                        id="doseUnit"
                        onChange={(e) => setDoseUnit(e.target.value)}
                        value={doseUnit}
                      />
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="schedule">Times (24h HH:MM)</Label>
                    <Input
                      id="schedule"
                      onChange={(e) => setScheduleText(e.target.value)}
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
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      disabled={saving}
                      onClick={() => setEditing(false)}
                      type="button"
                      variant="ghost"
                    >
                      Back to summary
                    </Button>
                    <Button
                      disabled={saving}
                      onClick={handleSaveFromForm}
                      type="button"
                    >
                      {saving ? (
                        <Loader2Icon className="size-3.5 animate-spin" />
                      ) : null}
                      Save medication
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        ) : (
          /* ---- Step 2: Review summary ---- */
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <Row label="Drug">
                <span className="font-medium">{draft.drugName}</span>
                {draft.brandName ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {draft.brandName}
                  </span>
                ) : null}
              </Row>
              <Row label="Dose">
                <span className="font-mono tabular-nums">
                  {draft.doseValue} {draft.doseUnit}
                </span>
                {draft.frequency !== "as-needed" ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {draft.frequency.replace("-", " ")}
                  </span>
                ) : (
                  <span className="text-muted-foreground"> · as needed</span>
                )}
              </Row>
              <Row label="Times">
                <span className="font-mono tabular-nums">
                  {draft.scheduleTimes.join(" · ")}
                </span>
                {draft.withFood !== "any" ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {draft.withFood} food
                  </span>
                ) : null}
              </Row>
              {draft.notes ? <Row label="Notes">{draft.notes}</Row> : null}
            </div>

            <div className="h-px bg-border" />

            <div className="flex items-center justify-between">
              <Button
                disabled={saving}
                onClick={() => setEditing(true)}
                type="button"
                variant="ghost"
              >
                Adjust
              </Button>
              <Button
                disabled={saving}
                onClick={handleConfirmDraft}
                type="button"
              >
                {saving ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : null}
                Save medication
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-4 text-sm">
      <span className="w-14 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <span className="flex-1">{children}</span>
    </div>
  );
}
