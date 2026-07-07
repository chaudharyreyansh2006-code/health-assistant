"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AddMemberForm } from "./add-member-form";
import { HealthMemories } from "@/components/chat/health-memories";
import { DocumentUpload } from "@/components/chat/document-upload";
import { TodayScreen } from "@/components/chat/today-screen";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  UserIcon,
  MessageSquarePlusIcon,
  ArrowLeftIcon,
  FileTextIcon,
  ShieldCheckIcon,
  HeartIcon,
  CalendarIcon,
  UserCheck2Icon,
  Trash2Icon,
  SunIcon,
} from "lucide-react";
import { deleteFamilyAction, deleteFamilyMemberAction } from "@/app/(chat)/family/actions";
import type { Family, FamilyMember } from "@/lib/db/schema";
import { getDicebearAvatarUrl } from "@/lib/utils/avatar";

export function FamilyWorkspaceClient({
  family,
  initialMembers,
}: {
  family: Family;
  initialMembers: FamilyMember[];
}) {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
    initialMembers.length > 0 ? initialMembers[0].id : null
  );
  const [activeTab, setActiveTab] = useState<"today" | "summary" | "documents">("today");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeleteMemberDialog, setShowDeleteMemberDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingMember, setIsDeletingMember] = useState(false);
  const router = useRouter();

  const selectedMember = initialMembers.find((m) => m.id === selectedMemberId);

  const getRelationshipBadgeColor = (rel: string) => {
    switch (rel.toLowerCase()) {
      case "self":
        return "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20";
      case "spouse":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
      case "child":
        return "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20";
      case "parent":
        return "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20";
      default:
        return "bg-muted text-muted-foreground border-border/30";
    }
  };

  const getAge = (dobString: string | null) => {
    if (!dobString) return null;
    const dob = new Date(dobString);
    const diffMs = Date.now() - dob.getTime();
    const ageDate = new Date(diffMs);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
  };

  return (
    <>
    <div className="flex-1 overflow-y-auto bg-background p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Back Link */}
        <Link
          href="/family"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back to Family Dashboard
        </Link>

        {/* Workspace Title */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border/40 pb-5 gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {family.name}
            </h1>
            <p className="text-xs text-muted-foreground">
              Manage profiles and clinical context files for each group member.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 self-start text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/5 transition-colors"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2Icon className="size-3.5" />
            Delete Workspace
          </Button>
        </div>

        {/* Main Grid */}
        <div className="grid gap-6 md:grid-cols-3">
          
          {/* Left Column: Member List & Add Member */}
          <div className="md:col-span-1 space-y-6">
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Members</h2>

              {initialMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground p-4 text-center border border-dashed border-border/50 rounded-xl bg-card/10">
                  No members added yet. Add the first member below.
                </p>
              ) : (
                <div className="space-y-2">
                  {initialMembers.map((member) => {
                    const isSelected = member.id === selectedMemberId;
                    const age = getAge(member.dateOfBirth);

                    return (
                      <div
                        key={member.id}
                        onClick={() => setSelectedMemberId(member.id)}
                        className={`group relative flex items-center justify-between p-4 rounded-xl border transition-all duration-200 cursor-pointer ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border/40 bg-card/20 hover:bg-card/40"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="size-9 rounded-xl overflow-hidden bg-muted/40 border border-border/30 flex-shrink-0 flex items-center justify-center">
                            <img
                              src={getDicebearAvatarUrl(member.name, member.gender)}
                              alt={member.name}
                              className="size-full object-cover"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">
                              {member.name}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Badge variant="outline" className={`text-[9px] px-1.5 py-0.2 border ${getRelationshipBadgeColor(member.relationship)}`}>
                                {member.relationship}
                              </Badge>
                              {age !== null && (
                                <span className="text-[10px] text-muted-foreground">
                                  {age} yrs
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-150 text-primary"
                          asChild
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link href={`/?memberId=${member.id}`} title="New Chat Scoped to Member">
                            <MessageSquarePlusIcon className="size-4" />
                          </Link>
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Add Member Form */}
            <AddMemberForm familyId={family.id} />
          </div>

          {/* Right Column: Selected Member Workspace */}
          <div className="md:col-span-2">
            {selectedMember ? (
              <div className="border border-border/45 bg-card/20 backdrop-blur-md rounded-2xl p-5 md:p-6 space-y-6">
                
                {/* Member Brief */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/30 pb-4">
                  <div className="flex items-center gap-3.5">
                    <div className="size-11 rounded-xl overflow-hidden bg-muted border border-border/30 flex items-center justify-center shrink-0">
                      <img
                        src={getDicebearAvatarUrl(selectedMember.name, selectedMember.gender)}
                        alt={selectedMember.name}
                        className="size-full object-cover"
                      />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-foreground">{selectedMember.name}</h2>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <Badge variant="outline" className={`text-[10px] border ${getRelationshipBadgeColor(selectedMember.relationship)}`}>
                          {selectedMember.relationship}
                        </Badge>
                        {selectedMember.dateOfBirth && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <CalendarIcon className="size-3" />
                            DOB: {new Date(selectedMember.dateOfBirth).toLocaleDateString()}
                          </span>
                        )}
                        {selectedMember.gender && (
                          <span className="text-xs text-muted-foreground">
                            • {selectedMember.gender}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDeleteMemberDialog(true)}
                      className="gap-1.5 text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/5 transition-colors border-border/60 shadow-none"
                    >
                      <Trash2Icon className="size-3.5" />
                      Delete Profile
                    </Button>
                    <Button asChild size="sm" className="gap-1.5 bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 border-0 shadow-none font-semibold transition-all">
                      <Link href={`/?memberId=${selectedMember.id}`}>
                        <MessageSquarePlusIcon className="size-4" />
                        Start Chat
                      </Link>
                    </Button>
                  </div>
                </div>

                {/* Tabs Selector */}
                <div className="flex border-b border-border/30">
                  <button
                    onClick={() => setActiveTab("today")}
                    className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 -mb-[2px] transition-colors duration-150 ${
                      activeTab === "today"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <SunIcon className="size-4" />
                    Today
                  </button>
                  <button
                    onClick={() => setActiveTab("summary")}
                    className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 -mb-[2px] transition-colors duration-150 ${
                      activeTab === "summary"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <ShieldCheckIcon className="size-4" />
                    Health Summaries
                  </button>
                  <button
                    onClick={() => setActiveTab("documents")}
                    className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 -mb-[2px] transition-colors duration-150 ${
                      activeTab === "documents"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <FileTextIcon className="size-4" />
                    Medical Documents & RAG
                  </button>
                </div>

                {/* Tab Content */}
                <div className="pt-2">
                  {activeTab === "today" ? (
                    <TodayScreen memberId={selectedMember.id} />
                  ) : activeTab === "summary" ? (
                    <HealthMemories memberId={selectedMember.id} />
                  ) : (
                    <DocumentUpload memberId={selectedMember.id} />
                  )}
                </div>

              </div>
            ) : (
              <div className="h-full border border-dashed border-border/60 rounded-2xl flex flex-col items-center justify-center p-10 text-center space-y-3 bg-card/5">
                <div className="p-3 bg-muted rounded-full text-muted-foreground">
                  <HeartIcon className="size-6" />
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">No Member Selected</p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Select a member from the left panel to manage their clinical context files and view summaries.
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{family.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this family workspace, all its
              members, health summaries, and medical documents. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setIsDeleting(true);
                try {
                  await deleteFamilyAction(family.id);
                  toast.success(`"${family.name}" workspace deleted`);
                  router.replace("/family");
                } catch {
                  toast.error("Failed to delete workspace");
                } finally {
                  setIsDeleting(false);
                  setShowDeleteDialog(false);
                }
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting\u2026" : "Delete Workspace"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteMemberDialog} onOpenChange={setShowDeleteMemberDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{selectedMember?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this family member, their health summaries, and all medical records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingMember}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!selectedMember) return;
                setIsDeletingMember(true);
                try {
                  await deleteFamilyMemberAction(selectedMember.id);
                  toast.success(`"${selectedMember.name}" profile deleted`);
                  setSelectedMemberId(
                    initialMembers.find((m) => m.id !== selectedMember.id)?.id ?? null
                  );
                  router.refresh();
                } catch (err: any) {
                  toast.error(err.message || "Failed to delete profile");
                } finally {
                  setIsDeletingMember(false);
                  setShowDeleteMemberDialog(false);
                }
              }}
              disabled={isDeletingMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingMember ? "Deleting\u2026" : "Delete Profile"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
