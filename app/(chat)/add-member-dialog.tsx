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

/**
 * Quick-add profile dialog for the home portal page.
 *
 * No `familyId` — the server action takes the caller's `session.user.id`
 * and writes the new member with `userId` set directly. There is exactly
 * one family per user after migration 0004.
 */
export function AddMemberDialog() {
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
        name,
        relationship,
        dateOfBirth: dateOfBirth || undefined,
        gender: gender || undefined,
      });
      toast.success(
        `Successfully created health profile for ${created.name}`,
      );
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
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <button className="relative flex flex-col items-center justify-center w-20 h-20 sm:w-28 sm:h-28 md:w-32 md:h-32 lg:w-36 lg:h-36 rounded-[1.5rem] sm:rounded-[2rem] lg:rounded-[2.25rem] bg-zinc-50/50 hover:bg-zinc-100/50 dark:bg-zinc-900/20 dark:hover:bg-zinc-900/60 border border-dashed border-zinc-200 dark:border-zinc-800 hover:border-zinc-350 dark:hover:border-zinc-700 transition-all duration-500 ease-out hover:scale-[1.03] gap-2 sm:gap-3 group">
          <div className="p-2.5 sm:p-3 lg:p-3.5 rounded-full bg-zinc-100 dark:bg-zinc-800/85 text-muted-foreground group-hover:bg-foreground group-hover:text-background group-hover:scale-105 transition-all duration-500 ease-out">
            <PlusIcon className="size-4 sm:size-5" />
          </div>
          <span className="text-[10px] sm:text-[12px] lg:text-[13px] font-semibold text-muted-foreground group-hover:text-foreground tracking-tight transition-colors duration-300">
            Add Profile
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md bg-card border-border/40 text-foreground">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              New Family Member Profile
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Create a dedicated health profile. Long-term memories and
              medical records will be scoped specifically to them.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 my-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold" htmlFor="dialog-name">
                Name
              </Label>
              <Input
                className="bg-background/50 border-border/50 text-sm focus-visible:ring-primary h-9"
                disabled={loading}
                id="dialog-name"
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jane Doe"
                value={name}
              />
            </div>

            <div className="space-y-1.5">
              <Label
                className="text-xs font-semibold"
                htmlFor="dialog-relationship"
              >
                Relationship
              </Label>
              <Select
                disabled={loading}
                onValueChange={setRelationship}
                value={relationship}
              >
                <SelectTrigger
                  className="bg-background/50 border-border/50 text-sm focus-visible:ring-primary h-9"
                  id="dialog-relationship"
                >
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
                <Label className="text-xs font-semibold" htmlFor="dialog-dob">
                  Date of Birth
                </Label>
                <Input
                  className="bg-background/50 border-border/50 text-sm focus-visible:ring-primary h-9"
                  disabled={loading}
                  id="dialog-dob"
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  type="date"
                  value={dateOfBirth}
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  className="text-xs font-semibold"
                  htmlFor="dialog-gender"
                >
                  Gender
                </Label>
                <Select
                  disabled={loading}
                  onValueChange={setGender}
                  value={gender}
                >
                  <SelectTrigger
                    className="bg-background/50 border-border/50 text-sm focus-visible:ring-primary h-9"
                    id="dialog-gender"
                  >
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="non-binary">Non-binary</SelectItem>
                    <SelectItem value="prefer-not-to-say">
                      Prefer not to say
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2 border-t border-border/20">
            <Button
              className="text-xs h-9"
              disabled={loading}
              onClick={() => setOpen(false)}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              className="gap-2 h-9 text-xs bg-primary text-primary-foreground hover:bg-primary/95"
              disabled={loading}
              type="submit"
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
