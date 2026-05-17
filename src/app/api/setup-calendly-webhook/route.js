export const dynamic = "force-dynamic"

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json" }
  })
}

export async function POST(request) {
  const auth = request.headers.get("authorization") || ""
  if (auth !== "Bearer cfocircle2026") return json({ error: "Unauthorized" }, 401)

  const token = process.env.CALENDLY_TOKEN
  if (!token) return json({ error: "CALENDLY_TOKEN not set in Vercel env" }, 500)

  // Get user URI first
  const meRes = await fetch("https://api.calendly.com/users/me", {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!meRes.ok) return json({ error: "Calendly auth failed: " + await meRes.text() }, 500)
  const { resource: user } = await meRes.json()
  const userUri = user.uri

  // Check existing webhooks
  const existingRes = await fetch(
    `https://api.calendly.com/webhook_subscriptions?user=${encodeURIComponent(userUri)}&scope=user&organization=${encodeURIComponent(user.current_organization)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const existing = await existingRes.json()
  const alreadyExists = existing.collection?.some(w => 
    w.callback_url === "https://www.peerchair.com/api/calendly-webhook"
  )
  if (alreadyExists) return json({ ok: true, message: "Webhook already exists" })

  // Create webhook
  const createRes = await fetch("https://api.calendly.com/webhook_subscriptions", {
    method: "POST",
    headers: { 
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      url: "https://www.peerchair.com/api/calendly-webhook",
      events: ["invitee.created", "invitee.canceled"],
      user: userUri,
      scope: "user",
      organization: user.current_organization
    })
  })

  const result = await createRes.json()
  if (!createRes.ok) return json({ error: "Webhook creation failed", details: result }, 500)

  return json({ ok: true, message: "Calendly webhook created", webhook_uri: result.resource?.uri })
}
