<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- AI calls live only in `src/lib/ai.server.ts`, loaded dynamically from server functions in `src/lib/interview.functions.ts`; it calls Google Gemini directly with the `GEMINI_API_KEY` secret (no gateway fallback) — keeps the key server-side and runs on the user's own Gemini account.
- Salary alignment and prohibited-question checks are pure functions (`src/lib/salary.ts`, `src/lib/guardrails.ts`) covered by `src/lib/hr-rules.test.ts` — they must stay deterministic, never delegated to the AI.
- Roles live in `public.user_roles`; data access is enforced by RLS via `can_access_candidate`/`has_role`, not just hidden buttons.
- Candidates join via `/interview/$token` (interviews.invite_token) with no account; token-based server functions use the admin client and return only candidate-safe fields — HR data must never be added to those responses.
- Demo entry (`/`) offers one-click HR demo sign-in and demo presets via public server functions in `interview.functions.ts`; remove or gate them before a real production launch.
- Interview stage transitions are validated with the pure turn policy in `interview-prompts.ts` before messages are saved — prevents Gemini from skipping the required HR sequence or closing prematurely.
- Browser clients may only read interview messages, evaluations and review fields; those rows are written by server functions with the admin client after an access check (RLS/column grants enforce it) — keeps AI output and approvals tamper-proof.
- Public demo helpers only list `candidates.is_demo` rows and obey the `demo_enabled` app setting — real invite links must never be exposed publicly.
