"use client";

import { useSession, signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Github,
  MapPin,
  Link as LinkIcon,
  Users,
  Book,
  Star,
  GitFork,
  ChevronLeft,
  Shield,
  ExternalLink,
  Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface GithubProfile {
  login: string;
  avatar_url: string;
  html_url: string;
  name: string;
  company: string | null;
  blog: string | null;
  location: string | null;
  email: string | null;
  bio: string | null;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
}

interface Repository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [githubProfile, setGithubProfile] = useState<GithubProfile | null>(
    null,
  );
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGithubLinked, setIsGithubLinked] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  useEffect(() => {
    const fetchGithubData = async () => {
      if (session?.accessToken) {
        try {
          // Fetch Profile
          const profileRes = await fetch("https://api.github.com/user", {
            headers: { Authorization: `Bearer ${session.accessToken}` },
          });

          if (profileRes.ok) {
            const profileData = await profileRes.json();
            setGithubProfile(profileData);
            setIsGithubLinked(true);

            // Fetch Repos (Top 10 sorted by update)
            const reposRes = await fetch(
              "https://api.github.com/user/repos?sort=updated&per_page=10&type=all",
              {
                headers: { Authorization: `Bearer ${session.accessToken}` },
              },
            );
            if (reposRes.ok) {
              const reposData = await reposRes.json();
              setRepos(reposData);
            }
          } else {
            console.warn(
              "Failed to fetch GitHub profile (token might be invalid or not GitHub)",
            );
            setIsGithubLinked(false);
          }
        } catch (e) {
          console.error("Error fetching GitHub data:", e);
          setIsGithubLinked(false);
        }
      }
      setLoading(false);
    };

    if (status === "loading") return;
    if (session) {
      fetchGithubData();
    } else {
      // Small timeout to avoid synchronous setState during render build phase
      const t = setTimeout(() => setLoading(false), 0);
      return () => clearTimeout(t);
    }
  }, [session, status]);

  if (status === "loading" || loading) {
    return (
      <div className="h-screen bg-[#09090b] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-zinc-500 text-sm animate-pulse">
            Loading Profile...
          </p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-200 font-sans selection:bg-blue-500/30">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#09090b]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="p-2 -ml-2 hover:bg-white/5 rounded-lg text-zinc-400 hover:text-white transition-colors group"
            >
              <ChevronLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
            </Link>
            <h1 className="font-semibold text-lg text-white tracking-tight">
              Developer Profile
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {isGithubLinked && (
              <span className="px-3 py-1 bg-green-500/10 text-green-400 text-xs font-medium rounded-full border border-green-500/20 flex items-center gap-1.5">
                <Shield className="w-3 h-3" />
                Verified Developer
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: User Info Card */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#121214] rounded-xl border border-white/5 overflow-hidden shadow-xl">
            {/* Cover / Header */}
            <div className="h-32 bg-linear-to-br from-blue-600/20 to-purple-600/20 relative">
              <div className="absolute inset-0 bg-grid-white/[0.02]" />
            </div>

            <div className="px-6 pb-6 relative">
              {/* Avatar */}
              <div className="w-24 h-24 rounded-full border-4 border-[#121214] bg-[#09090b] -mt-12 overflow-hidden shadow-2xl relative group">
                {session.user?.image ? (
                  <Image
                    src={session.user.image}
                    alt={session.user.name || "User"}
                    width={96}
                    height={96}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-400">
                    <Users className="w-10 h-10" />
                  </div>
                )}
              </div>

              {/* Basic Info */}
              <div className="mt-4 space-y-1">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  {session.user?.name || "Anonymous User"}
                  {isGithubLinked && (
                    <Github className="w-4 h-4 text-zinc-500" />
                  )}
                </h2>
                <p className="text-sm text-zinc-400 font-mono">
                  {session.user?.email}
                </p>
              </div>

              {/* GitHub Details */}
              {isGithubLinked && githubProfile ? (
                <div className="mt-6 space-y-4">
                  {githubProfile.bio && (
                    <p className="text-sm text-zinc-300 leading-relaxed italic border-l-2 border-blue-500/50 pl-3">
                      {githubProfile.bio}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-sm text-zinc-400">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-zinc-500" />
                      <span className="text-white font-medium">
                        {githubProfile.followers}
                      </span>{" "}
                      followers
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-white font-medium">
                        {githubProfile.following}
                      </span>{" "}
                      following
                    </div>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-white/5">
                    {githubProfile.location && (
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <MapPin className="w-3.5 h-3.5" />
                        {githubProfile.location}
                      </div>
                    )}
                    {githubProfile.blog && (
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <LinkIcon className="w-3.5 h-3.5" />
                        <a
                          href={
                            githubProfile.blog.startsWith("http")
                              ? githubProfile.blog
                              : `https://${githubProfile.blog}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-blue-400 transition-colors truncate max-w-[200px]"
                        >
                          {githubProfile.blog}
                        </a>
                      </div>
                    )}
                  </div>

                  <a
                    href={githubProfile.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-6 flex items-center justify-center gap-2 w-full py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-sm font-medium transition-colors text-zinc-300 hover:text-white"
                  >
                    <Github className="w-4 h-4" />
                    View Verification Profile
                  </a>
                </div>
              ) : (
                <div className="mt-6 pt-6 border-t border-white/5">
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-amber-400 mb-2">
                      Connect GitHub
                    </h3>
                    <p className="text-xs text-zinc-400 mb-4">
                      Link your GitHub account to import repositories and verify
                      your developer status.
                    </p>
                    <Button
                      onClick={() => signIn("github")}
                      variant="outline"
                      className="w-full h-8 text-xs gap-2 bg-[#09090b] border-white/10 hover:bg-white/5"
                    >
                      <Github className="w-3.5 h-3.5" />
                      Connect Now
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Content Feed */}
        <div className="lg:col-span-8 space-y-6">
          {isGithubLinked ? (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Book className="w-5 h-5 text-blue-500" />
                  Recent Repositories
                </h3>
                <span className="text-xs text-zinc-500 font-mono bg-white/5 px-2 py-1 rounded">
                  {githubProfile?.public_repos} Public Repos
                </span>
              </div>

              <div className="grid gap-4">
                {repos.map((repo) => (
                  <div
                    key={repo.id}
                    className="group bg-[#121214] hover:bg-[#161618] border border-white/5 hover:border-blue-500/30 rounded-lg p-4 transition-all duration-300"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <a
                            href={repo.html_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-blue-400 hover:underline flex items-center gap-1.5"
                          >
                            {repo.name}
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                          </a>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded border ${repo.private ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : "bg-zinc-800 text-zinc-400 border-white/5"}`}
                          >
                            {repo.private ? "Private" : "Public"}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-400 line-clamp-2 max-w-xl">
                          {repo.description || "No description provided."}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <Button
                          size="sm"
                          className="h-8 bg-blue-600 hover:bg-blue-500 text-white text-xs gap-1.5 shadow-lg shadow-blue-600/10"
                          onClick={() => {
                            // "Ghosting" Fix: Pass explicit clone action
                            router.push(
                              `/workspace?action=clone&repo=${repo.full_name}`,
                            );
                          }}
                        >
                          <Code2 className="w-3.5 h-3.5" />
                          Open in NexIDE
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-4 text-xs text-zinc-500">
                      {repo.language && (
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-yellow-400/80" />
                          {repo.language}
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Star className="w-3.5 h-3.5" />
                        {repo.stargazers_count}
                      </div>
                      <div className="flex items-center gap-1">
                        <GitFork className="w-3.5 h-3.5" />
                        {repo.forks_count}
                      </div>
                      <div className="ml-auto text-[10px] opacity-70">
                        Updated {new Date(repo.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}

                {repos.length === 0 && (
                  <div className="p-8 text-center bg-[#121214] rounded-lg border border-dashed border-white/10 text-zinc-500">
                    No repositories found.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-[#121214] rounded-xl border border-white/5 p-12 text-center space-y-4">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                <Github className="w-8 h-8 text-zinc-600" />
              </div>
              <h3 className="text-xl font-semibold text-white">
                Complete Your Developer Profile
              </h3>
              <p className="text-zinc-400 max-w-md mx-auto">
                Connect your GitHub account to unlock the full potential of
                NexIDE. Import repositories instantly, track your activity, and
                showcase your work.
              </p>
              <Button
                onClick={() => signIn("github")}
                className="bg-white text-black hover:bg-zinc-200 mt-4"
              >
                Connect GitHub Account
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
