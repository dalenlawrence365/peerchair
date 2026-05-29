# contacts → people migration checklist

The unified `people` table is the source of truth. Legacy `contacts` and `pool`
still exist and Phase-3 triggers sync `contacts → people` (keyed on shared `id`).
This file tracks every remaining place that still depends on `contacts`, so we
migrate deliberately instead of with a risky blanket sweep.

Audit date: 2026-05-28. ~47 files reference `contacts` / `contact_id`.

---

## Tier 0 — Schema blockers (do first)

- [x] `communications.contact_id` was NOT NULL + FK→contacts. People-only
      records (e.g. William Chiem, no contacts row) could not have ANY activity
      row. → Dropped NOT NULL so rows can be person_id-only. (2026-05-28)
- [ ] Audit other tables with NOT NULL `contact_id` + FK→contacts that should
      accept person-only rows: `email_messages`, `referrals`, `deal_contacts`,
      `person_*` tables already use person_id. Check `communications` siblings.

## Tier 1 — Active BUGS: routes that MATCH against `contacts` and silently
## drop people-only records. These lose/hide data right now.

- [ ] `sync-sent`  — sent-email capture. **IN PROGRESS.** Match `people`, write
      person_id, parameterize lookback. (This is the William bug.)
- [ ] `sync-email` — inbound capture via M365 MCP. Matches `contacts`; also only
      writes `email_messages` (which the profile timeline does NOT read). Two
      fixes: match `people`, and either write `communications` or merge
      `email_messages` into the timeline.
- [ ] `calendly-webhook` — booking/meeting capture matches `contacts`.
- [ ] `log-outreach` — outreach logging matches `contacts`.
- [ ] `inbox-summary` — inbox rollup reads `contacts`.
- [ ] verify `follow-up-queue`, `queue-debug` — heavy `contacts` reads; confirm
      whether they already join through to `people`.

## Tier 2 — Intentional dual-write / by-design (leave until the finale)

- `linkedhelper-webhook` — deliberately writes BOTH contacts + people; the
  trigger relies on it. Do not change until we drop `contacts`.
- `audit` — its job is to audit the `contacts` table. References are the point.

## Tier 3 — Active WRITE paths (migrate to people when convenient)

- `add-contact`, `people/add`, `add-note`, `save-draft`, `outreach-sequence`,
  `scheduled-send`, `no-show-sequence`, `smart-action`, `transcribe`,
  `email/*` (send/draft/fetch/body), `meetings`, `my-plan`,
  `pipeline-maintenance`, `contact-context`, `ask-claude`,
  `gpt-action-schema.yaml`.

## Tier 4 — DEAD CODE: legacy SPA at /legacy. Do NOT migrate — DELETE when we
## retire /legacy.

- `components/App.jsx` + `ContactProfile`, `Sponsors`, `MyPlan`,
  `LinkedInMessages`, `EmailMessages`, `FollowUp`, `SponsorStageWorkspace`,
  `LiveCallCompanion`, `SmartCommand`, `DraftEmail`. Reachable only at /legacy,
  which is no longer used.

## Finale

- [ ] Once Tiers 1–3 are off `contacts`, drop the `contacts` + `pool` tables and
      the Phase-3 sync triggers. Pause LinkedHelper first (accept events keep
      firing webhooks during migrations).
