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
        <button className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border/50 rounded-3xl bg-card/15 hover:bg-card/30 hover:border-primary/50 transition-all duration-300 w-36 h-36 gap-2 group">
          <div className="p-3 bg-muted rounded-full group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
            <PlusIcon className="size-5" />
          </div>
          <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors duration-250">
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
