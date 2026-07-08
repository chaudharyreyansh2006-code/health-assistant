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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileTextIcon,
  HeartIcon,
  MessageSquarePlusIcon,
  CalendarIcon,
  MoreHorizontalIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";
import { deleteFamilyMemberAction } from "@/app/(chat)/family/actions";
import type { FamilyMember } from "@/lib/db/schema";
import { getDicebearAvatarUrl } from "@/lib/utils/avatar";

type View = "today" | "summary" | "documents";

export function FamilyWorkspaceClient({
  userId: _userId,
  familyName,
  initialMembers,
  initialActiveMemberId,
}: {
  userId: string;
  familyName: string;
  initialMembers: FamilyMember[];
  initialActiveMemberId: string | null;
}) {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
    initialActiveMemberId ??
      (initialMembers.length > 0 ? initialMembers[0].id : null)
  );
  const [view, setView] = useState<View>("today");
  const [showDeleteMemberDialog, setShowDeleteMemberDialog] = useState(false);
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
          {/* Workspace Title */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border/40 pb-5 gap-3">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {familyName}
              </h1>
              <p className="text-xs text-muted-foreground">
                Manage profiles, daily routines, and clinical context files.
              </p>
            </div>
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
                          className={`group relative flex items-center justify-between p-4 rounded-xl border transition-all duration-200 cursor-pointer ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border/40 bg-card/20 hover:bg-card/40"
                          }`}
                          key={member.id}
                          onClick={() => {
                            setSelectedMemberId(member.id);
                            setView("today");
                          }}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="size-9 rounded-xl overflow-hidden bg-muted/40 border border-border/30 flex-shrink-0 flex items-center justify-center">
                              <img
                                alt={member.name}
                                className="size-full object-cover"
                                src={getDicebearAvatarUrl(
                                  member.name,
                                  member.gender
                                )}
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-foreground truncate">
                                {member.name}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <Badge
                                  className={`text-[9px] px-1.5 py-0.2 border ${getRelationshipBadgeColor(member.relationship)}`}
                                  variant="outline"
                                >
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
                            asChild
                            className="size-7 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-150 text-primary"
                            onClick={(e) => e.stopPropagation()}
                            size="icon"
                            variant="ghost"
                          >
                            <Link
                              href={`/?memberId=${member.id}`}
                              title="New Chat Scoped to Member"
                            >
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
              <AddMemberForm />
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
                          alt={selectedMember.name}
                          className="size-full object-cover"
                          src={getDicebearAvatarUrl(
                            selectedMember.name,
                            selectedMember.gender
                          )}
                        />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-foreground">
                          {selectedMember.name}
                        </h2>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <Badge
                            className={`text-[10px] border ${getRelationshipBadgeColor(selectedMember.relationship)}`}
                            variant="outline"
                          >
                            {selectedMember.relationship}
                          </Badge>
                          {selectedMember.dateOfBirth && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <CalendarIcon className="size-3" />
                              DOB:{" "}
                              {new Date(
                                selectedMember.dateOfBirth
                              ).toLocaleDateString()}
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            aria-label="More actions"
                            className="text-muted-foreground hover:text-foreground"
                            size="icon"
                            variant="ghost"
                          >
                            <MoreHorizontalIcon className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                            View
                          </DropdownMenuLabel>
                          <DropdownMenuItem
                            onSelect={() => setView("today")}
                          >
                            <CalendarIcon className="size-3.5" />
                            Today
                            {view === "today" ? (
                              <span className="ml-auto text-[10px] text-muted-foreground">
                                current
                              </span>
                            ) : null}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => setView("summary")}
                          >
                            <ShieldCheckIcon className="size-3.5" />
                            Health Summaries
                            {view === "summary" ? (
                              <span className="ml-auto text-[10px] text-muted-foreground">
                                current
                              </span>
                            ) : null}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => setView("documents")}
                          >
                            <FileTextIcon className="size-3.5" />
                            Medical Documents & RAG
                            {view === "documents" ? (
                              <span className="ml-auto text-[10px] text-muted-foreground">
                                current
                              </span>
                            ) : null}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => setShowDeleteMemberDialog(true)}
                          >
                            <Trash2Icon className="size-3.5" />
                            Delete Profile
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        asChild
                        className="gap-1.5 bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 border-0 shadow-none font-semibold transition-all"
                        size="sm"
                      >
                        <Link href={`/?memberId=${selectedMember.id}`}>
                          <MessageSquarePlusIcon className="size-4" />
                          Start Chat
                        </Link>
                      </Button>
                    </div>
                  </div>

                  {/* View content — Today is the default; the other two are
                      reached via the "⋯" menu in the member header above. */}
                  <div className="pt-2">
                    {view === "today" ? (
                      <TodayScreen memberId={selectedMember.id} />
                    ) : view === "summary" ? (
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
                    <p className="font-semibold text-foreground text-sm">
                      No Member Selected
                    </p>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      Add a family member on the left to start tracking
                      their medications, vitals, and clinical documents.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <AlertDialog
        onOpenChange={setShowDeleteMemberDialog}
        open={showDeleteMemberDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{selectedMember?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this family member, their health
              summaries, and all medical records. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingMember}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeletingMember}
              onClick={async () => {
                if (!selectedMember) {
                  return;
                }
                setIsDeletingMember(true);
                try {
                  await deleteFamilyMemberAction(selectedMember.id);
                  toast.success(`"${selectedMember.name}" profile deleted`);
                  setSelectedMemberId(
                    initialMembers.find((m) => m.id !== selectedMember.id)
                      ?.id ?? null
                  );
                  router.refresh();
                } catch (err: any) {
                  toast.error(err.message || "Failed to delete profile");
                } finally {
                  setIsDeletingMember(false);
                  setShowDeleteMemberDialog(false);
                }
              }}
            >
              {isDeletingMember ? "Deleting…" : "Delete Profile"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
