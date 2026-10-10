// Sequential Reviewer — implement-then-review loop
//
// This template drives a two-phase workflow per issue:
//   Phase 1 (Implement): The script picks the next issue and the builder model
//                        from its model: label; the agent works on it
//                        on a dedicated branch, commits the changes, and signals
//                        completion.
//   Phase 2 (Review):    A second sonnet agent reviews the branch diff and either
//                        approves it or makes corrections directly on the branch.
//
// Both phases share a single sandbox created via createSandbox(), so the
// implementer and reviewer work on the same explicit branch.
//
// The outer loop repeats up to MAX_ITERATIONS times, processing one issue per
// iteration and stopping early once the backlog is exhausted (an implement
// phase that produces no commits). This is a middle-complexity option between
// the simple-loop (no review gate) and the parallel-planner (concurrent
// execution with a planning phase).
//
// Usage:
//   npx tsx .sandcastle/main.mts
// Or add to package.json:
//   "scripts": { "sandcastle": "npx tsx .sandcastle/main.mts" }

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execFileSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Glacier: how many tickets per run before stopping, so you can look at the result.
// Default 3. Pick another number when starting: npx tsx .sandcastle/main.mts 5
//   npx tsx .sandcastle/main.mts next      -> only show which ticket and model come next
//   npx tsx .sandcastle/main.mts 1 34      -> start with ticket #34
//   npx tsx .sandcastle/main.mts 1 sonnet  -> force one model for this run
const DRY_RUN = process.argv[2] === "next";
const MAX_ITERATIONS = DRY_RUN ? 1 : Number.parseInt(process.argv[2] ?? "3", 10) || 3;
const extraArgs = process.argv.slice(3);
const isTicketArg = (a: string) => /^#?\d+$/.test(a);
let startIssue = Number.parseInt(extraArgs.find(isTicketArg)?.replace("#", "") ?? "", 10) || null;
const MODEL_OVERRIDE = extraArgs.find((a) => !isTicketArg(a)) ?? null;

// Which model builds is read from the ticket's label: model:sonnet for small,
// well-specified tickets, model:opus (also the default without a label) for
// large or judgment-heavy ones. The reviewer always runs on Sonnet.
const MODELS: Record<string, string> = { opus: "claude-opus-4-8", sonnet: "sonnet" };
const DEFAULT_MODEL = "opus";

// Glacier has no npm packages (ADR 0002), so the sandbox needs no npm install
// and no copied node_modules. (npm is only used on the host, for Sandcastle itself.)
const hooks = {};
const copyToWorktree: string[] = [];

// ---------------------------------------------------------------------------
// Glacier: pick the next ticket and its model
// ---------------------------------------------------------------------------
// The script picks the ticket (not the robot), so it can choose the model
// before the robot starts: bugs first, then the lowest number, skipping #1 and
// any ticket whose "Blocked by" section names a still-open issue.

type Issue = { number: number; title: string; labels: { name: string }[]; body: string };
const gh = (...args: string[]) => execFileSync("gh", args, { encoding: "utf8" });

function pickNextIssue(): { issue: Issue; model: string } | null {
  const ready: Issue[] = JSON.parse(gh("issue", "list", "--state", "open", "--label", "ready-for-agent",
    "--limit", "200", "--json", "number,title,labels,body"));
  const open = new Set<number>(JSON.parse(gh("issue", "list", "--state", "open", "--limit", "500",
    "--json", "number")).map((i: { number: number }) => i.number));
  const isBlocked = (issue: Issue) => {
    const section = (issue.body ?? "").split("## Blocked by")[1]?.split("\n## ")[0] ?? "";
    return [...section.matchAll(/#(\d+)/g)].some((m) => open.has(Number(m[1])));
  };
  const hasLabel = (issue: Issue, name: string) => issue.labels.some((l) => l.name === name);
  const candidates = ready
    .filter((i) => i.number !== 1 && !isBlocked(i))
    .sort((a, b) => Number(hasLabel(b, "bug")) - Number(hasLabel(a, "bug")) || a.number - b.number);
  if (startIssue !== null) {
    const wanted = candidates.find((i) => i.number === startIssue);
    if (!wanted) {
      console.error(`Ticket #${startIssue} isn't ready (not ready-for-agent, closed, or blocked).`);
      process.exit(1);
    }
    startIssue = null; // only the first ticket of the run
    candidates.unshift(wanted);
  }
  const issue = candidates[0];
  if (!issue) return null;
  const label = issue.labels.find((l) => l.name.startsWith("model:"))?.name.slice("model:".length);
  const name = MODEL_OVERRIDE ?? label ?? DEFAULT_MODEL;
  return { issue, model: MODELS[name] ?? name };
}

if (DRY_RUN) {
  const next = pickNextIssue();
  console.log(next ? `Next: #${next.issue.number} ${next.issue.title} -> builder model: ${next.model}` : "Nothing ready.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Glacier: merge each reviewed ticket into main
// ---------------------------------------------------------------------------
// Tickets build on each other (#3 needs #2, #5 needs #3, …), so each finished,
// reviewed branch is merged into main straight away. The next ticket then starts
// from code that already contains it.

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();

if (git("rev-parse", "--abbrev-ref", "HEAD") !== "main") {
  console.error("Start Sandcastle from the main branch (git switch main).");
  process.exit(1);
}
if (git("status", "--porcelain", "--untracked-files=no")) {
  console.error("Commit or stash your own changes first: the robot merges its work into main.");
  process.exit(1);
}

function mergeIntoMain(branch: string) {
  try {
    git("merge", "--no-ff", "-m", `Merge ${branch} (Sandcastle: implemented and reviewed)`, branch);
    console.log(`Merged ${branch} into main.`);
  } catch {
    try { git("merge", "--abort"); } catch { /* nothing to abort */ }
    console.error(`Could not merge ${branch} automatically. Stopping so you can look at it.`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  const next = pickNextIssue();
  if (!next) {
    console.log("No ready, unblocked ticket left. Stopping.");
    break;
  }
  console.log(`Ticket #${next.issue.number}: ${next.issue.title} (builder: ${next.model})`);

  // Generate a unique branch name for this iteration.
  const branch = `sandcastle/sequential-reviewer/${Date.now()}`;

  // Create a single sandbox that both the implementer and reviewer share.
  // This gives both agents a real, named branch that persists across phases.
  const sandbox = await sandcastle.createSandbox({
    branch,
    sandbox: docker(),
    hooks,
    copyToWorktree,
  });

  try {
    // -----------------------------------------------------------------------
    // Phase 1: Implement
    //
    // A sonnet agent picks the next open issue, writes the
    // implementation (using RGR: Red → Green → Repeat → Refactor), and
    // commits the result.
    //
    // The agent signals completion via <promise>COMPLETE</promise> when done.
    // -----------------------------------------------------------------------
    // One iteration so each outer pass implements a single issue on its own
    // branch, then hands it to the reviewer. A higher value lets the agent
    // drain the whole backlog onto this one branch in a single pass, which
    // defeats the per-issue review.
    const implement = await sandbox.run({
      name: "implementer",
      maxIterations: 1,
      agent: sandcastle.claudeCode(next.model),
      promptFile: "./.sandcastle/implement-prompt.md",
      promptArgs: {
        ISSUE: String(next.issue.number),
      },
    });

    if (!implement.commits.length) {
      // No commits means the builder gave up on this ticket (or found it
      // already done), so stop and let a human look.
      console.log("Implementation agent made no commits. Stopping.");
      break;
    }

    console.log(`\nImplementation complete on branch: ${branch}`);
    console.log(`Commits: ${implement.commits.length}`);

    // -----------------------------------------------------------------------
    // Phase 2: Review
    //
    // A second sonnet agent reviews the diff of the branch produced by
    // Phase 1. It uses the {{BRANCH}} prompt argument to inspect the right
    // branch, and either approves or makes corrections directly on the branch.
    // -----------------------------------------------------------------------
    await sandbox.run({
      name: "reviewer",
      maxIterations: 1,
      // Glacier: reviewing a finished change against a checklist is the easier
      // job, so the reviewer runs on Sonnet (cheaper); the builder stays on Opus.
      agent: sandcastle.claudeCode("sonnet"),
      promptFile: "./.sandcastle/review-prompt.md",
      promptArgs: {
        BRANCH: branch,
      },
    });

    console.log("\nReview complete.");
  } finally {
    await sandbox.close();
  }

  // Glacier: the ticket is implemented and reviewed, so bring it into main.
  mergeIntoMain(branch);
}

console.log("\nAll done. Look at the new commits on main (git log), then share them with: git push");
