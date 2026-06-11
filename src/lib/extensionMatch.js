// Shared helpers for the LinkedIn capture extension endpoints.

export function checkExtensionAuth(request) {
  const expected = process.env.EXTENSION_TOKEN
  if (!expected) return { ok: false, reason: "EXTENSION_TOKEN not configured" }
  const got = request.headers.get("x-extension-token")
  return { ok: !!got && got === expected, reason: "bad token" }
}

// Pull the /in/<slug> handle out of a LinkedIn URL (robust to www/https/trailing/query).
export function slugFromUrl(url) {
  if (!url) return null
  const m = String(url).match(/\/in\/([^/?#]+)/i)
  return m ? m[1].toLowerCase() : null
}

// Canonical profile URL from a slug, dropping tracking params.
export function canonicalUrl(url) {
  const slug = slugFromUrl(url)
  return slug ? `https://www.linkedin.com/in/${slug}` : (url || null)
}

// Strip trailing credential suffixes so "Neil Cohen, CPA" or
// "Bradley Kraines LUTCF,CLTC,RICP, FSCP" both match "Bradley Kraines".
const NAME_SUFFIX = new Set(["JR", "SR", "II", "III", "IV", "V"])
export function stripCreds(name) {
  // 1) known suffixes after a comma/pipe (kept for backward behavior)
  let n = String(name || "")
    .replace(/[,|]\s*(mba|cpa|cfa|cfp®?|jd|ph\.?d|m\.?d|esq|cma|ea|chfc|clu|aif|cepa|cexp|cdfa|ccim|pmp|cfe|cic)\b\.?/gi, "")
  // 2) general case: drop a trailing run of credential-like tokens (ALL-CAPS, 2-6 letters),
  //    comma- or space-separated, but never a generational suffix (Jr/Sr/II/III/IV/V).
  const toks = n.replace(/,/g, " ").split(/\s+/).filter(Boolean)
  while (toks.length > 1) {
    const t = toks[toks.length - 1].replace(/[.®™]/g, "")
    if (/^[A-Z]{2,6}$/.test(t) && !NAME_SUFFIX.has(t)) toks.pop()
    else break
  }
  return toks.join(" ").replace(/\s+/g, " ").trim()
}

