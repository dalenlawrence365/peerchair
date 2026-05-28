export const dynamic = "force-dynamic"

// Calendly webhook subscription manager.
//
// GET  → diagnose: list ALL current subscriptions with state + scope + callback,
//        so we can see whether a subscription exists AND is actually 'active'.
//        (The old POST check only matched callback_url and reported "already
//        exists" for a subscription that may have been 'disabled' or orphaned
//        by a token rotation — which is exactly the silent-failure we hit:
//        Calendly held a subscription record but delivered nothing.)
//
// POST → create the webhook if no ACTIVE one exists for our callback.
//        Body { force: true } → delete every subscription pointing at our
//        callback (any state) and create one fresh. Use this to recover from
//        a disabled/orphaned subscription.

const CALLBACK_URL = "https://www.peerchair.com/api/calendly-webhook"
const EVENTS = ["invitee.created", "invitee.canceled"]

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status, headers: { "Content-Type": "application/json" }
  })
}

async function calendlyUser(token) {
  const meRes = await fetch("https://api.calendly.com/users/me", {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!meRes.ok) throw new Error("Calendly auth failed: " + await meRes.text())
  const { resource } = await meRes.json()
  return resource
}

async function listSubscriptions(token, user) {
  const url = `https://api.calendly.com/webhook_subscriptions?user=${encodeURIComponent(user.uri)}&scope=user&organization=${encodeURIComponent(user.current_organization)}&count=100`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json()
  return data.collection || []
}

export async function GET(request) {
  const auth = request.headers.get("authorization") || ""
  if (auth !== "Bearer cfocircle2026") return json({ error: "Unauthorized" }, 401)
  const token = process.env.CALENDLY_TOKEN
  if (!token) return json({ error: "CALENDLY_TOKEN not set in Vercel env" }, 500)

  try {
    const user = await calendlyUser(token)
    const subs = await listSubscriptions(token, user)
    return json({
      ok: true,
      user_uri: user.uri,
      organization: user.current_organization,
      callback_we_expect: CALLBACK_URL,
      subscription_count: subs.length,
      subscriptions: subs.map(s => ({
        uri: s.uri,
        callback_url: s.callback_url,
        state: s.state,                 // 'active' | 'disabled'  ← the key field
        scope: s.scope,
        events: s.events,
        created_at: s.created_at
      })),
      diagnosis: subs.some(s => s.callback_url === CALLBACK_URL && s.state === "active")
        ? "An ACTIVE subscription for our callback exists — delivery should work."
        : subs.some(s => s.callback_url === CALLBACK_URL)
          ? "A subscription for our callback exists but is NOT active (disabled/orphaned). POST with {force:true} to recreate."
          : "No subscription for our callback. POST to create one."
    })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}

export async function POST(request) {
  const auth = request.headers.get("authorization") || ""
  if (auth !== "Bearer cfocircle2026") return json({ error: "Unauthorized" }, 401)
  const token = process.env.CALENDLY_TOKEN
  if (!token) return json({ error: "CALENDLY_TOKEN not set in Vercel env" }, 500)

  let body = {}
  try { body = await request.json() } catch (e) { /* no body = non-force */ }
  const force = !!body.force

  try {
    const user = await calendlyUser(token)
    const subs = await listSubscriptions(token, user)
    const ours = subs.filter(s => s.callback_url === CALLBACK_URL)
    const activeOurs = ours.filter(s => s.state === "active")

    // Non-force: if an ACTIVE one exists, we're done. (Stricter than before —
    // old code matched URL only and ignored state.)
    if (!force && activeOurs.length > 0) {
      return json({ ok: true, message: "Active webhook already exists", count: activeOurs.length })
    }

    // Force (or no active sub): delete every existing sub for our callback, recreate.
    const deleted = []
    if (force || ours.length > 0) {
      for (const s of ours) {
        const delRes = await fetch(s.uri, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
        deleted.push({ uri: s.uri, deleted: delRes.ok, prior_state: s.state })
      }
    }

    const createRes = await fetch("https://api.calendly.com/webhook_subscriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: CALLBACK_URL,
        events: EVENTS,
        user: user.uri,
        scope: "user",
        organization: user.current_organization
      })
    })
    const result = await createRes.json()
    if (!createRes.ok) return json({ error: "Webhook creation failed", details: result, deleted }, 500)

    return json({
      ok: true,
      message: force ? "Force-recreated Calendly webhook" : "Calendly webhook created",
      deleted_stale: deleted,
      new_webhook_uri: result.resource?.uri,
      new_state: result.resource?.state
    })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
