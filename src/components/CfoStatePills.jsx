import { T } from "@/lib/pipelineTheme"

// Cumulative CFO standing ladder.
// Pool is the floor — always lit for anyone carrying the cfo role.
// Audience lights from the first-degree LinkedIn connection flag (derived, never a stored stage).
// Prospect / Qualified / Member light from the stored cfo_state, cumulatively.
// Only the tiers a person has reached render; each in its own theme color.

const ORDINAL = { pool: 0, audience: 0, prospect: 1, qualified: 2, member: 3 }

const TIERS = [
  { key: "pool",      label: "Pool",      bg: T.poolBg,      fg: T.poolText },
  { key: "audience",  label: "Audience",  bg: T.audienceBg,  fg: T.audienceText },
  { key: "prospect",  label: "Prospect",  bg: T.prospectBg,  fg: T.prospectText },
  { key: "qualified", label: "Qualified", bg: T.qualifiedBg, fg: T.qualifiedText },
  { key: "member",    label: "Member",    bg: T.memberBg,    fg: T.memberText },
]

export default function CfoStatePills({ cfoState, connected, size = "sm" }) {
  const ord = ORDINAL[cfoState] ?? 0
  const reached = {
    pool: true,
    audience: connected === true || cfoState === "audience",
    prospect: ord >= 1,
    qualified: ord >= 2,
    member: ord >= 3,
  }
  const pad = size === "sm" ? "1px 7px" : "3px 9px"
  const fs = size === "sm" ? 9.5 : 11
  const lit = TIERS.filter(function (t) { return reached[t.key] })
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", alignItems: "center", verticalAlign: "middle" }}>
      {lit.map(function (t) {
        return (
          <span key={t.key} style={{
            display: "inline-block", padding: pad, borderRadius: 999,
            fontSize: fs, fontWeight: 600, letterSpacing: 0.3,
            background: t.bg, color: t.fg, whiteSpace: "nowrap",
          }}>{t.label}</span>
        )
      })}
    </span>
  )
}
