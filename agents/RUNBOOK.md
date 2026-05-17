# JoinMyTable — Agent Runbook

How to run the multi-agent build using Claude Code terminal sessions.
Each agent runs in its own terminal tab via `claude --dangerously-skip-permissions`.

---

## Prerequisites

- Claude Code installed: `npm install -g @anthropic-ai/claude-code`
- Logged in: `claude login`
- In your repo root (where CLAUDE.md lives) for every session
- `.env.local` populated with at least your Supabase dev keys before Phase 1

---

## How to start any agent session

Open a terminal tab, navigate to your repo root, then run:

```bash
claude --dangerously-skip-permissions < agents/<prompt-file>.md
```

Or interactively (lets you watch and intervene):

```bash
claude --dangerously-skip-permissions
```

Then paste the contents of the prompt file when Claude Code starts.

---

## Dependency order — run in this sequence

### PHASE 0 — Foundations (already done — skip if complete)

No agent prompt needed. This was the orchestrator phase-0.

---

### PHASE 1 — Run these agents

#### Wave 1 — Database first (others depend on it)

Open terminal Session A:

```bash
claude --dangerously-skip-permissions < agents/agent-database.md
```

**Wait for Session A to finish before starting Wave 2.**

#### Wave 2 — Run Sessions B, C, F in parallel (all depend on database)

Open three terminal tabs simultaneously:

Session B:

```bash
claude --dangerously-skip-permissions < agents/agent-auth.md
```

Session C (profiles module only this phase):

```bash
claude --dangerously-skip-permissions < agents/agent-core-api.md
```

Session F:

```bash
claude --dangerously-skip-permissions < agents/agent-integrations.md
```

#### Wave 3 — Frontend and QA (depend on auth + core api contracts)

After Sessions B and C finish:

Session E:

```bash
claude --dangerously-skip-permissions < agents/agent-frontend.md
```

Session G:

```bash
claude --dangerously-skip-permissions < agents/agent-qa.md
```

---

### PHASE 2 — Discovery

Re-run Sessions C, E, G with the phase-2 context.
(Add `## Current phase: 2` to the prompt or just re-run — agents read git history.)

---

### PHASE 3 — Core loop

Re-run Sessions C, F, E, G in wave order.

---

### PHASE 4 — Payments

Run Session D (Payments) first, then wire E and C.

---

### PHASE 5 — Trust & polish

Run Session H (Trust & Safety), then C, E, G.

---

### PHASE 6 — Launch prep

Run Sessions G (full regression) and H (final audit).
Then manually deploy to Vercel.

---

## Between sessions — what to do

1. Read each agent's summary (WHAT I DID / WHAT I COULD NOT DO sections)
2. Run `npm run dev` and test the app manually
3. Run `npm run test` to confirm the test suite is green
4. Action any MANUAL CHECKPOINTS the agents flagged
5. Commit all changes: `git add -A && git commit -m "phase-X: description"`
6. Push: `git push`

---

## If an agent fails or gets stuck

- Read its output — agents end with clear summaries
- Fix the specific issue it reports
- Re-run just that agent's session
- Re-running is safe — agents are designed to be idempotent

---

## Monitoring multiple sessions

On Mac, use iTerm2 for split panes:

- `Cmd + D` — split vertically
- `Cmd + Shift + D` — split horizontally
- Watch all agents simultaneously in one window

Or use tmux:

```bash
tmux new-session -s joinmytable
# Ctrl+B then % to split vertically
# Ctrl+B then " to split horizontally
```
