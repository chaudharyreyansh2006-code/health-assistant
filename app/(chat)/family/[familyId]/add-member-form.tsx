"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addFamilyMemberAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

export function AddMemberForm({ familyId }: { familyId: string }) {
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
      toast.success(`Added family member: ${created.name}`);
      setName("");
      setRelationship("");
      setDateOfBirth("");
      setGender("");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to add family member");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-5 rounded-2xl border border-border/50 bg-card/30 backdrop-blur-md">
      <div className="space-y-1">
        <h3 className="font-semibold text-foreground text-sm">Add Family Member</h3>
        <p className="text-xs text-muted-foreground">Create a new health profile within this family.</p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-xs font-medium text-foreground">Name</Label>
          <Input
            id="name"
            placeholder="John Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            className="bg-background/50 border-border/50 text-sm focus-visible:ring-primary h-9"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="relationship" className="text-xs font-medium text-foreground">Relationship</Label>
          <Select value={relationship} onValueChange={setRelationship} disabled={loading}>
            <SelectTrigger id="relationship" className="bg-background/50 border-border/50 text-sm focus-visible:ring-primary h-9">
              <SelectValue placeholder="Select relationship" />
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
            <Label htmlFor="dob" className="text-xs font-medium text-foreground">Date of Birth</Label>
            <Input
              id="dob"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              disabled={loading}
              className="bg-background/50 border-border/50 text-sm focus-visible:ring-primary h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gender" className="text-xs font-medium text-foreground">Gender</Label>
            <Select value={gender} onValueChange={setGender} disabled={loading}>
              <SelectTrigger id="gender" className="bg-background/50 border-border/50 text-sm focus-visible:ring-primary h-9">
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

      <Button type="submit" disabled={loading} className="w-full gap-2 mt-2 h-9 text-sm bg-primary text-primary-foreground hover:bg-primary/95 shadow-md">
        {loading ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <PlusIcon className="size-4" />
        )}
        Add Member
      </Button>
    </form>
  );
}
