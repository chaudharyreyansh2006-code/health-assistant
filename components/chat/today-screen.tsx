"use client";

import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import {
  CheckIcon,
  CircleDashedIcon,
  ClockIcon,
  PillIcon,
  PlusIcon,
  SirenIcon,
  StethoscopeIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  XIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/utils";
import { AddMedicationDialog } from "./add-medication-dialog";
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

  const handleAddMedication = async (values: {
    drugName: string;
    doseValue: number;
    doseUnit: string;
    scheduleTimes: string[];
    withFood: "before" | "after" | "with" | "any";
  }) => {
    try {
      const res = await fetch("/api/health/medications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          memberId,
          ...values,
          frequency:
            values.scheduleTimes.length > 1
              ? `${values.scheduleTimes.length}-times-daily`
              : "once-daily",
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
              onTake={() => handleDose(dose, "taken")}
              onSkip={() => handleDose(dose, "skipped")}
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

      {/* LAST 7 DAYS */}
      <Section label="Last 7 days" icon={<StethoscopeIcon className="size-3.5" />}>
        <VitalSummary vitals={vitals ?? []} onLog={(type) => setLogVitalType(type)} />
      </Section>

      {/* Floating + button */}
      <div className="sticky bottom-2 mt-2 flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="rounded-full px-4" size="sm">
              <PlusIcon className="size-3.5" />
              Log or add
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Log a reading
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setLogVitalType("bp")}>
              <StethoscopeIcon className="size-3.5" />
              Blood pressure
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setLogVitalType("glucose")}>
              <StethoscopeIcon className="size-3.5" />
              Glucose
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setLogVitalType("weight")}>
              <StethoscopeIcon className="size-3.5" />
              Weight
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setLogVitalType("spo2")}>
              <StethoscopeIcon className="size-3.5" />
              SpO₂
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Schedule
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setAddMedOpen(true)}>
              <PillIcon className="size-3.5" />
              Add a medication
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
}: {
  dose: ScheduledDose;
  onTake: () => void;
  onSkip: () => void;
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
        <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
          <CheckIcon className="size-3" /> taken
        </span>
      ) : skipped ? (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <XIcon className="size-3" /> skipped
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
