// Shared logic for "latest research-note score per CFO" — used by both the
// dashboard's average-score tile and the full /reports/cfo-scores listing,
// so the two never drift out of sync on what counts as "scored."
//
// A person can have many research notes over time (history is never
// overwritten); only the most recent one counts here, matching how the
// Research Note tab treats "latest" as current.

export async function getCfoScoreRows(sb) {
  const { data: notes } = await sb.from("person_research_notes")
    .select("person_id, score, verdict, confidence, created_at")
    .not("score", "is", null)
    .order("created_at", { ascending: false })

  const latestByPerson = {}
  for (const n of (notes || [])) {
    if (!(n.person_id in latestByPerson)) latestByPerson[n.person_id] = n
  }
  const personIds = Object.keys(latestByPerson)
  if (!personIds.length) return []

  const { data: people } = await sb.from("people")
    .select("id, full_name, company, roles")
    .in("id", personIds)

  return (people || [])
    .filter(function (p) { return (p.roles || []).indexOf("cfo") >= 0 })
    .map(function (p) {
      const n = latestByPerson[p.id]
      return {
        person_id: p.id,
        full_name: p.full_name,
        company: p.company,
        score: n.score,
        verdict: n.verdict,
        confidence: n.confidence,
        as_of: n.created_at,
      }
    })
    .sort(function (a, b) { return (b.score || 0) - (a.score || 0) })
}

export function avgScore(rows) {
  if (!rows.length) return null
  return Math.round(rows.reduce(function (s, r) { return s + r.score }, 0) / rows.length)
}

// Red/yellow/green classification shared by the profile-page score pill and
// the /reports/cfo-scores table. Verdict text is the primary signal (it's
// the normalized call from the research itself); score is only a fallback
// for notes whose verdict wording doesn't match a known bucket.
export function scoreColor(score, verdict) {
  const v = (verdict || "").toLowerCase()
  if (v.indexOf("pass") >= 0) return { bg: "#fee2e2", fg: "#b91c1c", border: "#fca5a5" }
  if (v.indexOf("maybe") >= 0) return { bg: "#fef3c7", fg: "#92400e", border: "#fde68a" }
  if (v.indexOf("invite") >= 0 || v.indexOf("pursue") >= 0) return { bg: "#dcfce7", fg: "#15803d", border: "#86efac" }
  if (score == null) return { bg: "#f1f5f9", fg: "#64748b", border: "#e2e8f0" }
  if (score >= 70) return { bg: "#dcfce7", fg: "#15803d", border: "#86efac" }
  if (score >= 40) return { bg: "#fef3c7", fg: "#92400e", border: "#fde68a" }
  return { bg: "#fee2e2", fg: "#b91c1c", border: "#fca5a5" }
}
