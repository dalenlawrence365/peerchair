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

// Strip trailing credential suffixes so "Neil Cohen, CPA" matches "Neil Cohen".
export function stripCreds(name) {
  return String(name || "")
    .replace(/[,|]\s*(mba|cpa|cfa|cfp®?|jd|ph\.?d|m\.?d|esq|cma|ea|chfc|clu|aif|cepa|cexp|cdfa|ccim|pmp|cfe|cic)\b\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}
