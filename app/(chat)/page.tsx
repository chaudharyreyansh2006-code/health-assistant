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
    <div className="flex-1 overflow-y-auto bg-background/50 relative flex flex-col items-center justify-center min-h-dvh px-6 py-12 md:p-10">
      
      {/* Decorative background blur elements (iOS style) */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-teal-500/5 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-4xl space-y-16 text-center z-10">
        
        {/* Portal Greeting */}
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/60 dark:bg-white/5 border border-black/5 dark:border-white/10 text-[13px] font-medium text-foreground backdrop-blur-md shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <HeartPulseIcon className="size-4 text-primary" />
            <span>Health Portal</span>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-foreground font-sans">
            Who&apos;s checking in?
          </h1>
          
          <p className="text-muted-foreground text-base max-w-sm mx-auto font-medium">
            Select a profile to start your session or view medical records.
          </p>
        </div>

        {/* Member Cards Grid */}
        <div className="flex flex-wrap items-center justify-center gap-8 pt-4">
          {members.map((member, index) => {
            const age = getAge(member.dateOfBirth);

            return (
              <div
                key={member.id}
                className="flex flex-col items-center space-y-4 group animate-in fade-in zoom-in-95 duration-700 fill-mode-both"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Profile Squircle Link */}
                <Link
                  href={`/?memberId=${member.id}`}
                  className="relative flex items-center justify-center w-36 h-36 rounded-[2rem] bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] transition-all duration-500 ease-out hover:-translate-y-2 overflow-hidden"
                >
                  <img
                    src={getDicebearAvatarUrl(member.name, member.gender)}
                    alt={member.name}
                    className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                  />
                  
                  {/* Glassy overlay on hover */}
                  <div className="absolute inset-0 bg-black/5 dark:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ease-out" />
                </Link>

                {/* Profile Details */}
                <div className="text-center space-y-1.5 w-40">
                  <p className="text-base font-semibold text-foreground tracking-tight truncate">
                    {member.name}
                  </p>
                  
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      {member.relationship} {age !== null && `• ${age}Y`}
                    </span>
                  </div>
                </div>

                {/* Action Shortcuts (appear on hover) */}
                <div className="flex items-center gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0">
                  <Button asChild size="sm" variant="secondary" className="h-8 rounded-full text-xs font-medium bg-white dark:bg-zinc-800 shadow-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors">
                    <Link href={`/?memberId=${member.id}`}>
                      <MessageSquareIcon className="size-3.5 mr-1.5" />
                      Chat
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost" className="h-8 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground">
                    <Link href={`/family/${activeFamily.id}?memberId=${member.id}`}>
                      <FolderHeartIcon className="size-3.5 mr-1.5" />
                      Records
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}

          {/* Quick Onboarding Add Card */}
          <div className="animate-in fade-in zoom-in-95 duration-700 fill-mode-both" style={{ animationDelay: `${members.length * 100}ms` }}>
            <AddMemberDialog familyId={activeFamily.id} />
          </div>
        </div>

        {/* Global Dashboard Navigation */}
        <div className="pt-12 mt-12 max-w-md mx-auto animate-in fade-in duration-1000 delay-500 fill-mode-both">
          <Link
            href={`/family/${activeFamily.id}`}
            className="inline-flex items-center justify-center gap-2 w-full py-4 text-sm font-medium text-muted-foreground hover:text-foreground bg-white/40 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl transition-all duration-300 hover:bg-white/80 dark:hover:bg-white/10 shadow-sm"
          >
            <UsersIcon className="size-4" />
            Manage Family & Workspaces
            <ChevronRightIcon className="size-4 ml-auto opacity-50" />
          </Link>
        </div>

      </div>
    </div>
  );
}
