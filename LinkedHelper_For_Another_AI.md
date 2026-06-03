# LinkedHelper — a complete operating model for another AI

**Purpose.** This is a self-contained briefing on LinkedHelper 2 (LH2): what it is, every meaningful capability it exposes, how it's structured, what it sends to downstream systems, what the safety envelope looks like, and what's commonly underused. Written for another AI to ingest before reasoning about a LinkedHelper-driven outreach pipeline.

---

## 1. What LinkedHelper actually is

LinkedHelper is a **desktop application**, not a browser extension and not a cloud service. It bundles its own Chromium environment and drives LinkedIn the way a person would — real clicks, real typing, real scrolling — without injecting code into the LinkedIn page and without using LinkedIn's API. All data is stored locally on the machine running the app; moving installations requires a backup/restore of the LinkedHelper data directory.

It runs on top of any LinkedIn account tier: Basic (free), Premium, Sales Navigator, Recruiter Lite, and Recruiter (Pro). The same campaign can be told to process profiles through a different LinkedIn surface than the one the leads were collected from (an "Override platform" plug-in lets a Sales Navigator list be processed by a Basic account, which is the basis for the agency multi-account model below).

Pricing as of 2026: Standard ~$15/month (basic automation, basic CRM, limited group/event messaging, **no full messaging-history via webhook**), Pro ~$45/month (full automation, full webhook payloads, advanced personalization, IF-THEN-ELSE templates), 14-day full-feature trial. The Pro tier is the relevant one for any pipeline that depends on rich webhook payloads carrying message history.

---

## 2. The platform model

The hierarchy is **LinkedIn account → campaign → workflow → action → lists**.

- **LinkedIn account** is the parent container. One LinkedHelper install can attach multiple LinkedIn accounts; working hours, daily limits, and proxy settings are configured per account. Important: working hours are stored as a fixed UTC offset, not a true timezone, so daylight savings transitions must be adjusted by hand twice a year.
- **Campaign** is a self-contained outreach project with a starting list of profiles ("Queue") and a workflow.
- **Workflow** is an ordered chain of actions. The chain is the unit of automation.
- **Action** is a single operational step (visit profile, send invite, message, scrape, etc.). Each action has its own settings and its own per-action lists (Queue, In progress, Successful, Failed, Replied, Excluded, Skipped, Messaged). The action's "Replied" list is where reply-detection deposits profiles.
- **Lists** also exist at the campaign level, aggregating across all actions in the campaign.

A profile is a token that flows through the chain. It enters one action's Queue, gets processed, and either succeeds (advances to the next action), fails, gets skipped, gets excluded, or gets parked in Replied. There's a Retry mechanism that puts profiles back into the Queue, including an "Ignore reply and retry" path for forcibly re-sending to someone who already replied.

Two structural rules govern chains: actions that operate on 2nd/3rd-degree connections cannot be placed after actions that require 1st-degree (and vice versa) without a `Filter contacts out of my network (keep 1st level only)` action between them. LinkedHelper auto-inserts this filter when you build the standard "Invite → Message" sequence. The filter is also the gate that holds invited prospects until they accept; un-accepted invites cycle back to its queue roughly hourly until accepted or aged out.

---

## 3. Where leads come from (lead sources)

LinkedHelper can collect profiles from essentially every prospect surface LinkedIn exposes:

- **Regular LinkedIn search** (the basic filter set)
- **Sales Navigator search** (the precision tool — by far the most filter dimensions; Lead Lists, saved searches, account lists, Boolean queries)
- **Recruiter / Recruiter Lite search**
- **LinkedIn group members** (a group you're a member of)
- **Event attendees** (an event you're attending or hosting)
- **Post likers and commenters** (people who reacted to a specific post — yours or anyone's)
- **Alumni pages** (school-based prospecting)
- **"People who viewed your profile"**
- **Followers page**
- **Your "Sent pending invites"** (re-prospect or cancel cold pending invites)
- **"My network" page** (all your existing 1st-degree connections)
- **CSV upload of LinkedIn URLs** (the entry point for externally-sourced lists)
- **Organizations extractor + Employees extractor** — scrape companies, then convert a company list into the people who work there by visiting each company's "People" tab

The Sales Navigator → free-account processing pattern is important: an agency can hold one Sales Navigator subscription, build precision lists there, and route the actual processing through several free Basic accounts via Override platform. This is what makes LinkedHelper economically viable for multi-account operators.

---

## 4. The full action catalog

Grouped by intent. All of these are real LinkedHelper actions or plug-in-enabled actions that can be dropped into a workflow.

### Warm-up / pre-outreach (raises acceptance and reply rates)

- **Visit profile** — load a profile page. LinkedIn shows you in "who viewed your profile" notifications.
- **Profiles auto-follower** — follow the prospect. When the connection invite later arrives, LinkedIn appends "[Your name] is following you and would like to connect," which materially lifts acceptance.
- **Endorse skills** — endorse a chosen number of the prospect's skills.
- **Like posts and articles** — auto-like 1–N of a prospect's most recent posts (newest-first).
- **Comment on posts** — auto-comment with templated text.
- **Boost post** — schedule a post and have LinkedHelper automatically tag-mention a list of target profiles in the comments/body. The tagged people get personalized notifications, which is a back-door warm-up channel that bypasses the weekly invite limit and creates familiarity before the eventual connection request.

### Connection-building

- **Invite 2nd and 3rd level contacts** — the workhorse: send connection requests with or without a note.
- **Filter contacts out of my network (keep 1st level only)** — the gate that holds profiles until they accept the invite; required between Invite and any 1st-degree action.
- **Automatic sent invites canceller** — withdraw pending invites that have been pending more than N days (default ~30) to keep the pending queue clean and avoid "I don't know this person" flags.
- **Auto accept incoming invites** — within this campaign, auto-accept invites the prospect sends *you* (useful when boost-post tagging triggers inbound invites).
- **Bulk remove unwanted connections** — prune 1st-degree contacts that don't fit.

### Messaging

- **Message to 1st connections** — direct message to a 1st-degree contact (the standard post-accept welcome/follow-up surface).
- **Message to group members** — free message to a fellow group member regardless of connection degree (no invite required). Initial messages land in the recipient's *Message Requests* inbox; LinkedIn moves them into the main inbox when the recipient accepts the request, and only then does a follow-up fire by default.
- **Message to event attendees** — same mechanic for fellow event attendees, including 3rd-degree.
- **InMail to 2nd & 3rd contacts** — paid InMail using account credits; supports Open Profiles for free InMails (Open Profile is a Premium-account setting on the recipient's side that makes their inbox free).
- **Message sequence templates** — multi-step drip sequences with Delay between actions and Check for replies between every message.

### Reply detection

- **Check for replies** — opens messaging threads of profiles in the queue and inspects history. Profiles that replied get sorted into the action's Replied list; non-repliers either continue waiting (configurable time window) or move to the next action. LinkedHelper auto-inserts a Check for replies after every messaging action; can be removed if unwanted. Critically: this is the **only** action that fires the `Send replied to Webhook` plug-in's webhook — never a Message action directly.
- **Reject if a contact replied after #** — a setting available on Message to 1st connections and similar messaging actions; checks message history from now back to the prior action's send and blocks the upcoming message if the prospect already replied. This is the "fast handshake reply" guard.

### Data extraction / enrichment

- **Visit & extract profiles** — scrape the full profile: work history, education, skills, languages, websites, headline, location, industry, photo URL, contact info if 1st-degree, follower count, Premium/Open Profile badges, mutual connections count.
- **LH Email Finder** — built-in email enrichment for 2nd/3rd-degree contacts; uses a community/pooled email database, so it often returns an email *without* needing to visit the profile, which saves daily-action budget.
- **Snov.io integration** — alternative email finder for verified work emails.
- **Scrape messaging history** — dedicated action that opens messaging threads of profiles in the queue and saves the full chat history into LinkedHelper's local storage. Also embedded as a feature inside every messaging action and Check for replies.

### Organization scraping (separate campaign type)

- **Organizations extractor** — scrape company pages: name, size, industry, locations, specialties, description, founded year, headcount data.
- **Employees extractor** — fan out from a company list to the actual people in those companies by visiting each company's "People" tab.

### Inviting 1st-degree connections to engage

- **Invite to event** — invite your 1st-degree connections to a LinkedIn event.
- **Invite to group** — invite to a LinkedIn group you admin or moderate.
- **Invite to follow company page** — grow company page followers.

### Flow control

- **Delay between actions** — simple timer, holds profiles in the queue before moving them downstream.
- **Postpone action start** — defer an action to let earlier ones run first.
- **Action steps delays** — slow down per-step pacing within an action (safety lever).

### Outbound integrations

- **Send person to webhook** — fire profile data to any HTTP endpoint when the profile reaches this action.
- **Send organization to webhook** — same for the organization-scraping campaigns.
- **Send person to external CRM** — direct native integration. Supported CRMs (as documented): HubSpot, Salesforce, Pipedrive, Zoho CRM, Zoho Recruit, ActiveCampaign, Close.io, Capsule, HighLevel, Streak, Instantly.
- **Send person to Snov.io campaign** — push directly into a Snov.io email drip.
- **Send replied to Webhook** (plug-in) — adds a webhook toggle to Check for replies and to messaging actions; when installed, the action will fire the webhook *the moment a reply is detected*, with reply text and message history attached. This is the plug-in that actually delivers reply events to a downstream CRM.

### Tagging & variables

- **Tag** — set or remove tags on profiles (requires the Tagging system plug-in). Tags can be applied automatically (as the profile passes through an action) or manually (in the CRM/list views).
- **Custom variables** — three scopes: CRM level (per-profile, persistent), Campaign level (per-profile, this campaign only), Action level. Campaign-level overrides CRM-level if both define the same column. Requires the Custom template variables plug-in.

---

## 5. The plug-in store

Most advanced features ship as toggleable plug-ins, free, installed in-app. The store separates them from default actions so the UI stays clean for new users. Plug-ins worth knowing about (beyond those listed above):

- **Tagging system** — enables the Tag action and tag columns in the CRM.
- **Built-in CRM** — the persistent profile database (left-side panel on every visited profile shows tags, notes, history).
- **Inbox** — built-in reply inbox that consolidates LinkedIn message threads across campaigns; can reply directly from LinkedHelper without bouncing into LinkedIn.
- **Custom template variables** — variables in templates and CSV upload of variable values.
- **Message Template Editor PRO** — IF-THEN-ELSE conditional logic in templates, message randomization, multi-version messages to avoid pattern-detection.
- **Advanced settings for Check for replies** — mark group/event message-request acceptances as a "reply"; optionally send a follow-up to those who accepted the request but didn't actually reply yet.
- **Advanced settings for Invite 2nd and 3rd level contacts** — submit a known email when LinkedIn asks for one to allow the invite.
- **Override platform** — process a list via a different LinkedIn surface than it was collected from.
- **Image attachments + personalized images** — attach a generic image to every message via custom variable, or use Uclic/Hyperise to inject per-profile personalized images.
- **Emojis** — emoji support in templates.

---

## 6. Personalization mechanics

Standard variables: `{firstname}`, `{lastname}`, `{position}`, `{company}`, `{industry}`, `{location}`, `{mutual_connections_count}`, and any custom variable uploaded at CRM/campaign/action level.

Message Template Editor PRO enables conditional logic and message randomization. A typical pattern: branch the welcome message on industry, company size, or whether the prospect shares a mutual connection. Multiple alternate phrasings of the same template can be randomized to dilute any pattern-detection signal LinkedIn might be applying to messages with high textual repetition.

Image personalization (via Uclic or Hyperise) lets every recipient see a slightly different image — typically with their name, company logo, or photo overlaid. This is unusual on LinkedIn and tends to attract attention, though it costs an additional subscription with the imaging provider.

---

## 7. Limits, safety envelope, and account hygiene

LinkedIn enforces a **weekly invitation limit** of approximately 200 connection requests per week for most accounts; new accounts may be capped much lower (10–15/day to start). The limit resets exactly seven days after the first invitation in the rolling window. There is no way to purchase additional invitation credits regardless of tier.

LinkedHelper's recommended action-specific daily caps (designed to stay under LinkedIn's behavioral detection):

- Invite 2nd and 3rd: ~50/24h (this is the binding constraint for cold campaigns — 200/wk ÷ 5 weekdays = ~40)
- Endorse skills: ~60/24h
- Messaging, profile follow, profile extract, etc.: ~150/24h aggregate
- Boost post: ~100 mentioned profiles/24h
- Loading LinkedIn profiles via URL: ~40/24h

Total recommended daily actions across all types: **stay below ~100–150**. Sudden volume spikes attract restrictions.

Working hours and days are configured at the LinkedIn-account level inside LinkedHelper. **Weekend and 24/7 patterns are the highest-signal bot indicators** to LinkedIn's behavioral detection — a campaign running Saturday and Sunday at the same volume as weekdays will look automated. Default to Monday–Friday, business hours in the account's local time, with randomized intra-day delays.

Pending invite hygiene: keep total pending invites below ~200–500. Cancel pending invites older than 21–30 days (the Automatic sent invites canceller plug-in handles this). High pending counts + low acceptance + "I don't know this person" reports are the path to restrictions.

The platform argues it's safer than browser-extension competitors because it runs as its own application performing real clicks/typing rather than injecting JavaScript into LinkedIn's page. The marketing claim is plausible but doesn't override LinkedIn's behavioral analysis — the determinant of safety is **what you do with it**, not the architecture.

---

## 8. The data envelope (what every webhook/CSV row carries)

When LinkedHelper fires a `Send person to webhook` or `Send replied to Webhook` event, the payload includes a substantial set of fields. Approximate inventory:

**Identity & profile**: `id`, LinkedIn URL, `firstname`, `lastname`, `headline`, `current_position`, `current_company`, `location`, `industry`, `summary`, `photo_url`, `background_image_url`, `connection_degree`, Open Link / Premium / Open Profile badges, `followers_count`, `mutual_connections_count`, languages, skills, education, full work history (positions with companies, dates, descriptions), `websites` (list), `phone_numbers`, scraped/found `emails`, and any custom variables defined at CRM/campaign/action level.

**Campaign context**: campaign name, action name that fired the webhook, tags applied to the profile, action timestamp.

**Messaging fields** (Pro license required for full history):
- `last_sent_message_from`, `last_sent_message_text`, `last_sent_message_send_at` — the most recent outbound message
- `last_received_message_from`, `last_received_message_text`, `last_received_message_send_at` — the most recent inbound message
- `replied_message_1_from`, `replied_message_1_text`, `replied_message_1_send_at` (and `_2`, `_3`, …) — every detected reply
- Full conversation history (Pro): all messages in chronological order, both directions
- Campaign-only history (Pro): only messages exchanged during this campaign's run

**Organization webhook payload**: company name, LinkedIn company URL, industry, size band, headquarters location, other locations, specialties, description, founded year, website, follower count.

Note: with a Standard license, **messaging history cannot be sent via webhook** — only the lighter profile-data webhook works. This is the single most important reason a serious automated pipeline needs the Pro tier.

---

## 9. Integrations

**Native CRM connectors** (built into LinkedHelper via the `Send person to external CRM` action): HubSpot, Salesforce, Pipedrive, Zoho CRM, Zoho Recruit, ActiveCampaign, Close.io, Capsule, HighLevel, Streak, Instantly.

**Webhook to anywhere**: any HTTP endpoint can receive `Send person to webhook` events. Common patterns: Zapier (which fans out to thousands of downstream apps), Make.com (formerly Integromat), Notion (via a community integration), Google Sheets (via Zapier or Make), custom application endpoints (this is the pattern PeerChair uses).

**Email enrichment**: LH Email Finder (in-house community database), Snov.io (paid third party).

**Image personalization**: Uclic, Hyperise.

---

## 10. Multi-account / agency model

A single LinkedHelper install can attach multiple LinkedIn accounts. Each account has independent working hours, limits, and queues, but all share the same CRM and tag dictionary.

The agency lever: hold one Sales Navigator subscription on a "list-building account," use its precision filters to build leads, then route processing to other LinkedIn accounts (Basic or Premium) via the `Override platform` plug-in. Cost-efficient for managing several real LinkedIn identities (e.g., a Chapter Director plus a Chief of Staff plus a sales rep all running outreach under their own profiles but using one shared Sales Nav).

---

## 11. Common patterns and the most underused capabilities

What most people use LinkedHelper for is a simple three-action chain: Invite → Filter → Message. The interesting capabilities — the ones operators leave on the table — fall into four categories.

**Warm-up before the invite.** Stacking `Profiles auto-follower` + `Like posts` + `Endorse skills` before `Invite 2nd and 3rd level contacts` produces multiple notifications in the prospect's LinkedIn feed before the connection request lands. The invite then carries "[Your name] is following you and would like to connect" instead of being cold. Documented acceptance lift: meaningful and consistent. Cost: maybe 5–10 days of timeline before the invite goes out.

**Boost post for tagged-mention warm-up.** The `Boost post` action publishes a post (yours or someone else's) and auto-tags target profiles in the comments. Each tag triggers a personalized notification — a touch that bypasses the weekly invitation limit entirely. The natural follow-up is an Invite & Follow-up campaign that collects everyone who reacted or commented, since they've now seen your content. This is essentially free top-of-funnel above the 200/wk ceiling.

**Free-message channels that bypass invites.**
- `Message to group members` — free messaging to anyone in a shared group, even 3rd-degree.
- `Message to event attendees` — free messaging to anyone attending a shared event, even 3rd-degree.

Both go to the prospect's Message Requests inbox first; LinkedIn moves them to the main inbox when accepted. For any audience where a relevant group or event exists, this is a parallel acquisition channel that doesn't consume the weekly invite limit.

**Visit & extract before everything else.** Running a Visit & Extract pass over a seed list *before* inviting populates downstream personalization variables: industry, headline, headcount, websites, mutual-connection count, even emails. Downstream messages can then use those variables in conditional templates (Pro): different welcome copy for finance vs. operations CFOs, for companies above vs. below $100M revenue, for prospects with vs. without a mutual connection. This is the difference between a generic drip and segmented outbound.

---

## 12. Failure modes

- **Reply webhook on the wrong node.** The Send replied to Webhook plug-in only fires from `Check for replies` actions (and the equivalent setting embedded in messaging actions, which is effectively a built-in check). It does **not** fire from a plain `Message to 1st connections` send. If reply detection is wired to the wrong node, replies will be silently missed.
- **Pre-welcome reply gap.** If the chain is `Invite → Filter → Welcome message → Check for replies`, a prospect who accepts and replies with "Happy to connect" or 👍 *before* the welcome sends will not be detected as a replier until after the welcome runs (because the only Check for replies is downstream of the welcome). The fix is an additional Check for replies inserted *between* Filter (accept) and the Welcome message. This is the "fast handshake" failure mode.
- **Weekend/holiday running.** The default LinkedHelper account schedule does not automatically exclude weekends or US holidays; if the days-of-week toggles are left on, the campaign will run Saturday and Sunday at full volume. Highest-signal bot pattern.
- **DST drift.** Working hours are stored as a fixed UTC offset, not a true timezone. Twice a year (March and November in the US), the offset must be hand-edited or the working window silently shifts by an hour.
- **Pending-invite accumulation.** Without the Automatic sent invites canceller plug-in enabled, old pending invites pile up; LinkedIn flags accounts with high pending counts and low acceptance.
- **Standard license messaging-history gap.** A Standard license cannot send messaging history via webhook; downstream systems that depend on the message thread snapshot (e.g., for AI reply suggestion) will see only the bare profile fields.
- **Local-only data.** Closing the laptop closes LinkedHelper. The app must be running on a machine that's online for the campaign to run. The desktop dependency is the single biggest operational constraint relative to cloud-native alternatives.

---

## 13. Concrete capability checklist for a downstream system

If another AI is building or reasoning about an integration on top of LinkedHelper, these are the levers it can pull:

- Trigger or pause campaigns (manually, in the LinkedHelper UI — there is no API for this; the AI cannot programmatically start/stop campaigns)
- Receive `sent` / `connected` / `replied` lifecycle events via webhooks at the configured Check-for-replies and Send-person-to-webhook nodes
- Read full profile data, contact info, messaging history (Pro license) from each webhook payload
- Apply and read tags per profile to maintain batch attribution across campaigns
- Pre-enrich a seed list via Visit & Extract + LH Email Finder before outreach
- Use custom variables, uploaded by CSV or webhook-pushed, to personalize messages
- Branch message content with IF-THEN-ELSE on custom variables (Pro)
- Configure per-account working hours and daily caps
- Stack warm-up actions (follow, endorse, like, boost post) in front of the invite
- Bypass the invite limit via group/event messaging where applicable

LinkedHelper does **not** expose:
- A public REST API for campaign control
- Server-side hosting (it must run on a desktop or VM you control)
- Native deduplication across campaigns at the LinkedHelper level beyond the lists/sub-lists model (CRM-wide dedup must be enforced upstream)
- Real timezone handling (UTC offset only)

---

## 14. Sources

LinkedHelper product site and support docs (support.linkedhelper.com), feature pages on linkedhelper.com, third-party reviews on G2, GetApp, SoftwareAdvice, Folk, Salesforge, Skrapp, and HeyReach. Pricing, action lists, plug-in inventory, webhook field set, and recommended limits were cross-checked across multiple of those sources for consistency. Feature set is current as of late 2025 / early 2026; LinkedHelper ships updates frequently and individual flag names may drift.
