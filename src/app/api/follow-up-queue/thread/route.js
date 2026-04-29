// GET /api/follow-up-queue/thread?conversationId=xxx&linkedInAccountId=185228
// Fetches full message thread from HeyReach for a given conversation

const HR_KEY = process.env.HEYREACH_API_KEY || "UTXt46dJni1Wul3y3Ea5AVPLSOcYKRNKKsbUawBlUI4=";
const HR_BASE = "https://api.heyreach.io/api/public";

export async function GET(request) {
  var { searchParams } = new URL(request.url);
  var conversationId    = searchParams.get("conversationId");
  var linkedInAccountId = parseInt(searchParams.get("linkedInAccountId") || "185228");

  if (!conversationId) {
    return Response.json({ messages: [], error: "No conversationId" });
  }

  try {
    var res = await fetch(HR_BASE + "/linkedin/GetConversation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": HR_KEY,
      },
      body: JSON.stringify({
        linkedInAccountId: linkedInAccountId,
        conversationId: conversationId,
      }),
    });

    if (!res.ok) {
      console.warn("HeyReach GetConversation failed:", res.status);
      return Response.json({ messages: [], error: "HeyReach API error: " + res.status });
    }

    var data = await res.json();

    // HeyReach returns messages in various shapes — normalize them
    var raw = data.messages || data.items || data.data || data || [];
    if (!Array.isArray(raw)) raw = [];

    var messages = raw.map(function(m) {
      return {
        id:         m.id || m.messageId || Math.random().toString(36),
        text:       m.text || m.message || m.content || m.body || "",
        sender:     m.sender || m.senderType || (m.isFromMe ? "ME" : "CORRESPONDENT"),
        sentAt:     m.sentAt || m.createdAt || m.timestamp || m.date || "",
        type:       m.type || m.messageType || "MESSAGE", // MESSAGE or INMAIL
        seen:       m.seen || false,
      };
    });

    // Sort chronological
    messages.sort(function(a, b) {
      return new Date(a.sentAt) - new Date(b.sentAt);
    });

    return Response.json({ messages, conversationId, count: messages.length });
  } catch (err) {
    console.error("Thread fetch error:", err.message);
    return Response.json({ messages: [], error: err.message });
  }
}
