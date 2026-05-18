export const dynamic = "force-dynamic"

const HR_KEY = process.env.HEYREACH_API_KEY || "UTXt46dJni1Wul3y3Ea5AVPLSOcYKRNKKsbUawBlUI4="

const CANDIDATES = [
  "https://api.heyreach.io/api/public/v2/conversation/GetAllConversations",
  "https://api.heyreach.io/api/public/inbox/GetConversationsV2",
  "https://api.heyreach.io/api/public/conversation/GetConversationsV2",
  "https://api.heyreach.io/api/public/inbox/GetAllConversations",
  "https://api.heyreach.io/api/public/inbox/GetAllConversationsV2",
  "https://api.heyreach.io/api/public/conversation/GetAllConversationsV2",
  "https://api.heyreach.io/api/public/conversation/GetAll",
  "https://api.heyreach.io/api/public/conversation/GetAllV2",
  "https://api.heyreach.io/api/public/inbox/GetConversations",
  "https://api.heyreach.io/api/public/inbox/GetAll",
]

export async function GET() {
  const results = []
  for (const url of CANDIDATES) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": HR_KEY },
        body: JSON.stringify({ linkedInAccountIds: [185228], limit: 1, offset: 0 })
      })
      const body = await res.text()
      results.push({
        url,
        status: res.status,
        body_preview: body.slice(0, 200)
      })
    } catch(e) {
      results.push({ url, error: e.message })
    }
  }
  return Response.json({ tested: results.length, results })
}
