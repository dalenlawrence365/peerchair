import { createClient } from "@supabase/supabase-js"

// THE bug this file kept losing to:
// supabase-js reads are GET requests, and Next.js caches GET fetches in its Data
// Cache even on a force-dynamic route. lib/supabaseServer.js already documents
// this and defeats it with a no-store fetch — but this file called createClient()
// raw, so the token row was a frozen snapshot from 2026-07-09. Every caller then
// refreshed a corpse, and the "fix" of trusting the JWT exp claim only made the
// app read the stale row's expiry more accurately.
// Reads AND the Azure refresh POST must both bypass the cache. No exceptions.
const noStoreFetch = (url, opts = {}) => fetch(url, { ...opts, cache: "no-store" })

function tokenClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: noStoreFetch },
    }
  )
}

// A Graph access token states its own expiry in its `exp` claim. Trust THAT, not
// the expires_at column — the column has been observed claiming "valid for 45 more
// minutes" while holding a token that actually died six days earlier, which made
// getAccessToken hand out a corpse and every non-retrying caller 401.
// The token is self-describing; the column is hearsay.
function tokenExpiryMs(jwt) {
  try {
    const part = String(jwt || "").split(".")[1]
    if (!part) return 0
    const pad = part.replace(/-/g, "+").replace(/_/g, "/")
    const json = JSON.parse(Buffer.from(pad, "base64").toString("utf8"))
    return json.exp ? json.exp * 1000 : 0
  } catch (e) { return 0 }
}

export async function getAccessToken(opts = {}) {
  const supabase = tokenClient()
  const { data: row } = await supabase.from("microsoft_tokens").select("*").eq("id","dalen").single()
  if (!row) throw new Error("No Microsoft token. Visit /api/auth/microsoft to authorize.")
  // Prefer the token's own exp claim; fall back to the column only if it won't parse.
  const realExpiry = tokenExpiryMs(row.access_token) || new Date(row.expires_at).getTime()
  if (!opts.force && realExpiry > Date.now() + 5 * 60000) return row.access_token

  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    { method:"POST", cache:"no-store", headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body: new URLSearchParams({
        client_id:process.env.AZURE_CLIENT_ID, client_secret:process.env.AZURE_CLIENT_SECRET,
        refresh_token:row.refresh_token, grant_type:"refresh_token",
        scope:"https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Contacts.ReadWrite https://graph.microsoft.com/Calendars.Read offline_access"
      })
    }
  )
  if (!res.ok) throw new Error("Token refresh failed: " + await res.text())
  const tokens = await res.json()
  // Guard the poisoning case directly: writing expires_at without a fresh
  // access_token is what left a dead token looking alive for six days.
  if (!tokens.access_token) {
    throw new Error("Refresh returned no access_token (keys: " + Object.keys(tokens).join(",") + ")")
  }
  const exp = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString()
  await supabase.from("microsoft_tokens").upsert({id:"dalen",access_token:tokens.access_token,refresh_token:tokens.refresh_token||row.refresh_token,expires_at:exp,updated_at:new Date().toISOString()},{onConflict:"id"})
  return tokens.access_token
}


// Every Graph call must survive a stale cached token. getAccessToken() trusts the
// stored expires_at, which can say "valid" while Graph considers the token expired
// (401 InvalidAuthenticationToken). That silently killed the sync crons. One forced
// refresh + retry fixes it, and self-heals the stored token for the next caller.
export async function graphFetch(url, init = {}) {
  let token = await getAccessToken()
  const call = (t) => fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: "Bearer " + t },
  })
  let res = await call(token)
  if (res.status === 401) {
    token = await getAccessToken({ force: true })
    res = await call(token)
  }
  return res
}
