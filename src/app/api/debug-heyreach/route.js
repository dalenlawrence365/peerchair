export const dynamic = "force-dynamic"

export async function GET() {
  const HR_KEY = process.env.HEYREACH_API_KEY || "UTXt46dJni1Wul3y3Ea5AVPLSOcYKRNKKsbUawBlUI4="
  const HR_BASE = "https://api.heyreach.io/api/public"
  const results = {}

  try {
    const r1 = await fetch(`${HR_BASE}/inbox/GetConversationsV2`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-API-KEY": HR_KEY },
      body: JSON.stringify({ linkedInAccountIds: [185228], limit: 5, offset: 0 })
    })
    results.with_filter = { status: r1.status, body: await r1.json() }
  } catch(e) { results.with_filter = { error: e.message } }

  try {
    const r2 = await fetch(`${HR_BASE}/inbox/GetConversationsV2`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-API-KEY": HR_KEY },
      body: JSON.stringify({ limit: 5, offset: 0 })
    })
    results.no_filter = { status: r2.status, body: await r2.json() }
  } catch(e) { results.no_filter = { error: e.message } }

  try {
    const r3 = await fetch(`${HR_BASE}/v2/linkedin-account/GetAll`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-API-KEY": HR_KEY },
      body: JSON.stringify({ limit: 10, offset: 0 })
    })
    results.accounts = { status: r3.status, body: await r3.json() }
  } catch(e) { results.accounts = { error: e.message } }

  return Response.json(results, { headers: { "Content-Type": "application/json" }})
}
