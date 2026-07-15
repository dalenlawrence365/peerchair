export const dynamic = "force-dynamic"
export const maxDuration = 60

import { getAccessToken } from "@/lib/microsoft-auth"
import { createClient } from "@supabase/supabase-js"

// Graph probe. Diagnostic only.
//
// Why this exists: sync-sent reads /mailFolders/sentitems fine while sync-email
// and sync-calendar 401 with "the token is expired" — same token, same helper,
// seconds apart. That is impossible on its face, so one of the assumptions is
// wrong. This asks Graph directly, from inside the app, with the real stored
// token, and reports exactly which calls pass and which fail.
//
// NEVER returns the token or the refresh token — only claims, status codes and
// Graph's own error codes. Gated by a probe key so it isn't an open endpoint.

const PROBE_KEY = "pk_7f3a91c4d2e6"

function claimsOf(jwt) {
  try {
    const part = String(jwt || "").split(".")[1]
    if (!part) return { error: "not a jwt" }
    const pad = part.replace(/-/g, "+").replace(/_/g, "/")
    const j = JSON.parse(Buffer.from(pad, "base64").toString("utf8"))
    return {
      aud: j.aud, appid: j.appid, upn: j.upn, scp: j.scp, tid: j.tid,
      iat: j.iat ? new Date(j.iat * 1000).toISOString() : null,
      exp: j.exp ? new Date(j.exp * 1000).toISOString() : null,
      seconds_of_life_left: j.exp ? Math.round(j.exp - Date.now() / 1000) : null,
    }
  } catch (e) { return { error: e.message } }
}

async function probe(label, url, token, extraHeaders) {
  const started = Date.now()
  try {
    const res = await fetch(url, {
      headers: Object.assign({ Authorization: "Bearer " + token }, extraHeaders || {}),
    })
    const text = await res.text()
    let graphCode = null, graphMessage = null
    try {
      const j = JSON.parse(text)
      graphCode = j.error?.code || null
      graphMessage = j.error?.message || null
    } catch (e) { /* not json */ }
    return {
      label, url: url.slice(0, 120), status: res.status, ok: res.ok,
      ms: Date.now() - started,
      graph_code: graphCode,
      graph_message: graphMessage,
      // Graph echoes which token it saw the request as — invaluable here.
      www_authenticate: res.headers.get("www-authenticate"),
      request_id: res.headers.get("request-id"),
      body_head: res.ok ? null : text.slice(0, 300),
    }
  } catch (e) {
    return { label, url: url.slice(0, 120), status: "throw", error: e.message, ms: Date.now() - started }
  }
}

export async function GET(request) {
  const url = new URL(request.url)
  if (url.searchParams.get("k") !== PROBE_KEY) {
    return Response.json({ error: "not found" }, { status: 404 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
  const { data: row } = await sb.from("microsoft_tokens").select("*").eq("id", "dalen").single()

  const stored = {
    expires_at_column: row?.expires_at || null,
    updated_at_column: row?.updated_at || null,
    claims: claimsOf(row?.access_token),
  }

  // The token the app would actually hand a caller right now.
  let handed = null, handedErr = null
  try { handed = await getAccessToken() } catch (e) { handedErr = e.message }

  const sameAsStored = handed && row ? handed === row.access_token : null
  const handedClaims = handed ? claimsOf(handed) : null

  const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString()
  const results = []
  if (handed) {
    // Ordered narrowest-to-widest so the exact breaking point is visible.
    results.push(await probe("me", "https://graph.microsoft.com/v1.0/me", handed))
    results.push(await probe("sentitems_plain",
      "https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?$top=1&$select=id", handed))
    results.push(await probe("inbox_plain",
      "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=1&$select=id", handed))
    results.push(await probe("inbox_exact_sync_email_url",
      `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=receivedDateTime ge ${since}&$select=id,subject,receivedDateTime,from,bodyPreview&$orderby=receivedDateTime desc&$top=100`, handed))
    results.push(await probe("inbox_hasattachments_provisors_url",
      `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=receivedDateTime ge ${since} and hasAttachments eq true&$select=id,subject,internetMessageId&$top=100`, handed))
    results.push(await probe("calendar_events",
      "https://graph.microsoft.com/v1.0/me/events?$top=1&$select=id", handed,
      { Prefer: 'outlook.timezone="UTC"' }))
  }

  // If anything 401'd, force a brand-new token and immediately retry the inbox.
  let forced = null
  if (results.some(function (r) { return r.status === 401 })) {
    try {
      const fresh = await getAccessToken({ force: true })
      forced = {
        token_changed: fresh !== handed,
        claims: claimsOf(fresh),
        retry_inbox: await probe("inbox_after_force",
          "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=1&$select=id", fresh),
        retry_sentitems: await probe("sentitems_after_force",
          "https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?$top=1&$select=id", fresh),
      }
    } catch (e) { forced = { error: e.message } }
  }

  return Response.json({
    now: new Date().toISOString(),
    stored,
    handed: { error: handedErr, identical_to_stored_row: sameAsStored, claims: handedClaims },
    results,
    forced,
  }, { status: 200 })
}
