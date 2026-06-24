import { auth } from "../(auth)/auth";
import { redirect } from "next/navigation";
import { isRegularSession } from "@/lib/auth/guards";
import {
  getFamiliesByUserId,
  createFamily,
  addFamilyMember,
  getFamilyMembers,
} from "@/lib/db/queries";
import { AddMemberDialog } from "./add-member-dialog";
import { getDicebearAvatarUrl } from "@/lib/utils/avatar";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  HeartPulseIcon,
  MessageSquareIcon,
  FolderHeartIcon,
  ChevronRightIcon,
  UsersIcon,
} from "lucide-react";

type Props = {
  searchParams: Promise<{
    memberId?: string;
  }>;
};

export const metadata = {
  title: "Portal | Sana Health",
  description: "Select a family member profile to begin your clinical check-in.",
};

export default async function Page({ searchParams }: Props) {
  const session = await auth();
  if (!isRegularSession(session)) {
    redirect("/login");
  }

  const { memberId } = await searchParams;

  // If a specific member is active in the URL, return null
  // (ChatShell from layout.tsx handles rendering the active chat page)
  if (memberId) {
    return null;
  }

  // 1. Fetch family workspaces
  let families = await getFamiliesByUserId({ userId: session.user.id });
  let activeFamily;

  if (families.length === 0) {
    // Zero-friction Onboarding: auto-create their first family workspace
    const workspaceName = session.user.name
      ? `${session.user.name}'s Family`
      : "My Family Workspace";

    activeFamily = await createFamily({
      name: workspaceName,
      createdBy: session.user.id,
    });

    // Re-fetch family list
    families = [activeFamily];
  } else {
    activeFamily = families[0];
  }

  // 2. Fetch all members in this workspace
  const members = await getFamilyMembers({ familyId: activeFamily.id });

  // No members check redirection removed to allow pure empty state (dashboard portal with only Add Profile card)

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

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
  };

  const getAge = (dobString: string | null) => {
    if (!dobString) return null;
    const dob = new Date(dobString);
    const diffMs = Date.now() - dob.getTime();
    const ageDate = new Date(diffMs);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background p-6 md:p-10 flex flex-col items-center justify-center min-h-dvh">
      <div className="w-full max-w-4xl space-y-12 text-center">
        
        {/* Portal Greeting */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
            <HeartPulseIcon className="size-4 animate-pulse" />
            Sana AI Portal
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground bg-gradient-to-r from-primary via-indigo-500 to-teal-500 bg-clip-text text-transparent">
            Who is having a health check-in today?
          </h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Select a profile to start a scoped health chat session or manage medical files.
          </p>
        </div>

        {/* Member Cards Grid */}
        <div className="flex flex-wrap items-center justify-center gap-6 pt-4">
          {members.map((member) => {
            const initials = getInitials(member.name);
            const age = getAge(member.dateOfBirth);

            return (
              <div
                key={member.id}
                className="flex flex-col items-center space-y-3 group"
              >
                {/* Profile Circle Link */}
                <Link
                  href={`/?memberId=${member.id}`}
                  className="relative flex items-center justify-center w-36 h-36 rounded-3xl border border-border/40 bg-card/25 hover:bg-card/45 hover:border-primary/50 shadow-md hover:shadow-xl transition-all duration-300 hover:scale-[1.05] overflow-hidden"
                >
                  <img
                    src={getDicebearAvatarUrl(member.name, member.gender)}
                    alt={member.name}
                    className="w-full h-full object-cover p-2.5 transition-transform duration-300 group-hover:scale-105"
                  />
                  
                  {/* Subtle hover gradient */}
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </Link>

                {/* Profile Details */}
                <div className="text-center space-y-1 w-36">
                  <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">
                    {member.name}
                  </p>
                  
                  <div className="flex flex-col items-center gap-1">
                    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border ${getRelationshipBadgeColor(member.relationship)}`}>
                      {member.relationship}
                    </Badge>
                    {age !== null && (
                      <span className="text-[10px] text-muted-foreground">
                        {age} years old
                      </span>
                    )}
                  </div>
                </div>

                {/* Profile Action Shortcuts */}
                <div className="flex items-center gap-1.5 pt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <Button asChild size="xs" variant="outline" className="h-7 text-[10px] gap-1 px-2.5 rounded-lg border-border/60 hover:bg-primary hover:text-primary-foreground">
                    <Link href={`/?memberId=${member.id}`}>
                      <MessageSquareIcon className="size-3" />
                      Chat
                    </Link>
                  </Button>
                  <Button asChild size="xs" variant="ghost" className="h-7 text-[10px] gap-1 px-2.5 rounded-lg hover:bg-card">
                    <Link href={`/family/${activeFamily.id}?memberId=${member.id}`}>
                      <FolderHeartIcon className="size-3" />
                      Records
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}

          {/* Quick Onboarding Add Card */}
          <AddMemberDialog familyId={activeFamily.id} />
        </div>

        {/* Global Dashboard Navigation */}
        <div className="pt-6 border-t border-border/25 max-w-md mx-auto">
          <Link
            href={`/family/${activeFamily.id}`}
            className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors duration-150"
          >
            <UsersIcon className="size-4" />
            Manage Family Circle & Workspaces
            <ChevronRightIcon className="size-3.5" />
          </Link>
        </div>

      </div>
    </div>
  );
}
