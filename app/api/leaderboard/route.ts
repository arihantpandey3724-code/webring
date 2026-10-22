import { NextResponse } from "next/server";
import leetcodeCache from "@/data/leetcode-cache.json";

import members from "@/data/members.json";
import type { Member } from "@/types/member";

const REVALIDATE_SECONDS = 1800;

interface LeaderboardEntry {
  name: string;
  github: string;
  portfolio?: string;
  count: number;
}

function last7Dates(): Set<string> {
  const dates = new Set<string>();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - i);
    dates.add(date.toISOString().split("T")[0]);
  }

  return dates;
}

async function getWeeklyGithubCount(
  username: string,
  week: Set<string>
): Promise<number> {
  try {
    const res = await fetch(
      `https://github-contributions-api.jogruber.de/v4/${username}?y=last`,
      { next: { revalidate: REVALIDATE_SECONDS } }
    );

    if (!res.ok) return 0;

    const data = await res.json();
    const contributions: { date: string; count: number }[] =
      data?.contributions ?? [];

    return contributions.reduce(
      (sum, day) => (week.has(day.date) ? sum + day.count : sum),
      0
    );
  } catch {
    return 0;
  }
}

const leetcodeCalendarQuery = `
  query getRecentAc($username: String!) {
    recentAcSubmissionList(username: $username, limit: 1000) {
      titleSlug
      timestamp
    }
  }
`;

async function getWeeklyLeetCodeCount(
  username: string,
  week: Set<string>
): Promise<number> {
  try {
    const res = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Referer": "https://leetcode.com",
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        query: leetcodeCalendarQuery,
        variables: { username },
      }),
      next: { revalidate: REVALIDATE_SECONDS },
    });

    if (!res.ok) return 0;

    const result = await res.json();
    const acList: { titleSlug: string; timestamp: string }[] =
      result?.data?.recentAcSubmissionList ?? [];

    const solvedProblems = new Set<string>();

    for (const item of acList) {
      const date = new Date(Number(item.timestamp) * 1000)
        .toISOString()
        .split("T")[0];

      if (week.has(date)) {
        solvedProblems.add(item.titleSlug);
      }
    }

    return solvedProblems.size;
  } catch {
    return 0;
  }
}

export async function GET() {
  const allMembers = members as Member[];
  const week = last7Dates();

  const results = await Promise.all(
    allMembers.map(async (member) => {
      const githubCount = await getWeeklyGithubCount(member.github, week);

      return {
        name: member.name,
        github: member.github,
        portfolio: member.portfolio,
        githubCount,
      };
    })
  );

  const githubLeaderboard: LeaderboardEntry[] = results
    .filter((r) => r.githubCount > 0)
    .map((r) => ({
      name: r.name,
      github: r.github,
      portfolio: r.portfolio,
      count: r.githubCount,
    }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    github: githubLeaderboard,
    leetcode: leetcodeCache.leaderboard,
    updatedAt: new Date().toISOString(),
  });
}