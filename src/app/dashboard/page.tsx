import { auth } from "@/auth";
import { redirect } from "next/navigation";
import {
  FolderOpen,
  Clock,
  Settings,
  LogOut,
  ChevronRight,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { RecentProjectsList } from "@/components/recent-projects";
import { DashboardActions } from "@/components/dashboard-actions";
import { SettingsWidget } from "@/components/settings-widget";
import { PtyStatusWidget } from "@/components/pty-status-widget";
import { GithubStatsWidget } from "@/components/github-stats-widget";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();

  if (!session) {
    redirect("/auth/signin");
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* Navbar */}
      <nav className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-foreground shadow-lg shadow-blue-500/20">
              N
            </div>
            <span className="font-bold text-xl tracking-tight">NexIDE</span>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/profile"
              className="group flex items-center gap-4 hover:opacity-80 transition-opacity"
            >
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-medium group-hover:text-blue-400 transition-colors">
                  {session.user?.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {session.user?.email}
                </span>
              </div>
              {session.user?.image && (
                <Image
                  src={session.user.image}
                  alt="Profile"
                  width={36}
                  height={36}
                  className="rounded-full border border-border group-hover:border-blue-500/50 transition-colors"
                />
              )}
            </Link>
            <SettingsWidget>
              <button className="p-2 hover:bg-secondary rounded-full transition-colors">
                <Settings className="w-5 h-5 text-muted-foreground" />
              </button>
            </SettingsWidget>
            <Link
              href="/api/auth/signout"
              className="p-2 hover:bg-secondary rounded-full transition-colors"
            >
              <LogOut className="w-5 h-5 text-muted-foreground" />
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content Areas */}
          <div className="lg:col-span-2 space-y-12">
            {/* Header section */}
            <section>
              <h1 className="text-4xl font-bold bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                Welcome back, {session.user?.name?.split(" ")[0]}
              </h1>
              <p className="text-muted-foreground mt-2">
                Pick up where you left off or start something new.
              </p>
            </section>

            {/* Action Cards */}
            <DashboardActions session={session} />

            {/* Recent Section */}
            <RecentProjectsList />
          </div>

          {/* Sidebar / Stats */}
          <div className="space-y-6">
            <GithubStatsWidget session={session} />
            <PtyStatusWidget />
          </div>
        </div>
      </main>
    </div>
  );
}
