import { auth } from "../(auth)/auth";
import { redirect } from "next/navigation";
import { isRegularSession } from "@/lib/auth/guards";
import { getFamilyMembers } from "@/lib/db/queries";
import { AddMemberDialog } from "./add-member-dialog";
import { getDicebearAvatarUrl } from "@/lib/utils/avatar";
import Link from "next/link";
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

  // 1. Fetch all members in the user's single family. The user has
  //    exactly one family, identified by their user id; the family name
  //    lives on `User.familyName` (set by the migration's default).
  const members = await getFamilyMembers({ userId: session.user.id });

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
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-100/80 dark:bg-zinc-900/60 border border-zinc-200/50 dark:border-zinc-800/50 text-[12px] font-semibold text-zinc-650 dark:text-zinc-350 backdrop-blur-md">
            <HeartPulseIcon className="size-4 text-primary" />
            <span>Health Portal</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground bg-clip-text bg-gradient-to-b from-foreground to-foreground/80">
            Who&apos;s checking in?
          </h1>

          <p className="text-muted-foreground text-[15px] max-w-xs mx-auto leading-relaxed">
            Select a profile to start your session or view medical records.
          </p>
        </div>

        {/* Member Cards Grid */}
        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-10 pt-4">
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
                  className="relative flex items-center justify-center w-36 h-36 rounded-[2.25rem] bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800/80 hover:border-zinc-350 dark:hover:border-zinc-700 transition-all duration-500 ease-out hover:scale-[1.03] overflow-hidden"
                >
                  <img
                    src={getDicebearAvatarUrl(member.name, member.gender)}
                    alt={member.name}
                    className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  />

                  {/* Glassy overlay on hover */}
                  <div className="absolute inset-0 bg-black/5 dark:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ease-out" />
                </Link>

                {/* Profile Details */}
                <div className="text-center space-y-1 w-40">
                  <p className="text-base font-semibold text-foreground tracking-tight truncate">
                    {member.name}
                  </p>

                  <div className="flex flex-col items-center">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {member.relationship} {age !== null && `• ${age}Y`}
                    </span>
                  </div>
                </div>

                {/* Action Shortcuts (Always visible and responsive) */}
                <div className="flex items-center gap-1 p-1 bg-zinc-100/85 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/60 rounded-full w-[172px] h-8 transition-colors">
                  <Link
                    href={`/?memberId=${member.id}`}
                    className="flex-1 h-6 inline-flex items-center justify-center gap-1 rounded-full text-[11px] font-bold text-foreground hover:bg-white dark:hover:bg-zinc-800 transition-all duration-200"
                  >
                    <MessageSquareIcon className="size-3 text-zinc-500" />
                    <span>Chat</span>
                  </Link>
                  <div className="w-[1px] h-3 bg-zinc-200/80 dark:bg-zinc-800/80" />
                  <Link
                    href={`/family?memberId=${member.id}`}
                    className="flex-1 h-6 inline-flex items-center justify-center gap-1 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white dark:hover:bg-zinc-800 transition-all duration-200"
                  >
                    <FolderHeartIcon className="size-3 text-zinc-400" />
                    <span>Records</span>
                  </Link>
                </div>
              </div>
            );
          })}

          {/* Quick Onboarding Add Card */}
          <div className="animate-in fade-in zoom-in-95 duration-700 fill-mode-both" style={{ animationDelay: `${members.length * 100}ms` }}>
            <AddMemberDialog />
          </div>
        </div>

        {/* Global Dashboard Navigation */}
        <div className="pt-8 mt-8 max-w-sm mx-auto animate-in fade-in duration-1000 delay-500 fill-mode-both">
          <Link
            href="/family"
            className="inline-flex items-center justify-center gap-2.5 w-full py-3.5 px-5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-zinc-100/50 hover:bg-zinc-200/50 dark:bg-zinc-900/40 dark:hover:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl transition-all duration-300"
          >
            <UsersIcon className="size-4 text-zinc-400" />
            <span>Manage Family & Records</span>
            <ChevronRightIcon className="size-4 ml-auto opacity-50 text-zinc-400" />
          </Link>
        </div>

      </div>
    </div>
  );
}
