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

- [x] `sync-sent`  — sent-email capture. Matches `people`, writes person_id,
      parameterized lookback. (2026-05-28)
- [x] `sync-email` — rewritten to mirror sync-sent: direct Graph token (dropped
      the fragile LLM/MCP path), match SENDER against `people`, write
      `communications` (direction IN) so inbound replies hit the timeline.
      email_messages is now legacy/unused for new writes. (2026-05-28)
- [x] `calendly-webhook` — already matched people; fixed its communications
      inserts to person_id-only (were setting contact_id=<people id>, FK-fail
      for people-only). (2026-05-28)
- [x] `log-outreach` — already matched people; dropped contact_id dual-write
      (person_id-only). (2026-05-28)
- [x] `inbox-summary` — sender lookup switched contacts → people. (2026-05-28)
- [x] `people/[id]/action` (note) — was setting contact_id=<people id>, which
      FK-failed for people-only: **you couldn't save a note on William's
      profile.** Now person_id-only. (2026-05-28)
- [x] `add-note` (GPT) — dropped contact_id dual-write. (2026-05-28)
- [x] reviewed `follow-up-queue`, `queue-debug` — LinkedHelper-specific (the
      LinkedIn reply queue); LinkedHelper maintains their contacts rows via the
      webhook dual-write, so NOT a people-only bug. Migrate when we drop
      contacts; left as-is for now.

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
