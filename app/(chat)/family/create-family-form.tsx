"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createFamilyAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlusIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

export function CreateFamilyForm() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      const created = await createFamilyAction(name);
      toast.success(`Family "${created.name}" created!`);
      setName("");
      router.push(`/family/${created.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create family group");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-md">
      <Input
        placeholder="Enter family group name (e.g. Smith Family)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 bg-background/50 border-border/50 text-foreground placeholder:text-muted-foreground focus-visible:ring-primary"
        disabled={loading}
      />
      <Button type="submit" disabled={loading} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/95 shadow-md hover:shadow-lg transition-all duration-200">
        {loading ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <PlusIcon className="size-4" />
        )}
        Create
      </Button>
    </form>
  );
}
