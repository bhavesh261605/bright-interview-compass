# WAE HR — AI Interview Agent

WAE HR is an AI-led first-round HR interview platform. An AI interviewer (**Aria**, powered by Google Gemini) runs structured screening interviews with candidates over a chat/voice room, then produces an evidence-based evaluation, a salary-band check, and a scorecard that a human reviewer approves before any decision is made.

**Live app**: https://bright-interview-compass.lovable.app

Built with [Lovable](https://lovable.dev) · [Open in the Lovable editor](https://lovable.dev/projects/c9d06fd7-ed55-4dbf-a02a-7199eae7224f)

---

## What it does

- **Candidate intake** — recruiters add candidates (fresher or 0–6 yrs experienced), optionally upload a resume (PDF/image) and let Gemini autofill the profile, then generate a unique interview invite link.
- **Candidate interview room** — candidates join via the invite link with no account or password. Aria interviews them in chat, with optional speech-to-text (mic) and text-to-speech (Aria reads questions aloud).
- **Structured interview flow** — the agent follows a fixed HR sequence: introduction → background → notice period/availability → motivation → culture fit → competency → STAR-style project probing → salary expectations → closing. Separate question banks for freshers vs. experienced candidates. Stage transitions are validated in code so the AI cannot skip steps or close early.
- **Guardrails** — prohibited questions (age, religion, marital/family status) are filtered deterministically; out-of-band salary expectations and behavioral red flags are routed to a human reviewer, never auto-decided.
- **Evaluation & scorecards** — after the interview, Gemini produces competency scores with transcript evidence quotes, a recommendation, and red flags. Scorecards are printable/exportable.
- **Salary band check** — deterministic comparison of the candidate's expectation against the approved band for the role (`within_band` / `above_band` / `below_band`).
- **Review queue & human checkpoint** — anything out-of-band or flagged lands in the review queue with the full transcript, evidence, and salary status; reviewers approve, counter, or reject.
- **ATS export** — one-click scorecard export as JSON (`wae-hr.ats.v1` schema) for pushing into an ATS.
- **HR console** — dashboard, candidate list/profiles, interview setup and summaries, scorecards, salary bands, analytics, settings (team roles, AI model, competency weights, audit log).
- **Roles & access** — `admin`, `recruiter`, `reviewer` roles enforced by row-level security, not just hidden buttons. Candidates only ever see candidate-safe fields.

## Tech stack & models

| Layer | Choice |
| --- | --- |
| Framework | TanStack Start v1 (React 19, SSR), Vite |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Backend | Lovable Cloud (Supabase): Postgres + RLS, auth, private resume storage, server functions |
| AI model | Google Gemini (`gemini-3-flash-preview` by default, configurable) via the Gemini API — chat, evaluation, and resume parsing |
| Voice | Browser Web Speech API: `SpeechRecognition` (speech-to-text, en-IN) and `speechSynthesis` (text-to-speech) |
| Tests | Vitest (deterministic HR rules: salary bands, guardrails, question sets, turn policy) |

Key design rules (see `AGENTS.md`):

- All AI calls live in `src/lib/ai.server.ts` and run server-side with the `GEMINI_API_KEY` secret — the key never reaches the browser.
- Salary alignment and prohibited-question checks are pure, deterministic functions (`src/lib/salary.ts`, `src/lib/guardrails.ts`) with unit tests — never delegated to the AI.
- Interview stage transitions are validated by a pure turn policy (`src/lib/interview-prompts.ts`) before messages are saved.

## Setup

Prerequisites: Node.js 20+ (or Bun).

```sh
git clone <this-repository-url>
cd <repository-name>
npm install
```

Create a `.env` file with:

```sh
# Lovable Cloud / Supabase backend (from your project settings)
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_SUPABASE_PROJECT_ID=...

# Google Gemini — server-side only, get a key at https://aistudio.google.com
GEMINI_API_KEY=...
# Optional: override the default model
# GEMINI_MODEL=gemini-3-flash-preview
```

The database schema (tables, RLS policies, private `resumes` storage bucket) is managed through Lovable Cloud migrations; cloning the repo alone does not provision a backend. The easiest path is to open the project in the Lovable editor, where the backend is already live — or point the app at your own Supabase project and apply the migrations.

Run it:

```sh
npm run dev      # start the dev server
npm test         # run the HR rules test suite
npm run build    # production build
```

## How to run the agent (a full interview)

1. **Sign in as HR** — on the landing page use the one-click *Sign in as HR Demo* button (demo only — remove before production), or sign in with an account that has a recruiter/admin role.
2. **Create a job role and salary band** — under *Salary bands*, e.g. "Graduate Engineer Trainee", ₹4–6 lakh.
3. **Add a candidate** — *Candidates → Add candidate*, pick fresher/experienced, optionally upload a resume and click *Read resume & autofill*.
4. **Start an interview** — create an interview for the candidate; copy the invite link shown on the interview or candidate page.
5. **Candidate side** — open the invite link in a second browser/incognito window (no login needed). Confirm the name, then chat with Aria — or use the mic to speak and the speaker toggle to hear her questions.
6. **Evaluation** — when the interview closes, the evaluation and scorecard are generated automatically. If the salary expectation is outside the band or a red flag is raised, the case appears in the *Review queue* for a human decision.
7. **Export** — from the scorecard or review queue, use *Export ATS scorecard* to download the JSON payload.

## Demo entry

The landing page (`/`) is a no-login-wall demo entry: HR demo sign-in, demo presets (an active session, a completed candidate with salary/flag exceptions, a fresh session), and a paste-a-link box for candidates. **Gate or remove these before a real production launch.**

## License

Private — all rights reserved unless stated otherwise.
