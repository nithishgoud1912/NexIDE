import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  const searchParams = req.nextUrl.searchParams;
  const repo = searchParams.get("repo");
  const branch = searchParams.get("branch");

  if (!session || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!repo) {
    return NextResponse.json(
      { error: "Missing repo parameter" },
      { status: 400 },
    );
  }

  const token = session.accessToken;
  const url = branch
    ? `https://api.github.com/repos/${repo}/zipball/${branch}`
    : `https://api.github.com/repos/${repo}/zipball`;

  try {
    const githubRes = await fetch(url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!githubRes.ok) {
      // If it's a redirect, fetch follows it automatically? Not cross-origin in server-side fetch?
      // Actually server-side fetch follows redirects by default.
      // Let's check status.
      return NextResponse.json(
        { error: `GitHub API error: ${githubRes.statusText}` },
        { status: githubRes.status },
      );
    }

    // We need to return the blob (zip file) to the client
    const arrayBuffer = await githubRes.arrayBuffer();

    // Return as a downloadable file or just bytes
    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${repo.replace("/", "-")}.zip"`,
      },
      status: 200,
    });
  } catch (error) {
    console.error("Error fetching repo zip:", error);
    return NextResponse.json(
      { error: "Failed to fetch repository" },
      { status: 500 },
    );
  }
}
