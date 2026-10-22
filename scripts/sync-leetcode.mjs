import fs from "node:fs/promises";
import path from "node:path";

const MEMBERS_FILE = path.join(process.cwd(), "data", "members.json");
const OUTPUT_FILE = path.join(process.cwd(), "data", "leetcode-cache.json");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getPastWeekDates() {
  const dates = new Set();
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);

  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    dates.add(d.toISOString().split("T")[0]);
  }
  return dates;
}

async function getWeeklySolved(username, week) {
  try {
    const res = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Referer": "https://leetcode.com",
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        query: `
          query getRecentAc($username: String!) {
            recentAcSubmissionList(username: $username, limit: 1000) {
              titleSlug
              timestamp
            }
          }
        `,
        variables: { username },
      }),
    });

    const json = await res.json();
    const submissions = json?.data?.recentAcSubmissionList || [];
    const solved = new Set();

    for (const item of submissions) {
      const date = new Date(Number(item.timestamp) * 1000)
        .toISOString()
        .split("T")[0];

      if (week.has(date)) {
        solved.add(item.titleSlug);
      }
    }

    return solved.size;
  } catch {
    return 0;
  }
}

async function main() {
  const week = getPastWeekDates();
  const raw = await fs.readFile(MEMBERS_FILE, "utf-8");
  const members = JSON.parse(raw);

  const leaderboard = [];

  for (const member of members) {
    const username = member.leetcode?.trim().replace(/\/+$/, "").split("/").pop();
    if (!username) continue;

    const count = await getWeeklySolved(username, week);

    if (count > 0) {
      leaderboard.push({
        name: member.name,
        github: member.github,
        portfolio: member.portfolio,
        count,
      });
    }

    await sleep(400);
  }

  leaderboard.sort((a, b) => b.count - a.count);

  await fs.writeFile(
    OUTPUT_FILE,
    JSON.stringify({ updatedAt: new Date().toISOString(), leaderboard }, null, 2)
  );

  console.log("Leetcode Leaderboard update");
}

main();