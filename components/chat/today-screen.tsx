"use client";

import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleDashedIcon,
  ClockIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PillIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  SirenIcon,
  StethoscopeIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetcher } from "@/lib/utils";
import {
  CommandPalette,
  useCommandPaletteShortcut,
  type PaletteAction,
} from "./command-palette";
import { AddMedicationDialog, type AddMedicationValues } from "./add-medication-dialog";
import { LogVitalDialog } from "@/components/chat/log-vital-dialog";

// ---------- Types (mirror the API shapes) ----------

type DoseStatus = "taken" | "skipped" | "missed" | "snoozed";

type Medication = {
  id: string;
  memberId: string;
  drugName: string;
  brandName: string | null;
  doseValue: string;
  doseUnit: string;
  frequency: string;
  scheduleTimes: string[]; // 'HH:MM'
  withFood: "before" | "after" | "with" | "any";
  status: "active" | "paused" | "stopped" | "completed";
};

type DoseEvent = {
  id: string;
  medicationId: string;
  memberId: string;
  scheduledFor: string; // ISO
  takenAt: string | null;
  status: DoseStatus;
};

type Vital = {
  id: string;
  memberId: string;
  type: "bp" | "glucose" | "weight" | "spo2" | "hr" | "temp" | "sleep";
  recordedAt: string;
  value: string | null;
  unit: string | null;
  systolic: string | null;
  diastolic: string | null;
  pulse: string | null;
};

// ---------- Time math (no timezone surprises) ----------

const MIN = 60_000;
const DUE_WINDOW_MS = 30 * MIN; // anything within ±30 min counts as "due now"

function todayBounds(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function combineDateAndTime(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map((s) => Number.parseInt(s, 10));
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
}

// ---------- Component ----------

export function TodayScreen({ memberId }: { memberId: string }) {
  const { data: medsData, mutate: refetchMeds } = useSWR<{
    medications: Medication[];
  }>(memberId ? `/api/health/medications?memberId=${memberId}` : null, fetcher);
  const medications = medsData?.medications ?? [];
  const { start, end } = todayBounds();
  const { data: logsData, mutate: refetchLogs } = useSWR<{ logs: DoseEvent[] }>(
    memberId
      ? `/api/health/medication-logs?memberId=${memberId}&from=${start.toISOString()}&to=${end.toISOString()}`
      : null,
    fetcher
  );
  const todayLogs = logsData?.logs ?? [];
  const sevenAgo = daysAgo(7);
  const { data: vitalsData, mutate: refetchVitals } = useSWR<{ vitals: Vital[] }>(
    memberId
      ? `/api/health/vitals?memberId=${memberId}&since=${sevenAgo.toISOString()}`
      : null,
    fetcher
  );
  const vitals = vitalsData?.vitals ?? [];

  const [addMedOpen, setAddMedOpen] = useState(false);
  const [logVitalType, setLogVitalType] = useState<Vital["type"] | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [inactiveOpen, setInactiveOpen] = useState(false);
  const [medToDelete, setMedToDelete] = useState<Medication | null>(null);

  useCommandPaletteShortcut(setPaletteOpen);

  const activeMedications = medications.filter((m) => m.status === "active");
  const inactiveMedications = medications.filter(
    (m) => m.status !== "active"
  );

  // Project every scheduled dose for today from the active medication list.
  const scheduled = buildScheduledDoses(medications ?? [], todayLogs ?? []);
  const now = Date.now();
  const dueNow = scheduled.filter(
    (d) => Math.abs(d.scheduledFor.getTime() - now) <= DUE_WINDOW_MS
  );
  const pastNotTaken = scheduled.filter(
    (d) =>
      d.scheduledFor.getTime() < now - DUE_WINDOW_MS &&
      d.logStatus === null
  );
  const upcoming = scheduled.filter(
    (d) => d.scheduledFor.getTime() > now + DUE_WINDOW_MS
  );

  const handleDose = async (
    dose: ScheduledDose,
    status: Extract<DoseStatus, "taken" | "skipped">
  ) => {
    try {
      const res = await fetch("/api/health/medication-logs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          medicationId: dose.medicationId,
          memberId,
          scheduledFor: dose.scheduledFor.toISOString(),
          status,
        }),
      });
      if (!res.ok) {
        throw new Error("Could not save dose event");
      }
      refetchLogs();
    } catch (err: any) {
      toast.error(err.message || "Could not save dose event");
    }
  };

  const handleAddVital = async (payload: {
    type: Vital["type"];
    value?: number;
    unit?: string;
    systolic?: number;
    diastolic?: number;
    pulse?: number;
    context?: string;
  }) => {
    try {
      const res = await fetch("/api/health/vitals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberId, ...payload }),
      });
      if (!res.ok) {
        throw new Error("Could not log vital");
      }
      refetchVitals();
      setLogVitalType(null);
      toast.success("Reading saved.");
    } catch (err: any) {
      toast.error(err.message || "Could not log vital");
    }
  };

  const handleAddMedication = async (values: AddMedicationValues) => {
    try {
      const res = await fetch("/api/health/medications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          memberId,
          drugName: values.drugName,
          brandName: values.brandName ?? undefined,
          doseValue: values.doseValue,
          doseUnit: values.doseUnit,
          frequency:
            values.scheduleTimes.length > 1
              ? `${values.scheduleTimes.length}-times-daily`
              : "once-daily",
          scheduleTimes: values.scheduleTimes,
          withFood: values.withFood,
          notes: values.notes ?? undefined,
        }),
      });
      if (!res.ok) {
        throw new Error("Could not add medication");
      }
      refetchMeds();
      setAddMedOpen(false);
      toast.success("Medication added.");
    } catch (err: any) {
      toast.error(err.message || "Could not add medication");
    }
  };

  // Status flip (pause / resume / stop / complete) — reversible, no confirm.
  const handleMedStatus = async (
    med: Medication,
    status: Medication["status"]
  ) => {
    try {
      const res = await fetch(`/api/health/medications/${med.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        throw new Error("Could not update medication");
      }
      refetchMeds();
      const label =
        status === "paused"
          ? "Paused."
          : status === "stopped"
            ? "Marked as stopped."
            : status === "completed"
              ? "Marked as completed."
              : "Resumed.";
      toast.success(label);
    } catch (err: any) {
      toast.error(err.message || "Could not update medication");
    }
  };

  // Hard delete — confirmed via AlertDialog before this fires.
  const handleDeleteMed = async (med: Medication) => {
    try {
      const res = await fetch(`/api/health/medications/${med.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Could not delete medication");
      }
      refetchMeds();
      toast.success("Medication removed.");
    } catch (err: any) {
      toast.error(err.message || "Could not delete medication");
    } finally {
      setMedToDelete(null);
    }
  };

  // Undo a wrong dose event. Deletes the MedicationLog row so the dose
  // returns to "due" state. No confirm — single-row delete, easy to re-tap.
  const handleUndoLog = async (logId: string) => {
    try {
      const res = await fetch(`/api/health/medication-logs/${logId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Could not undo");
      }
      refetchLogs();
    } catch (err: any) {
      toast.error(err.message || "Could not undo");
    }
  };

  // ---- Command palette actions (built per render so they reflect live state) ----
  const paletteActions: PaletteAction[] = [
    {
      id: "log-bp",
      group: "Log a reading",
      label: "Log blood pressure",
      hint: "systolic / diastolic / pulse",
      keywords: ["bp", "blood", "pressure", "hypertension"],
      onSelect: () => setLogVitalType("bp"),
    },
    {
      id: "log-glucose",
      group: "Log a reading",
      label: "Log glucose",
      hint: "fasting / post-meal / random",
      keywords: ["sugar", "diabetes", "glucose"],
      onSelect: () => setLogVitalType("glucose"),
    },
    {
      id: "log-weight",
      group: "Log a reading",
      label: "Log weight",
      keywords: ["weight", "kg", "mass"],
      onSelect: () => setLogVitalType("weight"),
    },
    {
      id: "log-spo2",
      group: "Log a reading",
      label: "Log SpO₂",
      hint: "oxygen saturation",
      keywords: ["spo2", "oxygen", "saturation", "pulse ox"],
      onSelect: () => setLogVitalType("spo2"),
    },
    {
      id: "log-hr",
      group: "Log a reading",
      label: "Log heart rate",
      keywords: ["heart", "pulse", "bpm", "hr"],
      onSelect: () => setLogVitalType("hr"),
    },
    {
      id: "log-temp",
      group: "Log a reading",
      label: "Log temperature",
      keywords: ["temp", "fever", "temperature"],
      onSelect: () => setLogVitalType("temp"),
    },
    {
      id: "log-sleep",
      group: "Log a reading",
      label: "Log sleep",
      keywords: ["sleep", "hours"],
      onSelect: () => setLogVitalType("sleep"),
    },
    {
      id: "add-medication",
      group: "Schedule",
      label: "Add a medication",
      hint: "type the prescription in your own words",
      keywords: ["med", "medication", "pill", "prescription", "drug"],
      onSelect: () => setAddMedOpen(true),
    },
    ...(dueNow.length > 0
      ? [
          {
            id: "mark-taken",
            group: "Schedule",
            label: `Mark next dose taken · ${dueNow[0].drugName}`,
            hint: fmtTime(dueNow[0].scheduledFor),
            keywords: ["taken", "dose", "pill"],
            onSelect: () => handleDose(dueNow[0], "taken"),
          },
          {
            id: "mark-skipped",
            group: "Schedule",
            label: `Mark next dose skipped · ${dueNow[0].drugName}`,
            keywords: ["skip", "skipped", "dose"],
            onSelect: () => handleDose(dueNow[0], "skipped"),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {fmtDay(new Date())}
        </p>
        <h2 className="font-serif text-2xl font-medium tracking-tight">
          Today
        </h2>
        <p className="text-sm text-muted-foreground">
          What matters for this family member, in one breath.
        </p>
      </div>

      {/* DUE NOW + overdue */}
      <Section label="Due now" icon={<ClockIcon className="size-3.5" />}>
        {dueNow.length === 0 && pastNotTaken.length === 0 ? (
          <Empty>Nothing due right now. Take a breath.</Empty>
        ) : (
          [...pastNotTaken, ...dueNow].map((dose) => (
            <DoseRow
              key={`${dose.medicationId}-${dose.scheduledFor.toISOString()}`}
              dose={dose}
              onSkip={() => handleDose(dose, "skipped")}
              onTake={() => handleDose(dose, "taken")}
              onUndo={
                dose.logId ? () => handleUndoLog(dose.logId!) : undefined
              }
            />
          ))
        )}
      </Section>

      {/* LATER */}
      <Section label="Later today" icon={<PillIcon className="size-3.5" />}>
        {upcoming.length === 0 ? (
          <Empty>No more doses scheduled.</Empty>
        ) : (
          upcoming.map((dose) => (
            <UpcomingRow
              key={`${dose.medicationId}-${dose.scheduledFor.toISOString()}`}
              dose={dose}
            />
          ))
        )}
      </Section>

      {/* PRESCRIPTIONS — every active medication, tap to manage */}
      <Section
        label="Prescriptions"
        icon={<PillIcon className="size-3.5" />}
      >
        {activeMedications.length === 0 ? (
          <Empty>
            No active prescriptions. Add one from the menu or ⌘K.
          </Empty>
        ) : (
          activeMedications.map((med) => (
            <PrescriptionRow
              key={med.id}
              med={med}
              onChangeStatus={(status) => handleMedStatus(med, status)}
              onDelete={() => setMedToDelete(med)}
            />
          ))
        )}
      </Section>

      {/* LAST 7 DAYS */}
      <Section label="Last 7 days" icon={<StethoscopeIcon className="size-3.5" />}>
        <VitalSummary vitals={vitals ?? []} onLog={(type) => setLogVitalType(type)} />
      </Section>

      {/* INACTIVE — paused / stopped / completed, collapsed by default */}
      {inactiveMedications.length > 0 ? (
        <section className="flex flex-col gap-3">
          <button
            className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setInactiveOpen((o) => !o)}
            type="button"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.2em]">
              {inactiveOpen ? "Hide" : "Show"}{" "}
              {inactiveMedications.length} inactive prescription
              {inactiveMedications.length === 1 ? "" : "s"}
            </span>
            <span className="h-px flex-1 bg-border" />
            <span className="opacity-60">
              {inactiveOpen ? (
                <ChevronUpIcon className="size-3" />
              ) : (
                <ChevronDownIcon className="size-3" />
              )}
            </span>
          </button>
          {inactiveOpen ? (
            <div className="flex flex-col">
              {inactiveMedications.map((med) => (
                <PrescriptionRow
                  key={med.id}
                  med={med}
                  onChangeStatus={(status) => handleMedStatus(med, status)}
                  onDelete={() => setMedToDelete(med)}
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Delete medication confirmation */}
      <AlertDialog
        onOpenChange={(o) => !o && setMedToDelete(null)}
        open={medToDelete !== null}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this medication?</AlertDialogTitle>
            <AlertDialogDescription>
              {medToDelete
                ? `${medToDelete.drugName} ${medToDelete.doseValue} ${medToDelete.doseUnit} will be removed along with every dose log on record. This cannot be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => medToDelete && handleDeleteMed(medToDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Floating + button + Command-K hint */}
      <div className="sticky bottom-2 mt-2 flex items-center justify-between gap-3">
        <button
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
          onClick={() => setPaletteOpen(true)}
          type="button"
        >
          <SearchIcon className="size-3" />
          Quick log
          <kbd className="ml-1 rounded border border-border bg-muted/40 px-1 py-0.5 font-mono text-[10px]">
            ⌘K
          </kbd>
        </button>
        <Button
          className="rounded-full px-4"
          onClick={() => setPaletteOpen(true)}
          size="sm"
        >
          <PlusIcon className="size-3.5" />
          Log or add
        </Button>
      </div>

      <AddMedicationDialog
        memberId={memberId}
        onOpenChange={setAddMedOpen}
        onSubmit={handleAddMedication}
        open={addMedOpen}
      />

      <LogVitalDialog
        onOpenChange={(o) => !o && setLogVitalType(null)}
        onSubmit={handleAddVital}
        open={logVitalType !== null}
        type={logVitalType}
      />

      <CommandPalette
        actions={paletteActions}
        onOpenChange={setPaletteOpen}
        open={paletteOpen}
        placeholder="Log a reading, schedule a med, or mark a dose…"
      />
    </div>
  );
}

// ---------- Building blocks ----------

function Section({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em]">
          {label}
        </span>
        <span className="h-px flex-1 bg-border" />
        <span className="opacity-60">{icon}</span>
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

type ScheduledDose = {
  medicationId: string;
  drugName: string;
  doseValue: string;
  doseUnit: string;
  withFood: Medication["withFood"];
  scheduledFor: Date;
  logStatus: DoseStatus | null;
  logId: string | null;
};

function buildScheduledDoses(
  medications: Medication[],
  logs: DoseEvent[]
): ScheduledDose[] {
  const { start } = todayBounds();
  const logByKey = new Map<string, DoseEvent>();
  for (const log of logs) {
    logByKey.set(`${log.medicationId}|${log.scheduledFor}`, log);
  }
  const out: ScheduledDose[] = [];
  for (const med of medications) {
    if (med.status !== "active") {
      continue;
    }
    for (const hhmm of med.scheduleTimes) {
      const scheduledFor = combineDateAndTime(start, hhmm);
      const key = `${med.id}|${scheduledFor.toISOString()}`;
      const log = logByKey.get(key);
      out.push({
        medicationId: med.id,
        drugName: med.drugName,
        doseValue: med.doseValue,
        doseUnit: med.doseUnit,
        withFood: med.withFood,
        scheduledFor,
        logStatus: log?.status ?? null,
        logId: log?.id ?? null,
      });
    }
  }
  out.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
  return out;
}

function DoseRow({
  dose,
  onTake,
  onSkip,
  onUndo,
}: {
  dose: ScheduledDose;
  onTake: () => void;
  onSkip: () => void;
  onUndo?: () => void;
}) {
  const isPast = dose.scheduledFor.getTime() < Date.now() - DUE_WINDOW_MS;
  const taken = dose.logStatus === "taken";
  const skipped = dose.logStatus === "skipped";

  return (
    <div
      className={`group flex items-center gap-3 py-2 text-sm ${
        taken || skipped ? "opacity-60" : ""
      }`}
    >
      <span
        className={`w-12 font-mono text-xs tabular-nums ${
          isPast ? "text-destructive" : "text-foreground"
        }`}
      >
        {fmtTime(dose.scheduledFor)}
      </span>
      <span className="flex-1 truncate">
        <span className="font-medium">{dose.drugName}</span>{" "}
        <span className="text-muted-foreground">
          {Number(dose.doseValue).toString()} {dose.doseUnit}
          {dose.withFood !== "any" ? ` · ${dose.withFood} food` : ""}
        </span>
      </span>
      {taken ? (
        <span className="inline-flex items-center gap-2 text-xs text-emerald-600">
          <CheckIcon className="size-3" /> taken
          {onUndo ? (
            <button
              aria-label="Undo taken"
              className="inline-flex items-center gap-1 rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
              onClick={onUndo}
              type="button"
            >
              <Undo2Icon className="size-3" />
            </button>
          ) : null}
        </span>
      ) : skipped ? (
        <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <XIcon className="size-3" /> skipped
          {onUndo ? (
            <button
              aria-label="Undo skipped"
              className="inline-flex items-center gap-1 rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
              onClick={onUndo}
              type="button"
            >
              <Undo2Icon className="size-3" />
            </button>
          ) : null}
        </span>
      ) : isPast ? (
        <span className="inline-flex items-center gap-1 text-xs text-destructive">
          <SirenIcon className="size-3" /> missed
        </span>
      ) : (
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            onClick={onTake}
            size="sm"
            variant="ghost"
          >
            Take
          </Button>
          <Button
            className="text-muted-foreground"
            onClick={onSkip}
            size="sm"
            variant="ghost"
          >
            Skip
          </Button>
        </div>
      )}
    </div>
  );
}

function UpcomingRow({ dose }: { dose: ScheduledDose }) {
  return (
    <div className="flex items-center gap-3 py-2 text-sm text-muted-foreground">
      <span className="w-12 font-mono text-xs tabular-nums">
        {fmtTime(dose.scheduledFor)}
      </span>
      <span className="flex-1 truncate">
        <span className="font-medium text-foreground">{dose.drugName}</span>{" "}
        <span>
          {Number(dose.doseValue).toString()} {dose.doseUnit}
        </span>
      </span>
      <CircleDashedIcon className="size-3 opacity-50" />
    </div>
  );
}

// One row per prescription. Tap the row → inline menu (Pause / Stop /
// Mark complete / Resume / Delete). Status changes are reversible so
// they have no confirm. Delete cascades through logs and is confirmed in
// an AlertDialog by the parent.
function PrescriptionRow({
  med,
  onChangeStatus,
  onDelete,
}: {
  med: Medication;
  onChangeStatus: (status: Medication["status"]) => void;
  onDelete: () => void;
}) {
  const isInactive = med.status !== "active";
  return (
    <div
      className={`group flex items-center gap-3 py-2 text-sm ${
        isInactive ? "opacity-50" : ""
      }`}
    >
      <span className="flex-1 truncate">
        <span className="font-medium">{med.drugName}</span>{" "}
        <span className="text-muted-foreground">
          {Number(med.doseValue).toString()} {med.doseUnit}
          {med.scheduleTimes.length > 0
            ? ` · ${med.scheduleTimes.join(" · ")}`
            : ""}
          {med.withFood !== "any" ? ` · ${med.withFood} food` : ""}
        </span>
        {isInactive ? (
          <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {med.status}
          </span>
        ) : null}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`Manage ${med.drugName}`}
            className="inline-flex size-7 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted/60 hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
            type="button"
          >
            <MoreHorizontalIcon className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {med.status === "active" ? (
            <>
              <DropdownMenuItem
                onSelect={() => onChangeStatus("paused")}
              >
                <PauseIcon className="size-3.5" />
                Pause
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onChangeStatus("stopped")}
              >
                <XIcon className="size-3.5" />
                Mark as stopped
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onChangeStatus("completed")}
              >
                <CheckIcon className="size-3.5" />
                Mark as completed
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem
              onSelect={() => onChangeStatus("active")}
            >
              <PlayIcon className="size-3.5" />
              Resume
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={onDelete}
          >
            <XIcon className="size-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function VitalSummary({
  vitals,
  onLog,
}: {
  vitals: Vital[];
  onLog: (type: Vital["type"]) => void;
}) {
  const byType = groupBy(vitals, (v) => v.type);
  const stats: {
    type: Vital["type"];
    label: string;
    summary: React.ReactNode;
  }[] = [];

  // BP
  if (byType.bp?.length) {
    const sys = byType.bp
      .map((v) => Number(v.systolic))
      .filter((n) => Number.isFinite(n));
    const dia = byType.bp
      .map((v) => Number(v.diastolic))
      .filter((n) => Number.isFinite(n));
    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    stats.push({
      type: "bp",
      label: "Blood pressure",
      summary: (
        <span>
          avg {avg(sys)}/{avg(dia)} across {byType.bp.length} readings
        </span>
      ),
    });
  }

  if (byType.glucose?.length) {
    const vals = byType.glucose
      .map((v) => Number(v.value))
      .filter((n) => Number.isFinite(n));
    const first = vals[vals.length - 1];
    const last = vals[0];
    const dir =
      vals.length >= 2 ? (last < first ? "down" : last > first ? "up" : "flat") : "flat";
    stats.push({
      type: "glucose",
      label: "Glucose",
      summary: (
        <span className="inline-flex items-center gap-1">
          {Math.round(last)} {byType.glucose[0].unit ?? "mg/dL"}
          {dir === "down" ? (
            <TrendingDownIcon className="size-3 text-emerald-600" />
          ) : dir === "up" ? (
            <TrendingUpIcon className="size-3 text-amber-600" />
          ) : null}
        </span>
      ),
    });
  }

  if (byType.weight?.length) {
    const vals = byType.weight
      .map((v) => Number(v.value))
      .filter((n) => Number.isFinite(n));
    const first = vals[vals.length - 1];
    const last = vals[0];
    const delta = vals.length >= 2 ? last - first : 0;
    stats.push({
      type: "weight",
      label: "Weight",
      summary: (
        <span className="inline-flex items-center gap-1">
          {last} {byType.weight[0].unit ?? "kg"}
          {delta !== 0 ? (
            <span
              className={
                delta < 0 ? "text-emerald-600" : "text-amber-600"
              }
            >
              {delta > 0 ? "+" : ""}
              {delta.toFixed(1)}
            </span>
          ) : null}
        </span>
      ),
    });
  }

  if (stats.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No readings this week.{" "}
        <button
          className="underline underline-offset-2"
          onClick={() => onLog("bp")}
          type="button"
        >
          Log blood pressure
        </button>
        .
      </p>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {stats.map((s) => (
        <button
          className="-mx-2 flex items-baseline gap-3 rounded px-2 py-2 text-left text-sm transition-colors hover:bg-muted/40"
          key={s.type}
          onClick={() => onLog(s.type)}
          type="button"
        >
          <span className="w-32 truncate text-muted-foreground">
            {s.label}
          </span>
          <span className="font-medium">{s.summary}</span>
        </button>
      ))}
    </div>
  );
}

function groupBy<T, K extends string>(
  arr: T[],
  key: (item: T) => K
): Partial<Record<K, T[]>> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    (acc[k] ||= []).push(item);
    return acc;
  }, {} as Partial<Record<K, T[]>>);
}
