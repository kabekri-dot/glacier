// Sequential Reviewer — implement-then-review loop
//
// This template drives a two-phase workflow per issue:
//   Phase 1 (Implement): A sonnet agent picks an open issue, works on it
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
const MAX_ITERATIONS = Number.parseInt(process.argv[2] ?? "3", 10) || 3;

// Glacier has no npm packages (ADR 0002), so the sandbox needs no npm install
// and no copied node_modules. (npm is only used on the host, for Sandcastle itself.)
const hooks = {};
const copyToWorktree: string[] = [];

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
      agent: sandcastle.claudeCode("claude-opus-4-8"),
      promptFile: "./.sandcastle/implement-prompt.md",
    });

    if (!implement.commits.length) {
      // No commits means the backlog is empty or every remaining issue is
      // blocked — there is nothing left to implement or review, so stop.
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
      agent: sandcastle.claudeCode("claude-opus-4-8"),
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
