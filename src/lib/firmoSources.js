// Where a firmographic came from.
//
// "Revenue: 2.5-5M" is worth very different amounts depending on whether the CFO
// said it on a fit call or Sales Navigator guessed it. Without provenance, a
// number you inferred at 11pm looks identical to one you were told, and six
// months later you cannot tell them apart.
//
// Stored per FIELD, not per record — revenue can come from Sales Navigator while
// ownership came from the fit call. Lives under the reserved `_sources` key
// inside the existing firmographics jsonb, so no schema change and no second
// place to keep in sync.
//
//   firmographics = {
//     revenue: "2.5-5M",
//     employees: "43",
//     _sources: { revenue: { source: "sales_navigator", at: "..." }, ... }
//   }
export const SOURCE_KEY = "_sources"

export const SOURCES = [
  { key: "self_reported",    label: "Self-reported",     hint: "They told you — fit call or conversation", weight: 3 },
  { key: "sales_navigator",  label: "Sales Navigator",   hint: "LinkedIn Sales Navigator", weight: 2 },
  { key: "linkedin",         label: "LinkedIn (public)", hint: "Their public profile or company page", weight: 2 },
  { key: "company_website",  label: "Company website",   hint: "Published on their own site", weight: 2 },
  { key: "provisors_roster", label: "ProVisors roster",  hint: "Imported from a photo list", weight: 2 },
  { key: "third_party",      label: "Other research",    hint: "News, filings, another database", weight: 2 },
  { key: "estimate",         label: "My estimate",       hint: "An informed guess — treat as soft", weight: 1 },
]

const BY_KEY = SOURCES.reduce(function (m, s) { m[s.key] = s; return m }, {})

export function sourceLabel(key) {
  return BY_KEY[key] ? BY_KEY[key].label : (key || "")
}
export function isValidSource(key) {
  return !!BY_KEY[key]
}
export function sourceHint(key) {
  return BY_KEY[key] ? BY_KEY[key].hint : ""
}
// 3 = they told us, 1 = we guessed. Used to shade the chip.
export function sourceWeight(key) {
  return BY_KEY[key] ? BY_KEY[key].weight : 0
}

// Fields that carry provenance. `_sources` is metadata, never a field.
export const SOURCED_FIELDS = [
  "industry", "revenue", "employees", "finance_team",
  "ownership", "reports_to", "website",
]

// Stamp provenance for the fields whose VALUE actually changed in this edit.
// Untouched fields keep the source they already had — re-saving a form must not
// relabel a number you were told as something you looked up.
export function stampSources(prevFirmo, nextFirmo, sourceKey, opts) {
  const o = opts || {}
  const prev = prevFirmo || {}
  const next = Object.assign({}, nextFirmo || {})
  const carried = Object.assign({}, prev[SOURCE_KEY] || {})

  if (!isValidSource(sourceKey)) {
    // No source given: carry existing provenance forward untouched.
    if (Object.keys(carried).length) next[SOURCE_KEY] = carried
    return next
  }

  const at = o.at || new Date().toISOString()
  for (const f of SOURCED_FIELDS) {
    const before = prev[f] == null ? "" : String(prev[f]).trim()
    const after = next[f] == null ? "" : String(next[f]).trim()
    if (!after) { delete carried[f]; continue }   // cleared value loses its source
    if (after !== before || !carried[f]) {
      carried[f] = { source: sourceKey, at: at }
    }
  }
  if (Object.keys(carried).length) next[SOURCE_KEY] = carried
  else delete next[SOURCE_KEY]
  return next
}
