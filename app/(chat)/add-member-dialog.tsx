"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addFamilyMemberAction } from "./family/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

export function AddMemberDialog({ familyId }: { familyId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!relationship) {
      toast.error("Relationship is required");
      return;
    }

    setLoading(true);
    try {
      const created = await addFamilyMemberAction({
        familyId,
        name,
        relationship,
        dateOfBirth: dateOfBirth || undefined,
        gender: gender || undefined,
      });
      toast.success(`Successfully created health profile for ${created.name}`);
      setName("");
      setRelationship("");
      setDateOfBirth("");
      setGender("");
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to add family member");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="relative flex flex-col items-center justify-center w-36 h-36 rounded-[2.25rem] bg-zinc-50/50 hover:bg-zinc-100/50 dark:bg-zinc-900/20 dark:hover:bg-zinc-900/60 border border-dashed border-zinc-200 dark:border-zinc-800 hover:border-zinc-350 dark:hover:border-zinc-700 transition-all duration-500 ease-out hover:scale-[1.03] gap-3 group">
          <div className="p-3.5 rounded-full bg-zinc-100 dark:bg-zinc-800/85 text-muted-foreground group-hover:bg-foreground group-hover:text-background group-hover:scale-105 transition-all duration-500 ease-out">
            <PlusIcon className="size-5" />
          </div>
          <span className="text-[13px] font-semibold text-muted-foreground group-hover:text-foreground tracking-tight transition-colors duration-300">
            Add Profile
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md bg-card border-border/40 text-foreground">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">New Family Member Profile</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Create a dedicated health profile. Long-term memories and medical records will be scoped specifically to them.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 my-2">
            <div className="space-y-1.5">
              <Label htmlFor="dialog-name" className="text-xs font-semibold">Name</Label>
              <Input
                id="dialog-name"
                placeholder="e.g. Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                className="bg-background/50 border-border/50 text-sm focus-visible:ring-primary h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dialog-relationship" className="text-xs font-semibold">Relationship</Label>
              <Select value={relationship} onValueChange={setRelationship} disabled={loading}>
                <SelectTrigger id="dialog-relationship" className="bg-background/50 border-border/50 text-sm focus-visible:ring-primary h-9">
                  <SelectValue placeholder="Who are they to you?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">Self</SelectItem>
                  <SelectItem value="spouse">Spouse</SelectItem>
                  <SelectItem value="child">Child</SelectItem>
                  <SelectItem value="parent">Parent</SelectItem>
                  <SelectItem value="sibling">Sibling</SelectItem>
                  <SelectItem value="grandparent">Grandparent</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dialog-dob" className="text-xs font-semibold">Date of Birth</Label>
                <Input
                  id="dialog-dob"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  disabled={loading}
                  className="bg-background/50 border-border/50 text-sm focus-visible:ring-primary h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dialog-gender" className="text-xs font-semibold">Gender</Label>
                <Select value={gender} onValueChange={setGender} disabled={loading}>
                  <SelectTrigger id="dialog-gender" className="bg-background/50 border-border/50 text-sm focus-visible:ring-primary h-9">
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="non-binary">Non-binary</SelectItem>
                    <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2 border-t border-border/20">
            <Button
              type="button"
              variant="ghost"
              disabled={loading}
              onClick={() => setOpen(false)}
              className="text-xs h-9"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="gap-2 h-9 text-xs bg-primary text-primary-foreground hover:bg-primary/95"
            >
              {loading ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <PlusIcon className="size-3.5" />
              )}
              Create Profile
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
