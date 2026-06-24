"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addFamilyMemberAction } from "./family/actions";
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

export function CreateSelfProfileForm({
  familyId,
  defaultName,
}: {
  familyId: string;
  defaultName: string;
}) {
  const [name, setName] = useState(defaultName || "");
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

    setLoading(true);
    try {
      await addFamilyMemberAction({
        familyId,
        name,
        relationship: "self",
        dateOfBirth: dateOfBirth || undefined,
        gender: gender || undefined,
      });
      toast.success("Successfully set up your health profile!");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to set up profile");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-border/30 bg-card/85 backdrop-blur-2xl  p-6 rounded-3xl space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="onboarding-name" className="text-xs font-semibold text-muted-foreground/80">
              Your Full Name
            </Label>
            <Input
              id="onboarding-name"
              placeholder="e.g. John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              className="h-10 rounded-xl border-border/50 bg-muted/30 focus:bg-background transition-colors text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="onboarding-dob" className="text-xs font-semibold text-muted-foreground/80">
                Date of Birth
              </Label>
              <Input
                id="onboarding-dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                disabled={loading}
                className="h-10 rounded-xl border-border/50 bg-muted/30 focus:bg-background transition-colors text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="onboarding-gender" className="text-xs font-semibold text-muted-foreground/80">
                Gender
              </Label>
              <Select value={gender} onValueChange={setGender} disabled={loading}>
                <SelectTrigger
                  id="onboarding-gender"
                  className="h-10 rounded-xl border-border/50 bg-muted/30 focus:bg-background transition-colors text-xs"
                >
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent className="border border-border/60 bg-card/95 backdrop-blur-xl shadow-lg rounded-xl">
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="non-binary">Non-binary</SelectItem>
                  <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-10 rounded-xl font-bold text-xs bg-gradient-to-r from-primary to-teal-500 hover:opacity-90 active:scale-98 transition-all duration-150 shadow-md text-primary-foreground gap-2"
        >
          {loading ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <PlusIcon className="size-4" />
          )}
          {loading ? "Creating Profile..." : "Create My Profile"}
        </Button>
      </form>
    </div>
  );
}
