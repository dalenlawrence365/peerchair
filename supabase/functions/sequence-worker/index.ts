import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const SBU = Deno.env.get("SUPABASE_URL")!;
const SBK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const HEYREACH_KEY = Deno.env.get("HEYREACH_API_KEY")!;

async function sbFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${SBU}/rest/v1/${path}`, {
    ...opts,
    headers: {
      "apikey": SBK,
      "Authorization": `Bearer ${SBK}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...(opts.headers || {})
    }
  });
  return res.json();
}

function addBusinessDays(date: Date, days: number): Date {
  const d = new Date(date);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

async function generateTouch2(firstName: string, title: string, company: string): Promise<string|null> {
  const prompt = `You are Dalen Lawrence, Chapter Director of CFO Circle Los Angeles. You sent ${firstName} (${title} at ${company}) a LinkedIn message about CFO Circle 5 business days ago and haven't heard back. Write a single short paragraph resurfacing the conversation — acknowledge they're busy, remind them CFO Circle is a curated monthly peer group for CFOs of privately held LA companies, and invite them to grab 15 minutes if the timing is right: https://calendly.com/dalen-lawrence/cfo-circle-fit-chat. Sign as Dalen. Warm but not pushy. No em dashes. Under 60 words.`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": ANTHROPIC_KEY },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 150, messages: [{ role: "user", content: prompt }] })
  });
  if (!res.ok) return null;
  const d = await res.json();
  return d?.content?.[0]?.text || null;
}

async function sendHeyReach(conversationId: string, linkedInAccountId: number, message: string): Promise<boolean> {
  const res = await fetch("https://api.heyreach.io/api/public/v2/conversation/SendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": HEYREACH_KEY },
    body: JSON.stringify({ conversationId, linkedInAccountId, message, subject: "" })
  });
  return res.ok;
}

serve(async () => {
  const now = new Date().toISOString();
  let touch2Sent = 0;
  let timedOut = 0;

  // Touch 2: due and not yet sent
  const touch2Due = await sbFetch(
    `outreach_sequences?status=eq.active&touch2_scheduled_for=lte.${now}&touch2_sent_at=is.null&limit=20`
  );

  for (const seq of (touch2Due || [])) {
    const msg = await generateTouch2(
      seq.contact_first_name || "there",
      seq.contact_title || "CFO",
      seq.contact_company || "your company"
    );
    if (msg) {
      const sent = await sendHeyReach(seq.conversation_id, seq.linkedin_account_id, msg);
      if (sent) {
        await sbFetch(`outreach_sequences?id=eq.${seq.id}`, {
          method: "PATCH",
          body: JSON.stringify({ touch2_sent_at: new Date().toISOString(), current_touch: 2, updated_at: new Date().toISOString() })
        });
        if (seq.contact_id) {
          await sbFetch("communications", {
            method: "POST",
            body: JSON.stringify({ contact_id: seq.contact_id, occurred_at: new Date().toISOString(), channel: "LinkedIn", direction: "OUT", step_label: "Touch 2 — Auto Follow-Up", body: msg, source: "PeerChair Auto", logged_by: "System" })
          });
        }
        touch2Sent++;
      }
    }
  }

  // Timeout: 14 days, touch 2 sent, no reply
  const timedOutSeqs = await sbFetch(
    `outreach_sequences?status=eq.active&touch3_scheduled_for=lte.${now}&touch2_sent_at=not.is.null&last_reply_at=is.null&limit=50`
  );

  for (const seq of (timedOutSeqs || [])) {
    await sbFetch(`outreach_sequences?id=eq.${seq.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "timed_out", timed_out_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    });
    if (seq.contact_id) {
      await sbFetch(`contacts?id=eq.${seq.contact_id}`, {
        method: "PATCH",
        body: JSON.stringify({ pipeline_stage: "No Reply/Reserve", member_status: "Reserve" })
      });
    }
    timedOut++;
  }

  return new Response(JSON.stringify({ touch2Sent, timedOut, timestamp: now }), {
    headers: { "Content-Type": "application/json" }
  });
});
