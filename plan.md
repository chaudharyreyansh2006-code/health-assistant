
---

## 1. Data model (the spine)

Keep it normalized so the AI can reason, but don’t over-model. One row per *event* (a dose taken, a BP reading), not per *intent*.

```ts
// A prescription — the schedule, not the history
medication: {
  id, memberId, drugName, brandName?, doseValue, doseUnit,        // "5", "mg"
  frequency,         // 'once-daily' | 'twice-daily' | 'thrice-daily' | 'every-X-hours' | 'as-needed' | custom
  scheduleTimes,     // ['08:00', '20:00']  ← local times, with timezone
  withFood,          // 'before' | 'after' | 'with' | 'any'
  startDate, endDate?, prescribedBy?, notes?,
  remainingQty?, refillAt?, pharmacy?,
  status             // 'active' | 'paused' | 'stopped' | 'completed'
}

// A single dose event (the truth)
medicationLog: {
  id, medicationId, memberId,
  scheduledFor,      // timestamp — the slot
  takenAt?,          // timestamp — actual
  status,            // 'taken' | 'skipped' | 'missed' | 'snoozed'
  skipReason?, notes?,
  source             // 'manual' | 'auto-snoozed' | 'caregiver'
}

// A single measurement
vital: {
  id, memberId,
  type,              // 'bp' | 'glucose' | 'weight' | 'spo2' | 'hr' | 'temp' | 'sleep' | custom
  recordedAt,        // timestamp
  // For BP: { systolic, diastolic, pulse }
  // For glucose: { value, context: 'fasting'|'pp'|'random' }
  // For others:  { value, unit }
  context,           // 'home' | 'clinic' | 'wearable' | 'manual'
  source, notes?
}

// Per-type thresholds (auto-learned but adjustable)
vitalThreshold: {
  memberId, type,
  warnMin, warnMax, criticalMin, criticalMax
}
```

Two reasons for this shape:
- The chat can reason over **events**, not snapshots: “you took your BP med at 8:14, BP 138/86 an hour later.”
- Thresholds are *per member, per type* — a 130/85 reading is critical for a pregnancy, fine for a healthy adult. Defaults can ship; users tune.

---

## 2. The *Today* screen — the actual home for a family

This is the only view the caregiver needs 80% of the time. No cards-in-a-grid. Typography drives hierarchy.

```
─────────────────────────────────────────────────────────────
  TUESDAY · 8 JULY                                  Aarav, 9

  Good morning, Priya. Here’s what matters today.

  ── DUE NOW ───────────────────────────────────────────
  08:00   Amlodipine 5 mg          [  Take  ]  [ Skip ]
  08:30   BP check (Dr Rao, weekly) [  Log  ]

  ── LATER ─────────────────────────────────────────────
  14:00   Metformin 500 mg         [  Snooze 1h  ]
  21:00   Atorvastatin 10 mg

  ── LAST 7 DAYS ───────────────────────────────────────
  6 of 7 morning doses taken     BP avg 132/84  ✓
  1 missed  — Mon 07:00           Glucose 142 → 118  ↘
                                  Sleep 6.4 h avg   ↘
─────────────────────────────────────────────────────────────
```

Why this works for your design language:
- **One column**, generous leading, no card grid.
- A single hairline (`──`) is the only divider. No shadows. No rounded boxes.
- Color is reserved for *state* (taken = one tint, missed = one tint), never for decoration.
- “Last 7 days” is one prose line per metric, not a chart grid. Charts only when the user asks for them.

---

## 3. Capture flows — minimum friction, smart by default

### 3.1 Adding a medication

The killer move is **natural-language parsing at the top, structured fields below**. Single field, one tab-stop:

```
+ Add medication
─────────────────────────────────────────
Type prescription, e.g. "Amlodipine 5 mg
morning after breakfast, for dad"

  ┌──────────────────────────────────────┐
  │                                      │
  └──────────────────────────────────────┘

→ Parsed:
  Amlodipine 5 mg · once daily · 08:00
  After breakfast · For: dad

  [ Adjust ]  [ Save ]
```

Behind the scenes:
- A small drug-name dictionary + parser maps `"Amlodipine 5 mg"` to `{ drugName, doseValue, doseUnit }`.
- Family context fills “for: dad” → memberId.
- Time inference: `morning` → 08:00, `night` → 21:00, `twice daily` → [08:00, 20:00]. User can drag a number wheel if they want to fine-tune.
- Saving also writes a one-line prose summary into `HealthMemory` so the chat already knows about it.

### 3.2 Logging a dose

Already shown in the *Today* screen. One tap **Take**. One tap **Skip** with a 4-reason menu (forgot, side-effect, ran-out, other). That’s it.

A single swipe on a dose row reveals “Snooze 1h” and “Mark as taken without taking it (already took earlier).” — no popup modals.

### 3.3 Logging a vitals reading

The smarts here are about the *type-specific* UI, not a generic form.

```
Log a reading for dad
─────────────────────────────────────────
  Blood pressure

       Systolic           Diastolic         Pulse
       ────────           ─────────         ─────
        132                 86                72

  [ Last: 138/84 · 2d ago ]  [  Save  ]
```

- Default = last reading pre-filled. If user is just confirming “same as yesterday,” one tap.
- Number wheels, not text inputs. One thumb, one screen.
- For glucose: single switch for *fasting / post-meal / random*; auto-annotates with a small note (post-lunch walk, etc.).
- For weight: type, save. No context.
- A tiny line at the bottom: “Last: 138/84 · 2d ago” — *one* piece of context, not a card.

### 3.4 The "Add" affordance — never a form

A single `+` at the bottom of the screen opens a *command palette* (Linear-style), not a modal:

```
+ What do you want to log?
  ┌──────────────────────────────────────┐
  │  Search…                             │
  │                                      │
  │  > Log BP                            │
  │    Log glucose                       │
  │    Log weight                        │
  │    Mark dose taken                   │
  │    Mark dose skipped                 │
  │    Add medication                    │
  └──────────────────────────────────────┘
```

- Two keystrokes to log anything. Friction = 0.

---

## 4. Push notifications — schedule-aware, not spammy

The user specifically asked for these, and it’s where most health apps fail. The rule: **one notification per scheduled slot, never before, never after a confirmation**.

| Slot | Default notification | When escalated |
|---|---|---|
| T+0 (scheduled time) | Quiet notification: *“Time for dad’s BP pill.”* | — |
| T+30 min, no tap | Second: *“Still need to take it.”* | — |
| T+60 min, no tap | Marked **missed**, family owner (the caregiver) gets a single ping per day summary | If 3+ doses missed in 24h → caregiver gets a critical alert |
| Refill | 5 days before expected run-out | 1 day before: red banner in app |

Crucial nuances:
- The notification body is *role-aware*. If the caregiver is the phone owner, it says “Time for dad’s BP pill.” If the patient owns the phone, it says “Your BP pill.”
- Snooze = 1h, max 2 snoozes. After that, it’s missed.
- Quiet hours (10pm–7am default, user-tunable) silence non-critical pings.
- All of this is webhook-driven on the client; server schedules the *next* notification when each one is delivered. Works offline (queues locally) and re-syncs.

---

## 5. Charts — only when they tell a story

Your design rule (no card grids) means charts are opened-on-demand, not always-on. The pattern:

```
BP · last 90 days · dad
─────────────────────────────────────────
  160 ┤
  150 ┤    ●  ●
  140 ┤  ●     ●         ●
  130 ┤●           ●  ●     ●  ●
  120 ┤                    ●
      └────────────────────────────
       May    Jun    Jul
       avg 138/86    ↘ 132/84

  ▲  142/92 on 3 Jul  (vs 132/84 avg)  flagged
  ✓  Missed 2 doses that week

  [ Annotate this spike ]  [ Ask the AI about it ]
```

- One chart per page. No axes legend soup. Just two numbers, a trend arrow, and the most important anomaly called out in prose.
- Every chart is a *conversation starter* with the chat. Tapping a point opens “Ask the AI about this reading.”

---

## 6. Chat integration — zero extra work

You already have `saveHealthMemory` and `requestHealthSuggestions`. With the schema above, the chat is dramatically more useful, almost for free:

- *“Did dad take his morning pill?”* → queries `medicationLog` for today’s slot, returns actual status + time.
- *“What was his BP last week?”* → queries `vital` with rolling window + computed avg.
- *“Any interaction between his amlodipine and the new cough syrup?”* → joins active medications + member’s known allergies.
- *“Add a probiotic at night.”* → writes a new `medication` row, pre-filled with night slot, and updates `HealthMemory` automatically.

The chat becomes the *explanation layer* over the structured data, not a separate system.

---

## 7. What I’d build, in this order

1. **Schema migrations** for `medication`, `medicationLog`, `vital`, `vitalThreshold`. Index on `(memberId, scheduledFor)` and `(memberId, type, recordedAt)`.
2. **Today screen** with the 3 sections (Due now / Later / Last 7 days). All static for now. This sets the design tone.
3. **Add medication flow** with the natural-language parse → save. End-to-end working.
4. **Dose logging** + **vitals logging** with type-specific UIs.
5. **Push notifications** with the schedule-aware rules above.
6. **Charts on demand** with the prose-summary pattern.
7. **Chat integration**: add a tool (`queryHealthData`) that the agent uses to read the new tables.

---

