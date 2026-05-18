export const dynamic = "force-dynamic"

const HR_KEY = process.env.HEYREACH_API_KEY || "UTXt46dJni1Wul3y3Ea5AVPLSOcYKRNKKsbUawBlUI4="
const HR_BASE = "https://api.heyreach.io/api/public"
const TEST_CONV = "2-N2E1MzMxNTQtMGJiMS00MTMxLWFkY2EtNDhjNDgwODQ3ZTQwXzEwMA=="
const TEST_ACCT = 185228

const PATHS = [
  // V2 patterns mirroring GetConversationsV2
  "/inbox/GetMessagesV2",
  "/inbox/GetConversationMessagesV2",
  "/inbox/GetConversationMessages",
  "/inbox/GetThreadV2",
  "/inbox/GetThread",
  "/inbox/GetConversationV2",
  "/inbox/GetChatV2",
  "/inbox/GetChat",
  // chat-* variants
  "/chat/GetMessages",
  "/chat/Get",
  "/chat/GetMessagesV2",
  // messages-* variants
  "/messages/Get",
  "/messages/GetByConversationId",
  "/message/GetByConversationId",
]

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)) }

export async function GET() {
  const results = []
  for (const path of PATHS) {
    try {
      const res = await fetch(`${HR_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": HR_KEY },
        body: JSON.stringify({ linkedInAccountId: TEST_ACCT, conversationId: TEST_CONV })
      })
      const txt = await res.text()
      results.push({ path, status: res.status, body_preview: txt.slice(0, 200) })
    } catch(e) {
      results.push({ path, error: e.message })
    }
    await sleep(250) // 4/sec to stay under 10/2sec
  }
  return Response.json({ results })
}



