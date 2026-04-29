// GET /api/follow-up-queue/thread?conversationId=xxx&linkedInAccountId=185228
import { createClient } from '@supabase/supabase-js';

const HR_KEY  = process.env.HEYREACH_API_KEY || "UTXt46dJni1Wul3y3Ea5AVPLSOcYKRNKKsbUawBlUI4=";
const HR_BASE = "https://api.heyreach.io/api/public";

export async function GET(request) {
  var { searchParams } = new URL(request.url);
  var conversationId    = searchParams.get("conversationId");
  var linkedInAccountId = parseInt(searchParams.get("linkedInAccountId") || "185228");
  var contactId         = searchParams.get("contactId");

  if (!conversationId) return Response.json({ messages: [], error: "No conversationId" });

  var supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  var heyMessages = [];
  var source = "supabase";

  // Try HeyReach chatroom endpoint
  try {
    var res = await fetch(HR_BASE + "/inbox/GetChatroom", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": HR_KEY },
      body: JSON.stringify({ linkedInAccountId, conversationId }),
    });
    if (res.ok) {
      var data = await res.json();
      var raw = data.messages || data.items || data.data || [];
      if (Array.isArray(raw) && raw.length > 0) {
        heyMessages = raw.map(function(m) {
          return {
            id:        m.id || m.messageId || String(Math.random()),
            text:      m.text || m.message || m.content || m.body || "",
            sender:    m.sender || (m.isFromMe ? "ME" : "CORRESPONDENT"),
            sentAt:    m.sentAt || m.createdAt || m.timestamp || m.date || "",
            type:      m.type || m.messageType || "MESSAGE",
          };
        });
        source = "heyreach";
      }
    }
  } catch(e) { console.warn("HeyReach chatroom failed:", e.message); }

  // Always load Supabase communications for this contact
  var sbMessages = [];
  if (contactId) {
    var { data: comms } = await supabase
      .from("communications")
      .select("id, direction, channel, step_label, body, occurred_at, sequence_key")
      .eq("contact_id", contactId)
      .order("occurred_at", { ascending: true })
      .limit(100);
    sbMessages = comms || [];
  }

  // If HeyReach worked, annotate with sequence keys from Supabase
  if (heyMessages.length > 0) {
    sbMessages.forEach(function(sb) {
      if (!sb.sequence_key) return;
      var sbTime = new Date(sb.occurred_at).getTime();
      var match = heyMessages.find(function(m) {
        return m.sender === "ME" && Math.abs(new Date(m.sentAt).getTime() - sbTime) < 7200000;
      });
      if (match) { match.seqKey = sb.sequence_key; match.channel = sb.channel || match.type; }
    });
    return Response.json({ messages: heyMessages, source, count: heyMessages.length });
  }

  // Fall back to Supabase communications only
  if (sbMessages.length > 0) {
    var mapped = sbMessages.map(function(m) {
      return {
        id:      m.id,
        text:    m.body || m.step_label || "",
        sender:  m.direction === "OUT" ? "ME" : "CORRESPONDENT",
        sentAt:  m.occurred_at,
        type:    m.channel || "LinkedIn",
        seqKey:  m.sequence_key || m.step_label || null,
      };
    });
    return Response.json({ messages: mapped, source: "supabase", count: mapped.length });
  }

  return Response.json({ messages: [], source: "none", error: "No messages found" });
}
