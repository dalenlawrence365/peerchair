// Shared meeting-tag vocabulary + UI display metadata.
//
// The classification logic itself lives in src/app/api/sync-calendar/route.js
// (which writes tags during ingestion). This module only owns the UI side:
// what colors/labels each tag renders as, and the canonical list for editing.

export const TAG_VOCABULARY = [
  // Role (auto-derived from matched person)
  "cfo",
  "sponsor",
  "referral",
  // Pipeline events
  "fit_call",
  "sponsor_discovery",
  "call",
  // Networking sub-categories
  "provisors",
  "acg",
  "mixer",
  "troika",
  // Networking umbrella
  "networking",
  // Internal
  "chapter_peer",
  // Personal/admin
  "personal",
  // Catch-all
  "other",
]

export const TAG_LABEL = {
  cfo:               { label: "CFO",               color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  sponsor:           { label: "Sponsor",           color: "#15803d", bg: "rgba(22,163,74,0.14)" },
  referral:          { label: "Referral",          color: "#1d4ed8", bg: "rgba(59,130,246,0.10)" },
  fit_call:          { label: "Fit call",          color: "#b45309", bg: "rgba(217,119,6,0.14)" },
  sponsor_discovery: { label: "Sponsor discovery", color: "#a855f7", bg: "rgba(168,85,247,0.14)" },
  call:              { label: "Call",              color: "#64748b", bg: "rgba(100,116,139,0.13)" },
  provisors:         { label: "ProVisors",         color: "#0891b2", bg: "rgba(8,145,178,0.13)" },
  acg:               { label: "ACG",               color: "#0891b2", bg: "rgba(8,145,178,0.13)" },
  mixer:             { label: "Mixer",             color: "#7c3aed", bg: "rgba(124,58,237,0.13)" },
  troika:            { label: "Troika",            color: "#db2777", bg: "rgba(219,39,119,0.13)" },
  networking:        { label: "Networking",        color: "#0891b2", bg: "rgba(8,145,178,0.10)" },
  chapter_peer:      { label: "Chapter peer",      color: "#475569", bg: "rgba(100,116,139,0.13)" },
  personal:          { label: "Personal",          color: "#94a3b8", bg: "rgba(148,163,184,0.13)" },
  other:             { label: "Other",             color: "#94a3b8", bg: "rgba(148,163,184,0.10)" },
}

// Tags that count toward "networking" stats — used by both the stats
// endpoint and the dashboard. A meeting with any of these is networking.
export const NETWORKING_TAGS = ["networking", "provisors", "acg", "mixer", "troika"]
