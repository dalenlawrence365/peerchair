"use client"

// ── Canonical person badges ──────────────────────────────────────────────
// ONE source of truth for the pill cluster shown next to a person's name on
// every list (CFO/Sponsor pipeline, ProVisors, LinkedIn connections).
// Order, labels, and colors are identical everywhere:
//     [role pills…]  [1st]  [in↗]
// Colors match the LinkedIn connections page (the approved look & feel).
// The in↗ anchor stops propagation so it works inside clickable rows, and it
// must always be rendered as a SIBLING of any profile <Link>, never nested.

const ROLE_PILLS = [
  { label: "ProVisor",   color: "#7c3aed", test: function(p){ return !!p.provisors_member } },
  { label: "Sponsor",    color: "#0d9488", test: function(p){ return (p.roles || []).includes("sponsor_contact") } },
  { label: "CFO",        color: "#f97316", test: function(p){ return (p.roles || []).includes("cfo") } },
  { label: "Referral",   color: "#3b82f6", test: function(p){ return (p.roles || []).includes("referral_partner") } },
  { label: "CFO Circle", color: "#ea580c", test: function(p){ return !!p.cfo_circle_member } },
]

export function rolePillsFor(p) {
  return ROLE_PILLS
    .filter(function(d){ return d.test(p) })
    .map(function(d){ return { label: d.label, color: d.color } })
}

function Badge({ bg, fg, children }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: bg, color: fg, whiteSpace: "nowrap", lineHeight: 1.4 }}>
      {children}
    </span>
  )
}

export default function PersonBadges({ person, showFirst = true, showLinkedIn = true }) {
  if (!person) return null
  const pills = rolePillsFor(person)
  const isFirst = person.linkedin_connected === true
  const url = person.linkedin_url
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {pills.map(function(pl){ return <Badge key={pl.label} bg={pl.color} fg="white">{pl.label}</Badge> })}
      {showFirst && isFirst && <Badge bg="#0a66c222" fg="#0a66c2">1st</Badge>}
      {person.silent === true && <Badge bg="#f59e0b22" fg="#b45309">Silent</Badge>}
      {showLinkedIn && url && (
        <a href={url} target="_blank" rel="noopener noreferrer"
          onClick={function(e){ e.stopPropagation() }}
          style={{ fontSize: 11, color: "#0a66c2", textDecoration: "none", fontWeight: 600 }}>in↗</a>
      )}
    </span>
  )
}
