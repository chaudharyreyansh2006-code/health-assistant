import { auth } from "@/app/(auth)/auth";
import { redirect } from "next/navigation";
import { getFamiliesByUserId } from "@/lib/db/queries";
import { CreateFamilyForm } from "./create-family-form";
import Link from "next/link";
import { UsersIcon, ChevronRightIcon, HeartPulseIcon } from "lucide-react";

export const metadata = {
  title: "Family Dashboard | Health Assistant",
  description: "Manage your family health workspaces and members.",
};

export default async function FamilyPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/?showLogin=true");
  }

  const families = await getFamiliesByUserId({ userId: session.user.id });

  return (
    <div className="flex-1 overflow-y-auto bg-background p-6 md:p-10 flex flex-col items-center">
      <div className="w-full max-w-4xl space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/40 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-primary">
              <HeartPulseIcon className="size-6 animate-pulse" />
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground bg-gradient-to-r from-primary to-teal-500 bg-clip-text text-transparent">
                Family Health Portal
              </h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Select or create a family workspace to manage health summaries, medical history, and medical documents.
            </p>
          </div>
        </div>

        {/* List of Families */}
        <div className="space-y-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-foreground">Your Family Workspaces</h2>
            <p className="text-xs text-muted-foreground">
              Each workspace groups family members and their shared health records.
            </p>
          </div>

          {families.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-10 border border-dashed border-border/60 rounded-2xl bg-card/20 text-center space-y-4">
              <div className="p-4 bg-primary/10 rounded-full text-primary">
                <UsersIcon className="size-8" />
              </div>
              <div className="space-y-1 max-w-sm">
                <p className="font-medium text-foreground text-sm">No family workspaces yet</p>
                <p className="text-xs text-muted-foreground">
                  Create a workspace to begin adding profiles for yourself, spouse, children, or parents.
                </p>
              </div>
              <CreateFamilyForm />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {families.map((f) => (
                <Link
                  key={f.id}
                  href={`/family/${f.id}`}
                  className="group relative flex items-center justify-between p-5 rounded-2xl border border-border/50 bg-card/35 hover:bg-card/75 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:hover:shadow-[0_8px_30px_rgb(0,0,0,0.2)]"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                      <UsersIcon className="size-5" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="font-semibold text-foreground group-hover:text-primary transition-colors duration-200">
                        {f.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Created {new Date(f.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <ChevronRightIcon className="size-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-200" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Create Form when families exist */}
        {families.length > 0 && (
          <div className="pt-6 border-t border-border/40 space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">Create New Family Workspace</h3>
              <p className="text-xs text-muted-foreground">
                Set up another group for extended family, relatives, or independent circles.
              </p>
            </div>
            <CreateFamilyForm />
          </div>
        )}

      </div>
    </div>
  );
}
