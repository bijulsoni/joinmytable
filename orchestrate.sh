#!/usr/bin/env bash
#
# JoinMyTable - Multi-Agent Orchestrator (phase-at-a-time)
# ============================================================
# Runs ONE phase per invocation so you review between phases:
#
#   ./orchestrate.sh phase-0     # Foundations
#   ./orchestrate.sh phase-1     # Accounts & profiles
#   ./orchestrate.sh phase-2     # Discovery
#   ./orchestrate.sh phase-3     # Core loop
#   ./orchestrate.sh phase-4     # Payments
#   ./orchestrate.sh phase-5     # Trust & polish
#   ./orchestrate.sh phase-6     # Launch prep
#   ./orchestrate.sh status      # Show which phases are done
#   ./orchestrate.sh help        # Usage
#
# It reads each agent's detailed task definition from ./CLAUDE.md and runs
# the Claude Code CLI for each agent in dependency order.
#
# SAFETY MODEL
#   This script deliberately does NOT use --dangerously-skip-permissions.
#   It whitelists only safe, reversible, local tools. Anything sensitive
#   (deploys, git push, secrets, cloud provisioning) is left as a MANUAL
#   CHECKPOINT that you complete yourself. It also stops the chain on the
#   first agent failure rather than barreling ahead.
# ============================================================

set -euo pipefail

# ==================== CONFIG ====================
# IMPORTANT: the Claude Code CLI evolves and this script cannot reach the
# live docs to verify flags. Before first run, check `claude --help` and
# adjust the block below if any flag name differs for your version.

CLAUDE_BIN="${CLAUDE_BIN:-claude}"

# Permission flags applied to EVERY agent invocation.
# We avoid --dangerously-skip-permissions on purpose: this codebase touches
# payments, identity, and PII. Instead we allow only safe local tools.
CLAUDE_PERMISSION_ARGS=(
  --permission-mode acceptEdits
  --allowedTools "Read,Edit,Write,Glob,Grep,Bash(npm *),Bash(npx *),Bash(node *),Bash(pnpm *),Bash(git add *),Bash(git commit *),Bash(git status *),Bash(git diff *),Bash(git log *),Bash(git checkout -b *),Bash(mkdir *),Bash(ls *),Bash(cat *),Bash(touch *),Bash(cp *),Bash(mv *)"
  --disallowedTools "Bash(git push *),Bash(rm -rf *),Bash(rm -r *),Bash(sudo *),Bash(supabase *),Bash(vercel *),Bash(stripe *),Bash(curl *),Bash(wget *),Bash(ssh *)"
)

LOG_DIR="./orchestration-logs"
STATE_DIR="./.orchestration"
STATE_FILE="$STATE_DIR/completed-phases"
# ================================================

# ----- pretty output -----
if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GRN=$'\033[32m'
  YEL=$'\033[33m'; BLU=$'\033[34m'; RST=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GRN=""; YEL=""; BLU=""; RST=""
fi

banner() {
  echo
  echo "${BOLD}${BLU}============================================================${RST}"
  echo "${BOLD}${BLU}  $*${RST}"
  echo "${BOLD}${BLU}============================================================${RST}"
}
info() { echo "${GRN}*${RST} $*"; }
warn() { echo "${YEL}!${RST} $*"; }
err()  { echo "${RED}x $*${RST}" >&2; }
step() { echo; echo "${BOLD}-- $* --${RST}"; }

confirm() {
  local ans
  read -r -p "$1 ${DIM}[y/N]${RST} " ans
  [[ "${ans:-}" == "y" || "${ans:-}" == "Y" ]]
}

# ----- preconditions -----
require_env() {
  command -v "$CLAUDE_BIN" >/dev/null 2>&1 || {
    err "Claude Code CLI ('$CLAUDE_BIN') not found on PATH."
    echo "  Install:  npm install -g @anthropic-ai/claude-code"
    echo "  Or set CLAUDE_BIN to the correct path and re-run."
    exit 1
  }
  [[ -f "./CLAUDE.md" ]] || {
    err "CLAUDE.md not found in the current directory."
    echo "  Run this script from the repository root - the same folder as CLAUDE.md."
    exit 1
  }
}

# ----- phase state tracking -----
phase_done() { [[ -f "$STATE_FILE" ]] && grep -qx "$1" "$STATE_FILE"; }
mark_done()  { mkdir -p "$STATE_DIR"; grep -qx "$1" "$STATE_FILE" 2>/dev/null || echo "$1" >> "$STATE_FILE"; }

require_prereq() {
  # $1 = required phase ; $2 = this phase
  if ! phase_done "$1"; then
    err "$2 requires $1 to be completed first."
    echo "  Run:  ./orchestrate.sh $1"
    exit 1
  fi
}

# ----- manual checkpoint gate -----
gate() {
  # $1 = title ; remaining args = checklist lines
  local title="$1"; shift
  echo
  echo "${BOLD}${YEL}+- MANUAL CHECKPOINT: $title${RST}"
  echo "${YEL}|  Complete these yourself BEFORE the agents run. They involve account"
  echo "${YEL}|  creation, secrets, or cloud setup this script will not touch.${RST}"
  echo "${YEL}|${RST}"
  local line
  for line in "$@"; do
    echo "${YEL}|${RST}   ${BOLD}[ ]${RST} $line"
  done
  echo "${YEL}+-${RST}"
  echo
  confirm "Have you completed all of the above?" || {
    warn "Stopping. Re-run this phase once the checkpoint items are done."
    exit 0
  }
}

# ----- run a single agent via Claude Code -----
run_agent() {
  # $1 = agent name ; $2 = phase id ; $3 = task body
  local agent="$1" phase="$2" body="$3"
  local safe_name="${agent// /_}"
  local logfile="$LOG_DIR/$phase/${safe_name}.log"
  mkdir -p "$LOG_DIR/$phase"

  step "Agent: $agent  (phase: $phase)"
  info "Streaming output to $logfile"

  local prompt
  prompt="You are the \"$agent\" for the JoinMyTable project.

Read CLAUDE.md in the current directory FIRST. It contains the project overview, the
CORE PRODUCT RULES (invariants you must never violate), the repository structure with
per-folder ownership, the development conventions, and the full task definition for
every agent - including yours.

This invocation is for: $phase.

Your tasks for this phase:
$body

Operating rules:
- Stay strictly within YOUR owned areas of the repository structure defined in CLAUDE.md.
- Respect every CORE PRODUCT RULE. If a task seems to require breaking one, STOP and report it.
- Build only against interfaces that already exist in the repo. If a dependency you need is
  not present yet, do NOT guess or fabricate it - note it and stop.
- Do NOT deploy, push to git, modify secrets, or provision cloud infrastructure. If a task
  needs any of those, record it under 'MANUAL CHECKPOINTS' in your summary and skip it.
- Keep changes scoped, and commit your work locally with a clear message when done.
- End your output with these four sections, in this order:
    WHAT I DID
    WHAT I COULD NOT DO
    INTERFACES PUBLISHED
    MANUAL CHECKPOINTS

Begin."

  if "$CLAUDE_BIN" -p "$prompt" "${CLAUDE_PERMISSION_ARGS[@]}" 2>&1 | tee "$logfile"; then
    info "Agent '$agent' finished. Review: $logfile"
    return 0
  else
    err "Agent '$agent' exited with an error. Inspect: $logfile"
    return 1
  fi
}

run_or_halt() {
  # $1 = phase id ; $2 = agent name ; $3 = task body
  run_agent "$2" "$1" "$3" || {
    err "$1 halted at agent: $2"
    echo "  Fix the issue (see the log above), then re-run:  ./orchestrate.sh $1"
    echo "  ${DIM}Re-running repeats earlier agents in this phase. That is usually safe"
    echo "  since their work is idempotent, but skim their logs to be sure.${RST}"
    exit 1
  }
}

# ----- commit a completed phase locally (never pushes) -----
commit_phase() {
  # $1 = phase id ; $2 = description
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if [[ -n "$(git status --porcelain)" ]]; then
      git add -A
      git commit -m "$1: $2 (orchestrated)" >/dev/null
      info "Committed $1 locally: \"$1: $2 (orchestrated)\""
    else
      warn "No file changes to commit for $1."
    fi
  else
    warn "Not a git repository - skipping the per-phase commit."
  fi
}

phase_footer() {
  # $1 = phase id ; $2 = next phase id (or "") ; $3 = next description
  echo
  info "${BOLD}$1 complete.${RST}"
  echo "  ${DIM}Logs:${RST} $LOG_DIR/$1/"
  echo
  echo "${BOLD}Before continuing:${RST}"
  echo "  1. Read each agent log for items under WHAT I COULD NOT DO and MANUAL CHECKPOINTS."
  echo "  2. Run the app locally and sanity-check this phase's output."
  echo "  3. Action any manual checkpoints the agents reported."
  if [[ -n "$2" ]]; then
    echo
    echo "  ${BOLD}Next:${RST}  ./orchestrate.sh $2   ${DIM}($3)${RST}"
  else
    echo
    echo "  ${BOLD}This was the final phase.${RST} See the production-deploy checkpoint above."
  fi
  echo
}

# ==================== PHASES ====================

phase_0() {
  banner "PHASE 0 - Foundations"
  gate "Cloud accounts & project shells" \
    "Create a Supabase account and THREE projects: joinmytable-dev, -staging, -prod" \
    "Create a Vercel account and an empty project connected to your Git remote" \
    "Create the Git remote (e.g. on GitHub) and have its URL ready" \
    "Keep the Supabase project URLs and anon/service keys on hand for the .env files"

  run_or_halt "phase-0" "Foundations & DevOps Agent" \
"- Initialize the Next.js app: TypeScript, App Router, mobile-first configuration.
- Lay down the repository folder structure exactly as defined in CLAUDE.md.
- Add lint, format, and type-check configuration plus pre-commit hooks.
- Add a CI workflow that runs lint, type-check, and tests on every pull request.
- Create environment-variable scaffolding (.env.example naming every key, no real
  secrets) and the /lib/supabase client wiring.
- Integrate application logging and error tracking.
- Write the README with local-setup instructions.
- Do NOT provision cloud projects or add real secrets - those are manual checkpoints."

  run_or_halt "phase-0" "Database Agent" \
"- Design the schema for all eight entities (users, companion_profiles, availability,
  meal_requests, bookings, payments, messages, reviews) as migration files in /supabase/migrations.
- Plan PostGIS usage for companion service-area / location.
- Draft Row-Level Security policies: users see only their own data; companion profiles
  are discoverable only when verified; messages are visible only to booking participants.
- Define enum / constraint values for every status field.
- Create seed-data scripts in /supabase/seed for dev and staging.
- Generate the shared types & enums in /lib/types derived from the schema.
- Do NOT run migrations against live cloud projects yet - that happens in Phase 1."

  commit_phase "phase-0" "Foundations and schema design"
  mark_done "phase-0"
  phase_footer "phase-0" "phase-1" "Accounts & profiles"
}

phase_1() {
  banner "PHASE 1 - Accounts & profiles"
  require_prereq "phase-0" "phase-1"
  gate "Database connection" \
    "Fill the dev/staging .env files with the real Supabase URLs and keys" \
    "Confirm you can connect to the dev Supabase project from your machine"

  run_or_halt "phase-1" "Database Agent" \
"- Finalize and apply the migrations to the dev and staging Supabase projects (npm run db:migrate).
- Apply and test the Row-Level Security policies.
- Load the seed data into dev (npm run db:seed).
- Confirm geo-indexes exist; publish and freeze the schema as the interface contract."

  run_or_halt "phase-1" "Auth & Identity Agent" \
"- Integrate Supabase Auth (email/password).
- Build sign-up and login - session handling and the screen-1 UI.
- Implement the one-account-two-modes model with mode switching in the UI.
- Build the identity verification flow (stronger for companions, lighter for seekers).
- Implement profile photo upload to Supabase Storage with validation.
- Enforce that unverified companions cannot be discovered or booked.
- Manage the client auth session and reflect logged-in/out state app-wide."

  run_or_halt "phase-1" "Core API Agent" \
"- Build the profiles API module only this phase: companion profile CRUD - rate, bio,
  service area, availability, photo references.
- Authenticate the endpoints and authorize every action; validate all inputs.
- Publish the profiles API route contract for the Frontend agent."

  run_or_halt "phase-1" "Frontend Agent" \
"- Build the sign-up / mode-select screen and the companion profile setup screen.
- Mobile-first and fully responsive.
- Wire them to the Auth session and the profiles API contract.
- Handle loading, empty, and error states."

  run_or_halt "phase-1" "QA & Testing Agent" \
"- Stand up the test harness (unit, integration, e2e layers) and wire it into CI.
- Write unit tests for authorization logic.
- Write integration tests for the profiles module against a test database.
- Write tests that verify the RLS policies - users cannot access others' data."

  commit_phase "phase-1" "Accounts and profiles"
  mark_done "phase-1"
  phase_footer "phase-1" "phase-2" "Discovery"
}

phase_2() {
  banner "PHASE 2 - Discovery"
  require_prereq "phase-1" "phase-2"
  gate "Maps provider" \
    "Create a Google Maps or Mapbox account and obtain an API key" \
    "Add the Maps API key to your dev/staging .env files"

  run_or_halt "phase-2" "Integrations Agent" \
"- Integrate the Maps API in /lib/maps: geocoding (address <-> coordinates),
  places / restaurant lookup, and the map SDK for rendering.
- Expose a clean Maps module consumed by both Frontend and Core API.
- Handle third-party failure modes so a Maps outage degrades gracefully.
- Document the Maps module interface."

  run_or_halt "phase-2" "Core API Agent" \
"- Build the search API module: location-based companion discovery via PostGIS,
  with filters for meal type, date/time, price, rating, languages, interests.
- Return both list results and map-marker results.
- Use the /lib/maps module for any geocoding needs.
- Publish the search API route contract for the Frontend agent."

  run_or_halt "phase-2" "Frontend Agent" \
"- Build the discovery screen: location request (with explicit permission), search,
  filter chips, the companion list, and the bottom navigation.
- Integrate the map view using the /lib/maps module.
- Wire to the search API contract; handle loading, empty, and error states."

  run_or_halt "phase-2" "QA & Testing Agent" \
"- Write integration tests for the search module, including geo-filtering.
- Test the discovery screen across phone and desktop viewports.
- Run regression across Phase 0-2 work."

  commit_phase "phase-2" "Discovery and geo-search"
  mark_done "phase-2"
  phase_footer "phase-2" "phase-3" "Core loop"
}

phase_3() {
  banner "PHASE 3 - Core loop"
  require_prereq "phase-2" "phase-3"
  gate "Email provider" \
    "Create a transactional email service account (e.g. Resend) and obtain an API key" \
    "Add the email service API key to your dev/staging .env files"

  run_or_halt "phase-3" "Core API Agent" \
"- Build the requests module: create / accept / decline meal requests with enforced
  status transitions (requested -> accepted / declined).
- Build the bookings module: the booking lifecycle state machine
  (accepted -> confirmed -> completed, with cancelled as an off-ramp) plus restaurant,
  budget tier, and time details.
- Build the messaging module: persist chat messages, tie threads to an accepted
  request/booking, and write system messages for booking events.
- Build the notifications module: a single trigger point for transactional emails.
- Enforce business rules: chat unlocks only after acceptance; reviews only for
  completed bookings; the seeker pays the fee and the meal.
- Publish the requests, bookings, and messaging API contracts."

  run_or_halt "phase-3" "Integrations Agent" \
"- Integrate the email service in /lib/email for transactional sending.
- Build transactional email templates: request received, accepted, declined,
  booking confirmed, meal reminder, payment confirmation, review prompt.
- Expose a clean email module consumed by the Core API notifications module.
- Handle email failure modes (retry / fallback)."

  run_or_halt "phase-3" "Frontend Agent" \
"- Build the request-a-meal screen: meal type, date/time, restaurant lookup,
  budget tier, and message.
- Build the chat screen on a Supabase Realtime subscription, including system messages.
- Wire both to the requests, bookings, and messaging API contracts.
- Handle loading, empty, and error states."

  run_or_halt "phase-3" "QA & Testing Agent" \
"- Write integration tests for the requests, bookings, and messaging modules.
- Write an end-to-end test for the requested -> accepted -> coordinate flow.
- Test booking status-transition rules, including invalid transitions.
- Run regression across Phase 0-3 work."

  commit_phase "phase-3" "Core loop - requests, bookings, chat"
  mark_done "phase-3"
  phase_footer "phase-3" "phase-4" "Payments"
}

phase_4() {
  banner "PHASE 4 - Payments"
  require_prereq "phase-3" "phase-4"
  gate "Stripe" \
    "Create a Stripe account and enable Stripe Connect" \
    "Obtain Stripe API keys (use TEST mode keys for now) and the webhook signing secret" \
    "Add the Stripe keys to your dev/staging .env files" \
    "Decide the platform fee percentage - the Payments agent will flag it if undecided"

  run_or_halt "phase-4" "Payments Agent" \
"- Integrate Stripe Connect; set up connected-account onboarding for companions.
- Charge the companionship fee at booking confirmation, using Stripe Elements on the
  client so card data never touches our servers.
- Implement escrow: hold funds rather than paying out immediately.
- Release the fee on booking completion - transfer to the companion's connected
  account, minus the platform cut.
- Implement refunds on cancellation, applying the cancellation policy.
- Handle Stripe webhooks: charge succeeded/failed, transfer events, disputes.
- Reconcile payment state with the payments table.
- Publish the payments interface (status and typed error shapes) for the Frontend agent.
- Flag the platform fee percentage as a MANUAL CHECKPOINT if it has not been decided."

  run_or_halt "phase-4" "Core API Agent" \
"- Wire the booking state machine to payment actions: confirmation triggers the charge;
  completion triggers the escrow release; cancellation triggers the refund path.
- Keep these transitions authoritative and server-side."

  run_or_halt "phase-4" "Frontend Agent" \
"- Build the confirm & pay screen: booking summary, the companionship fee, the escrow
  note, and Stripe Elements for card entry.
- Wire it to the payments interface; surface payment errors clearly.
- Handle loading and error states."

  run_or_halt "phase-4" "QA & Testing Agent" \
"- Write payment-flow tests in Stripe TEST mode: charge, escrow hold, release, refund.
- Write the full end-to-end test: requested -> accepted -> confirmed -> completed.
- Run regression across Phase 0-4 work."

  commit_phase "phase-4" "Payments, escrow, and payouts"
  mark_done "phase-4"
  phase_footer "phase-4" "phase-5" "Trust & polish"
}

phase_5() {
  banner "PHASE 5 - Trust & polish"
  require_prereq "phase-4" "phase-5"

  run_or_halt "phase-5" "Core API Agent" \
"- Build the reviews module: two-way review capture tied to completed bookings,
  with rating aggregation onto companion profiles.
- Publish the reviews API contract."

  run_or_halt "phase-5" "Trust & Safety Agent" \
"- Implement the reviews feature end-to-end with the Core API and Frontend agents.
- Implement report and block functionality.
- Build the safety screen: 'share my meal details with a friend' plus safety tips.
- Implement community-guidelines acceptance at sign-up.
- Audit verification gating: confirm unverified companions are genuinely
  non-discoverable and non-bookable.
- Audit escrow safety: confirm funds are protected and release/refund logic is correct.
- Audit PII handling: minimum necessary data exposed between parties; card data never
  on our servers; coordination stays in-app.
- Record results in a trust & safety checklist and note anything failing as a checkpoint."

  run_or_halt "phase-5" "Frontend Agent" \
"- Build the reviews screen and the bookings list (upcoming / past).
- Build the safety screen UI.
- Wire to the reviews API contract; handle loading, empty, and error states."

  run_or_halt "phase-5" "QA & Testing Agent" \
"- Write integration tests for the reviews module.
- Test report/block behavior.
- Run full regression across Phase 0-5 work."

  commit_phase "phase-5" "Trust, safety, and reviews"
  mark_done "phase-5"
  phase_footer "phase-5" "phase-6" "Launch prep"
}

phase_6() {
  banner "PHASE 6 - Launch prep"
  require_prereq "phase-5" "phase-6"
  gate "Production readiness" \
    "Confirm the production Supabase project is migrated and ready" \
    "Confirm production env vars are set in Vercel (Supabase, Stripe LIVE keys, Maps, email)" \
    "Confirm Stripe is switched from TEST to LIVE keys and webhooks point at production" \
    "Note: this phase PREPARES for production - it does NOT deploy. The deploy is manual."

  run_or_halt "phase-6" "Foundations & DevOps Agent" \
"- Production hardening: review configuration, finalize the env-var checklist,
  confirm logging and error tracking are wired for production.
- Prepare (but do NOT execute) the production deploy steps; document them in the README.
- Record the deploy steps under MANUAL CHECKPOINTS."

  run_or_halt "phase-6" "QA & Testing Agent" \
"- Run the full regression suite across all phases and confirm it is green.
- Verify the critical requested -> completed path and the payment flow end-to-end.
- Report any failures clearly; do not sign off if anything is red."

  run_or_halt "phase-6" "Trust & Safety Agent" \
"- Run the final trust & safety audit across the whole application.
- Verify and sign off the trust & safety checklist.
- If any item fails, report it under MANUAL CHECKPOINTS - do not sign off."

  commit_phase "phase-6" "Launch preparation"
  mark_done "phase-6"

  echo
  echo "${BOLD}${YEL}+- MANUAL CHECKPOINT: Production deploy${RST}"
  echo "${YEL}|  The orchestrator will not deploy to production for you. Once you have${RST}"
  echo "${YEL}|  reviewed the QA regression results and the Trust & Safety sign-off:${RST}"
  echo "${YEL}|${RST}"
  echo "${YEL}|${RST}   ${BOLD}[ ]${RST} Review every agent log in $LOG_DIR/phase-6/"
  echo "${YEL}|${RST}   ${BOLD}[ ]${RST} Confirm QA regression is green and Trust & Safety signed off"
  echo "${YEL}|${RST}   ${BOLD}[ ]${RST} Promote the Vercel deployment to production yourself"
  echo "${YEL}|${RST}   ${BOLD}[ ]${RST} Smoke-test the live site before announcing"
  echo "${YEL}+-${RST}"
  phase_footer "phase-6" "" ""
}

# ==================== COMMANDS ====================

cmd_status() {
  banner "Orchestration status"
  local phases=(phase-0 phase-1 phase-2 phase-3 phase-4 phase-5 phase-6)
  local labels=("Foundations" "Accounts & profiles" "Discovery" "Core loop" "Payments" "Trust & polish" "Launch prep")
  local i=0
  for p in "${phases[@]}"; do
    if phase_done "$p"; then
      echo "  ${GRN}[done]${RST} $p  ${DIM}${labels[$i]}${RST}"
    else
      echo "  ${DIM}[    ] $p  ${labels[$i]}${RST}"
    fi
    i=$((i + 1))
  done
  echo
  echo "  ${DIM}State file: $STATE_FILE${RST}"
  echo
}

cmd_help() {
  cat <<EOF

${BOLD}JoinMyTable - Multi-Agent Orchestrator${RST}

Runs the build one phase at a time so you review between phases.

${BOLD}Usage:${RST}
  ./orchestrate.sh <command>

${BOLD}Phase commands${RST} (run in order):
  phase-0    Foundations            scaffold, repo structure, CI, schema design
  phase-1    Accounts & profiles    auth, account model, profiles, first tests
  phase-2    Discovery              maps integration, geo-search, discovery screen
  phase-3    Core loop              requests, bookings, chat, email notifications
  phase-4    Payments               Stripe Connect, escrow, payouts, confirm & pay
  phase-5    Trust & polish         reviews, report/block, safety screen, audits
  phase-6    Launch prep            prod hardening, full regression, T&S sign-off

${BOLD}Other commands:${RST}
  status     Show which phases are complete
  help       Show this message

${BOLD}How it works:${RST}
  - Each phase runs its agents in dependency order via the Claude Code CLI.
  - Agent task definitions are read from ./CLAUDE.md.
  - Before agents run, any MANUAL CHECKPOINT (accounts, secrets, cloud setup)
    is printed and must be confirmed.
  - The chain STOPS on the first agent failure - it does not push ahead.
  - On success, the phase is committed locally (never pushed) and recorded.
  - Sensitive actions - deploys, git push, secrets, cloud provisioning - are
    always left to you as manual checkpoints.

${BOLD}Before first run:${RST}
  - Run this from the repository root (the folder containing CLAUDE.md).
  - Verify the CLI flags in the CONFIG block against \`claude --help\`.
  - Read ORCHESTRATOR-README.md.

EOF
}

# ==================== DISPATCH ====================

main() {
  local cmd="${1:-help}"
  case "$cmd" in
    phase-0) require_env; phase_0 ;;
    phase-1) require_env; phase_1 ;;
    phase-2) require_env; phase_2 ;;
    phase-3) require_env; phase_3 ;;
    phase-4) require_env; phase_4 ;;
    phase-5) require_env; phase_5 ;;
    phase-6) require_env; phase_6 ;;
    status)  cmd_status ;;
    help|-h|--help) cmd_help ;;
    *) err "Unknown command: $cmd"; cmd_help; exit 1 ;;
  esac
}

main "$@"
