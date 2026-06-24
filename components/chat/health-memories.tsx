"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fetcher } from "@/lib/utils";
import { Loader2Icon, SparklesIcon, SaveIcon, Edit2Icon, CheckIcon } from "lucide-react";
import { toast } from "sonner";
import type { HealthMemory } from "@/lib/db/schema";

const CATEGORIES = [
  { key: "health_profile", label: "Health Profile", placeholder: "Basic vitals, blood type, general status..." },
  { key: "medical_history", label: "Medical History", placeholder: "Past surgeries, chronic conditions, family risk factors..." },
  { key: "medications_allergies", label: "Medications & Allergies", placeholder: "Current prescription list, drug or food allergies..." },
  { key: "lifestyle_habits", label: "Lifestyle & Habits", placeholder: "Exercise frequency, diet, sleep, smoking/drinking habits..." },
  { key: "instructions_preferences", label: "Preferences & Instructions", placeholder: "Preferred hospital, primary doctor contact, DNR status..." },
];

export function HealthMemories({ memberId }: { memberId: string }) {
  const { data: memories, error, mutate } = useSWR<HealthMemory[]>(
    memberId ? `/api/memories?memberId=${memberId}` : null,
    fetcher
  );

  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  const startEditing = (key: string, currentVal: string) => {
    setEditingCategory(key);
    setEditContent(currentVal);
  };

  const handleSave = async (category: string) => {
    setSaving(true);
    try {
      const response = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId,
          category,
          content: editContent,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save memory");
      }

      toast.success("Health summary updated");
      setEditingCategory(null);
      mutate();
    } catch (err: any) {
      toast.error(err.message || "Failed to save memory");
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return <p className="text-xs text-destructive">Failed to load health summaries.</p>;
  }

  if (!memories) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 bg-primary/10 text-primary p-3.5 rounded-xl text-xs border border-primary/20">
        <SparklesIcon className="size-4 shrink-0" />
        <p>
          <strong>AI Auto-Summary:</strong> Gemini automatically extracts and updates these profiles during your chats. You can also edit them manually here.
        </p>
      </div>

      <div className="space-y-4">
        {CATEGORIES.map((cat) => {
          const dbMemory = memories.find((m) => m.category === cat.key);
          const hasContent = !!dbMemory?.content;
          const isEditing = editingCategory === cat.key;

          return (
            <div
              key={cat.key}
              className="p-4 border border-border/40 bg-card/25 rounded-2xl space-y-3 transition-colors hover:bg-card/45"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-semibold text-foreground">{cat.label}</h4>
                  {dbMemory && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/20">
                      {dbMemory.source === "agent" ? "Auto-Saved by AI" : "Manually Edited"}
                    </span>
                  )}
                </div>

                {!isEditing && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => startEditing(cat.key, dbMemory?.content || "")}
                    className="size-7 p-0 text-muted-foreground hover:text-foreground"
                  >
                    <Edit2Icon className="size-3.5" />
                  </Button>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <Textarea
                    placeholder={cat.placeholder}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    disabled={saving}
                    className="min-h-[100px] bg-background/50 border-border/50 text-xs focus-visible:ring-primary"
                  />
                  <div className="flex justify-end gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingCategory(null)}
                      disabled={saving}
                      className="text-xs h-7 px-3 text-muted-foreground hover:bg-card"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleSave(cat.key)}
                      disabled={saving}
                      className="text-xs h-7 px-3 bg-primary text-primary-foreground gap-1 hover:bg-primary/95"
                    >
                      {saving ? (
                        <Loader2Icon className="size-3 animate-spin" />
                      ) : (
                        <CheckIcon className="size-3" />
                      )}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {hasContent ? dbMemory.content : `No ${cat.label.toLowerCase()} entries yet.`}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
