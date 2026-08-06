export const dynamic = "force-dynamic"
export const runtime = "nodejs"
import { serverClient } from "@/lib/supabaseServer"

// Inbound webhook for LinkedHelper "company scrape" data.
// CAPTURE-FIRST: the full payload lands raw in linkedhelper_company_captures so
// we can see the real shape LinkedHelper sends BEFORE committing to a schema.
// The best-effort convenience columns are opportunistic guesses, NOT
// authoritative — always trust `raw`. Once we know the true shape we model it.
//
// Auth: a shared secret via ?k=<secret> in the URL (LinkedHelper's webhook
// config is URL-only) OR an x-webhook-secret header. Ships with a default so it
// works the moment it deploys; override with LINKEDHELPER_WEBHOOK_SECRET in Vercel.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-webhook-secret",
}
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }) }
const J = (data, status) => Response.json(data, { status: status || 200, headers: CORS })

const SECRET = () => process.env.LINKEDHELPER_WEBHOOK_SECRET || "cfocircle-lh-2026"

function pick(obj, keys) {
  if (!obj || typeof obj !== "object") return null
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim() !== "") return String(obj[k]).trim()
  }
  return null
}
// LinkedHelper often nests the scraped object under a wrapper key.
function companyNode(raw) {
  if (!raw || typeof raw !== "object") return {}
  for (const k of ["company", "organization", "result", "data", "payload"]) {
    if (raw[k] && typeof raw[k] === "object") return raw[k]
  }
  return raw
}

export async function POST(request) {
  const url = new URL(request.url)
  const provided = url.searchParams.get("k") || request.headers.get("x-webhook-secret") || ""
  if (provided !== SECRET()) return J({ error: "unauthorized" }, 401)

  const contentType = request.headers.get("content-type") || ""
  let raw
  try {
    if (contentType.includes("application/json")) raw = await request.json()
    else {
      const t = await request.text()
      try { raw = JSON.parse(t) } catch (e) { raw = { _raw_text: t } }
    }
  } catch (e) {
    raw = { _parse_error: String((e && e.message) || e) }
  }
  if (raw == null || typeof raw !== "object") raw = { _value: raw }

  const hdrs = {}
  for (const h of ["content-type", "user-agent", "x-lh-event", "x-webhook-event"]) {
    const v = request.headers.get(h); if (v) hdrs[h] = v
  }

  const c = companyNode(raw)
  const row = {
    source: "linkedhelper",
    event_type: pick(raw, ["event", "type", "eventType", "action"]),
    content_type: contentType || null,
    headers: hdrs,
    raw,
    company_name: pick(c, ["name", "companyName", "company_name", "company", "organizationName", "title"]),
    company_linkedin_url: pick(c, ["companyUrl", "company_url", "linkedinUrl", "linkedin_url", "profileUrl", "url", "publicUrl"]),
    website: pick(c, ["website", "websiteUrl", "site", "domain", "companyWebsite"]),
    industry: pick(c, ["industry", "industryName", "sector"]),
    company_size: pick(c, ["companySize", "company_size", "size", "employeeCount", "staffCount", "employees", "employeeCountRange"]),
    location: pick(c, ["location", "headquarters", "hq", "city", "addressLine", "geoRegion"]),
  }

  const sb = serverClient()
  const { data, error } = await sb.from("linkedhelper_company_captures").insert(row).select("id").single()
  if (error) return J({ error: error.message }, 500)

  return J({
    ok: true,
    id: data.id,
    captured_keys: Object.keys(raw),
    extracted: {
      company_name: row.company_name, company_linkedin_url: row.company_linkedin_url,
      website: row.website, industry: row.industry, company_size: row.company_size, location: row.location,
    },
  })
}

// GET — recent captures for the in-app viewer page.
export async function GET(request) {
  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500)
  const sb = serverClient()
  const { data, error } = await sb.from("linkedhelper_company_captures")
    .select("id, received_at, event_type, company_name, company_linkedin_url, website, industry, company_size, location, raw, processed")
    .order("received_at", { ascending: false }).limit(limit)
  if (error) return J({ error: error.message }, 500)
  return J({ count: (data || []).length, captures: data || [] })
}
