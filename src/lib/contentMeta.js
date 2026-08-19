// Shared vocabulary for the Content page and the full-page post editor
// (/content/post/[id]) — kept in one place so the calendar, list view, and
// editor can never drift out of sync on what a status or destination means.

export const FORMATS = ["video", "text", "carousel", "image", "poll", "article"]

export const DESTINATIONS = [
  { v: "none", label: "No link (reach post)" },
  { v: "assessment", label: "Assessment" },
  { v: "overview", label: "Brochure" },
  { v: "meeting", label: "Meeting" },
  { v: "investment", label: "Investment" },
  { v: "events/august-11-workshop", label: "Event · Aug 11 Workshop" },
  { v: "events/september-16-workshop", label: "Event · Sep 16 Workshop" },
]

export const DEST_PILL = {
  overview: "Brochure", assessment: "Assessment", meeting: "Meeting",
  investment: "Investment",
  "events/august-11-workshop": "Aug 11 Event",
  "events/september-16-workshop": "Sep 16 Event",
}

// One production pipeline for every post — script text lives on the post itself
// (the transcript field), so there's no separate "script" object to keep in sync.
// Dates only matter once a post reaches "scheduled"; the publish date/URL only
// show up once it reaches "posted".
export const STAGES = [
  { v: "draft",          label: "Draft",         fg: "#475569", bg: "rgba(100,116,139,0.13)" },
  { v: "ready_to_shoot", label: "Ready to shoot", fg: "#7c3aed", bg: "rgba(124,58,237,0.13)" },
  { v: "shot",           label: "Shot",           fg: "#2563eb", bg: "rgba(37,99,235,0.13)" },
  { v: "edited",         label: "Edited",         fg: "#0891b2", bg: "rgba(8,145,178,0.13)" },
  { v: "scheduled",      label: "Scheduled",      fg: "#b45309", bg: "rgba(217,119,6,0.14)" },
  { v: "posted",         label: "Posted",         fg: "#15803d", bg: "rgba(22,163,74,0.14)" },
]

// Fixed content categories — Dalen's list, name only in the dropdown. What each
// one means (kept here only as a comment, never shown in the UI):
//   CFO Insight        - thought leadership on the CFO role/decisions/leadership
//   Peer Community      - why CFOs benefit from being around other CFOs
//   Event Promotion     - primary purpose is getting someone to attend something
//   Partner Spotlight   - builds credibility, recognizes CFO Circle's supporters
//   CFO Circle Proof    - shows CFO Circle is real; what's actually happening
//   CFO Circle Brand    - explains what CFO Circle stands for / differentiates it
//   Personal / Founder  - builds Dalen as the person behind the community
//   Educational         - teaches something concrete, not primarily an opinion
export const PURPOSES = [
  "CFO Insight",
  "Peer Community",
  "Event Promotion",
  "Partner Spotlight",
  "CFO Circle Proof",
  "CFO Circle Brand",
  "Personal / Founder",
  "Educational",
]

export const STAGE_BY_VALUE = {}
STAGES.forEach(function (st) { STAGE_BY_VALUE[st.v] = st })

export const STATUS_COLOR = {}
STAGES.forEach(function (st) { STATUS_COLOR[st.v] = { bg: st.bg, fg: st.fg } })
