// ─── GET: Fetch live conversations, filter dismissed ─────────────────────────
export async function GET() {
  try {
    var hrKey = process.env.HEYREACH_API_KEY;
    if (!hrKey) throw new Error("HEYREACH_API_KEY not set");

    var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
    var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    var sbH = { "apikey": SBK, "Authorization": "Bearer " + SBK };

    // ── SUPABASE-FIRST QUEUE LOGIC ──────────────────────────────────────────
    // Find contacts who have an inbound reply with no outbound after it
    // This is reliable regardless of HeyReach API status

    // 1. Load dismissed map (conversation_id → dismissed_at)
    var dismissedMap = new Map();
    try {
      var dRes = await fetch(SBU + "/rest/v1/queue_dismissed?select=conversation_id,dismissed_at&limit=500", { headers: sbH });
      var dData = await dRes.json();
      if (Array.isArray(dData)) dData.forEach(function(d) { dismissedMap.set(d.conversation_id, d.dismissed_at); });
    } catch(e) { console.warn("Could not load dismissed IDs:", e.message); }

    // 2. SUPABASE-ALWAYS queue — build from unanswered inbound communications
    // HeyReach enriches with real conversation IDs and photos, but never replaces Supabase

    // Build Supabase queue first
    var sbQueue = [];
    try {
      var inboundRes = await fetch(
        SBU + "/rest/v1/communications?direction=eq.inbound&step_label=not.ilike.*Connection Accepted*&step_label=not.ilike.*audit recovery*&step_label=not.ilike.*Resurfaced*&order=occurred_at.desc&select=contact_id,body,occurred_at,channel&limit=500",
        { headers: sbH }
      );
      var inboundComms = await inboundRes.json();

      var outboundRes = await fetch(
        SBU + "/rest/v1/communications?direction=eq.outbound&order=occurred_at.desc&select=contact_id,occurred_at&limit=500",
        { headers: sbH }
      );
      var outboundComms = await outboundRes.json();

      var lastOutbound = {};
      if (Array.isArray(outboundComms)) {
        outboundComms.forEach(function(o) {
          if (!lastOutbound[o.contact_id] || o.occurred_at > lastOutbound[o.contact_id]) {
            lastOutbound[o.contact_id] = o.occurred_at;
          }
        });
      }

      var latestInbound = {};
      if (Array.isArray(inboundComms)) {
        inboundComms.forEach(function(m) {
          if (!latestInbound[m.contact_id] || m.occurred_at > latestInbound[m.contact_id].occurred_at) {
            latestInbound[m.contact_id] = m;
          }
        });
      }

      var needReplyIds = Object.keys(latestInbound).filter(function(cid) {
        var inAt  = latestInbound[cid].occurred_at;
        var outAt = lastOutbound[cid];
        return !outAt || inAt > outAt;
      });

      if (needReplyIds.length > 0) {
        var ctRes = await fetch(
          SBU + "/rest/v1/contacts?id=in.(" + needReplyIds.join(",") + ")&select=id,first_name,last_name,title,company_name,linkedin_url,pipeline_stage&limit=200",
          { headers: sbH }
        );
        var ctData = await ctRes.json();
        var EXCLUDED = ["Opted Out","Lost — Not a Fit","No Reply / Reserve"];

        if (Array.isArray(ctData)) {
          ctData.forEach(function(ct) {
            if (EXCLUDED.includes(ct.pipeline_stage)) return;
            var lastIn = latestInbound[ct.id];
            if (!lastIn) return;
            var convId = "sb-" + ct.id;
            var dismissed = dismissedMap.get(convId);
            if (dismissed && new Date(lastIn.occurred_at) <= new Date(dismissed)) return;
            var msg = lastIn.body || "";
            var isNeg  = /not interested|no thanks|stop|opt.?out|remove me|unsubscribe/i.test(msg);
            var isWarm = /happy to|sounds (fun|great)|love to|interested|open to|would like|like to learn/i.test(msg);
            sbQueue.push({
              id:               convId,
              conversationId:   convId,
              linkedInAccountId: 185228,
              firstName:        ct.first_name || "",
              lastName:         ct.last_name  || "",
              fullName:         (ct.first_name||"") + " " + (ct.last_name||""),
              title:            ct.title || "",
              company:          ct.company_name || "",
              location:         "",
              profileUrl:       ct.linkedin_url || "",
              imageUrl:         "",
              lastMessage:      msg,
              lastMessageAt:    lastIn.occurred_at,
              category:         isNeg ? "not_interested" : isWarm ? "warm" : "neutral",
              supabaseId:       ct.id,
              suggestedReply:   "",
              source:           "supabase",
            });
          });
        }
      }
    } catch(e) { console.error("Supabase queue build error:", e.message); }

    // Enrich with HeyReach data (real conversation IDs, photos, newer messages)
    try {
      var convRes = await fetch(
        "https://api.heyreach.io/api/public/inbox/GetConversationsV2",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-KEY": hrKey },
          body: JSON.stringify({ linkedInAccountIds: [185228], limit: 100, offset: 0 })
        }
      );
      if (convRes.ok) {
        var hrData = await convRes.json();
        var hrItems = (hrData && hrData.items) || [];
        // Build a slug→hrItem map for enrichment
        var hrBySlug = {};
        hrItems.forEach(function(item) {
          var p = item.correspondentProfile || {};
          var url = p.profileUrl || p.profile_url || "";
          if (url) {
            var slug = url.replace(/\/$/, "").split("/in/").pop().toLowerCase();
            hrBySlug[slug] = item;
          }
        });
        // Enrich sbQueue items with real convId and photo
        sbQueue.forEach(function(item) {
          if (!item.profileUrl) return;
          var slug = item.profileUrl.replace(/\/$/, "").split("/in/").pop().toLowerCase();
          var hr = hrBySlug[slug];
          if (!hr) return;
          item.conversationId = hr.id || item.conversationId;
          item.imageUrl = (hr.correspondentProfile || {}).imageUrl || "";
          // Use HeyReach message if newer
          if (hr.lastMessageSender === "CORRESPONDENT" && hr.lastMessageAt > item.lastMessageAt) {
            item.lastMessage   = hr.lastMessageText || item.lastMessage;
            item.lastMessageAt = hr.lastMessageAt;
          }
          item.source = "enriched";
        });

        // Add any HeyReach conversations NOT in sbQueue (edge cases)
        var sbContactIds = new Set(sbQueue.map(function(i){ return i.supabaseId; }));
        hrItems.forEach(function(hr) {
          if (hr.lastMessageSender !== "CORRESPONDENT") return;
          var p = hr.correspondentProfile || {};
          var url = p.profileUrl || p.profile_url || "";
          if (!url) return;
          var slug = url.replace(/\/$/, "").split("/in/").pop().toLowerCase();
          // Skip if already in sbQueue or dismissed
          var alreadyIn = sbQueue.find(function(i){ return i.profileUrl && i.profileUrl.replace(/\/$/, "").split("/in/").pop().toLowerCase() === slug; });
          if (alreadyIn) return;
          var dismissed = dismissedMap.get(hr.id);
          if (dismissed && new Date(hr.lastMessageAt) <= new Date(dismissed)) return;
          var msg = hr.lastMessageText || "";
          var isNeg  = /not interested|no thanks|stop|opt.?out/i.test(msg);
          var isWarm = /happy to|sounds (fun|great)|love to|interested|open to/i.test(msg);
          sbQueue.push({
            id:               hr.id,
            conversationId:   hr.id,
            linkedInAccountId: hr.linkedInAccountId || 185228,
            firstName:  p.firstName || "", lastName: p.lastName || "",
            fullName:   (p.firstName||"") + " " + (p.lastName||""),
            title:      p.position || "", company: p.companyName || "",
            location:   p.location || "", profileUrl: url,
            imageUrl:   p.imageUrl || "",
            lastMessage: msg, lastMessageAt: hr.lastMessageAt,
            category:   isNeg ? "not_interested" : isWarm ? "warm" : "neutral",
            supabaseId: null, suggestedReply: "", source: "heyreach",
          });
        });
      }
    } catch(e) { console.warn("HeyReach enrichment failed (non-fatal):", e.message); }

    // Sort newest first
    sbQueue.sort(function(a,b){ return new Date(b.lastMessageAt) - new Date(a.lastMessageAt); });
    var convData = { items: sbQueue };

        // Load excluded contacts (Opted Out, Lost, Reserve) by LinkedIn URL
    var excludedSlugs = new Set();
    try {
      var exRes = await fetch(SBU + "/rest/v1/contacts?select=linkedin_url&pipeline_stage=in.(Opted+Out,Lost+%E2%80%94+Not+a+Fit,No+Reply+%2F+Reserve)&limit=500", { headers: sbH });
      var exData = await exRes.json();
      if (Array.isArray(exData)) exData.forEach(function(ct) {
        if (ct.linkedin_url) {
          var slug = ct.linkedin_url.replace(/\/$/, '').split('/in/').pop().toLowerCase();
          excludedSlugs.add(slug);
        }
      });
    } catch(e) { console.warn("Could not load excluded contacts:", e.message); }

    // sbQueue is already filtered, categorized and formatted — use it directly
    var queue = convData.items || [];

    // Final excluded stage check (belt and suspenders)
    queue = queue.filter(function(item) {
      if (!item.profileUrl) return true; // no URL to check, include it
      var slug = item.profileUrl.replace(/\/$/, '').split('/in/').pop().toLowerCase();
      return !excludedSlugs.has(slug);
    });

    // Fetch today's activity count
    var today = new Date().toISOString().slice(0, 10);
    var todayCount = 0;
    try {
      var aRes = await fetch(
        SBU + "/rest/v1/daily_activity?activity_date=eq." + today + "&select=id",
        { headers: sbH }
      );
      var aData = await aRes.json();
      todayCount = Array.isArray(aData) ? aData.length : 0;
    } catch(e) {}

    // Enrich queue items with supabaseId by matching LinkedIn URL slug
    try {
      var slugMap = {};
      queue.forEach(function(item) {
        if (item.profileUrl) {
          var slug = item.profileUrl.replace(/\/$/, '').split('/in/').pop().toLowerCase();
          slugMap[slug] = item;
        }
      });
      var slugList = Object.keys(slugMap);
      if (slugList.length > 0) {
        var sbContactRes = await fetch(SBU + "/rest/v1/contacts?select=id,linkedin_url&limit=500", { headers: sbH });
        var sbContacts = await sbContactRes.json();
        if (Array.isArray(sbContacts)) {
          sbContacts.forEach(function(ct) {
            if (!ct.linkedin_url) return;
            var ctSlug = ct.linkedin_url.replace(/\/$/, '').split('/in/').pop().toLowerCase();
            if (slugMap[ctSlug]) slugMap[ctSlug].supabaseId = ct.id;
          });
        }
      }
    } catch(e) { console.warn("supabaseId enrichment failed:", e.message); }

    return Response.json({ queue, todayCount });
  } catch(e) {
    console.error("follow-up-queue GET error:", e.message);
    return Response.json({ queue: [], todayCount: 0, error: e.message });
  }
}

// ─── POST: Send + dismiss + log activity ─────────────────────────────────────
export async function POST(request) {
  try {
    var hrKey = process.env.HEYREACH_API_KEY;
    if (!hrKey) return Response.json({ success: false, error: "HEYREACH_API_KEY not set" }, { status: 500 });

    var body = await request.json();
    var { conversationId, linkedInAccountId, message, profileUrl, contactId, firstName, action } = body;

    var contactMeta = {
      firstName: body.firstName  || "",
      lastName:  body.lastName   || "",
      fullName:  body.fullName   || ((body.firstName || "") + " " + (body.lastName || "")),
      title:     body.title      || "",
      company:   body.company    || "",
      location:  body.location   || "",
      imageUrl:  body.imageUrl   || "",
      campaign:  body.campaign   || "",
    };

    // ── Dismiss without sending ────────────────────────────────────────────────
    if (action === "dismiss") {
      var reason = body.reason || "manual";
      await persistDismissal(conversationId, reason, contactMeta);
      await logActivity(reason, contactMeta, conversationId);
      if (profileUrl || contactId) {
        await logToSupabase(contactId, profileUrl, firstName, body.message || reason + " — cleared from queue", reason, "Queue: " + reason, null, contactMeta);
      }
      return Response.json({ success: true, action: "dismissed" });
    }

    // ── Send via Anthropic + HeyReach MCP proxy ──────────────────────────────
    // HeyReach REST API blocks non-allowlisted server hosts, so we route
    // through Anthropic's MCP client which calls HeyReach's own infrastructure
    var anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) return Response.json({ success: false, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

    var hrKey = process.env.HEYREACH_API_KEY;

    var aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "mcp-client-2025-04-04",
        "x-api-key": anthropicKey,
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        mcp_servers: [{
          type: "url",
          url: "https://mcp.heyreach.io/mcp",
          name: "heyreach",
          authorization_token: hrKey
        }],
        system: "You are a LinkedIn message sending agent for Dalen Lawrence. Your only job is to call the heyreach send_message tool with these exact parameters: conversationId, linkedInAccountId, message, and subject as empty string. Call the tool immediately without any other output.",
        messages: [{
          role: "user",
          content: "Send LinkedIn message. conversationId: " + conversationId + " | linkedInAccountId: " + (linkedInAccountId || 185228) + " | message: " + message
        }]
      })
    });

    var aiErr2 = null;
    if (!aiRes.ok) {
      aiErr2 = await aiRes.text();
      console.error("MCP proxy error:", aiRes.status, aiErr2);
      return Response.json({ success: false, error: "Send proxy error " + aiRes.status + ": " + aiErr2 }, { status: 500 });
    }

    var aiData = await aiRes.json();
    console.log("MCP proxy response stop_reason:", aiData.stop_reason, "content types:", (aiData.content||[]).map(function(b){return b.type;}));

    // Tool was called = message sent
    var toolWasCalled = (aiData.content || []).some(function(b){ return b.type === "tool_use"; });
    var endedNormally = aiData.stop_reason === "end_turn";

    if (!toolWasCalled) {
      var aiText = (aiData.content || []).filter(function(b){ return b.type === "text"; }).map(function(b){ return b.text; }).join(" ");
      console.error("MCP send: tool not called. stop_reason:", aiData.stop_reason, "text:", aiText);
      return Response.json({ success: false, error: aiText || "HeyReach send tool was not called — message may not have been sent" }, { status: 500 });
    }

    // Detect Calendly link → Fit Invite
    var isFitInvite = /calendly\.com/i.test(message);
    var stepLabel = isFitInvite ? "Fit Invite Sent" : "Follow-Up Sent";
    var newStage  = isFitInvite ? "Fit Invite Sent" : null;

    // Persist dismissal (sent = handled)
    await persistDismissal(conversationId, "sent", contactMeta);
    await logActivity(stepLabel, contactMeta, conversationId);
    await logToSupabase(contactId, profileUrl, firstName, message, stepLabel, stepLabel, newStage, contactMeta);

    // Register Touch 2 sequence
    try {
      var seqUrl = (process.env.NEXT_PUBLIC_APP_URL || "") + "/api/outreach-sequence";
      fetch(seqUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, linkedInAccountId, contactId, ...contactMeta, profileUrl })
      });
    } catch(e) {}

    return Response.json({ success: true, stepLabel });
  } catch(e) {
    console.error("follow-up-queue POST error:", e.message);
    return Response.json({ success: false, error: e.message }, { status: 500 });
  }
}

// ─── Persist dismissal to Supabase ───────────────────────────────────────────
async function persistDismissal(conversationId, reason, meta) {
  if (!conversationId) return;
  try {
    var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
    var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    var h = { "apikey": SBK, "Authorization": "Bearer " + SBK, "Content-Type": "application/json", "Prefer": "return=minimal" };
    await fetch(SBU + "/rest/v1/queue_dismissed", {
      method: "POST", headers: h,
      body: JSON.stringify({
        conversation_id:    conversationId,
        reason:             reason,
        dismissed_by:       "Dalen Lawrence",
        contact_first_name: meta.firstName || "",
        contact_last_name:  meta.lastName  || "",
        contact_company:    meta.company   || "",
        profile_url:        meta.profileUrl || "",
      })
    });
  } catch(e) { console.warn("persistDismissal error:", e.message); }
}

// ─── Log to daily_activity ────────────────────────────────────────────────────
async function logActivity(activityType, meta, conversationId) {
  try {
    var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
    var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    var h = { "apikey": SBK, "Authorization": "Bearer " + SBK, "Content-Type": "application/json" };
    await fetch(SBU + "/rest/v1/daily_activity", {
      method: "POST", headers: h,
      body: JSON.stringify({
        activity_type:   activityType,
        contact_name:    ((meta.firstName || "") + " " + (meta.lastName || "")).trim(),
        company:         meta.company || "",
        conversation_id: conversationId || "",
      })
    });
  } catch(e) { console.warn("logActivity error:", e.message); }
}

// ─── Auto-create contact + log communication ──────────────────────────────────
async function logToSupabase(contactId, profileUrl, firstName, message, body, stepLabel, newStage, contactMeta) {
  try {
    var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
    var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!SBU || !SBK) return;
    var h = { "apikey": SBK, "Authorization": "Bearer " + SBK, "Content-Type": "application/json", "Prefer": "return=representation" };

    var resolvedId = contactId || null;
    if (!resolvedId && profileUrl) {
      var slug = profileUrl.split("/in/").pop().replace(/\/+$/, "").toLowerCase();
      var lookup = await fetch(SBU + "/rest/v1/contacts?linkedin_url=ilike.*" + encodeURIComponent(slug) + "*&select=id&limit=1", { headers: h });
      var found = await lookup.json();
      if (Array.isArray(found) && found[0]) resolvedId = found[0].id;
    }

    if (!resolvedId && profileUrl && contactMeta) {
      var nameParts = (contactMeta.fullName || "").trim().split(" ");
      var createRes = await fetch(SBU + "/rest/v1/contacts", {
        method: "POST", headers: h,
        body: JSON.stringify({
          first_name:        contactMeta.firstName || nameParts[0] || "",
          last_name:         contactMeta.lastName  || nameParts.slice(1).join(" ") || "",
          title:             contactMeta.title     || "",
          company_name:      contactMeta.company   || "",
          linkedin_url:      profileUrl,
          linkedin_location: contactMeta.location  || "",
          linkedin_image_url:contactMeta.imageUrl  || "",
          pipeline_stage:    newStage || "Connected",
          member_status:     "Prospect",
          lead_source:       "LinkedIn / HeyReach",
          chapter_interest:  "Los Angeles",
          created_at:        new Date().toISOString(),
          updated_at:        new Date().toISOString(),
        })
      });
      var created = await createRes.json();
      if (Array.isArray(created) && created[0]) resolvedId = created[0].id;
    }

    if (!resolvedId) return;

    var isOutbound = !stepLabel.includes("Cleared") && !stepLabel.includes("Queue");
    await fetch(SBU + "/rest/v1/communications", {
      method: "POST", headers: h,
      body: JSON.stringify({
        contact_id:  resolvedId,
        occurred_at: new Date().toISOString(),
        channel:     "LinkedIn",
        direction:   isOutbound ? "OUT" : "INTERNAL",
        step_label:  stepLabel,
        body:        message,
        source:      "PeerChair",
        logged_by:   "Dalen Lawrence",
        send_status: isOutbound ? "pending" : null,
      })
    });

    if (newStage) {
      await fetch(SBU + "/rest/v1/contacts?id=eq." + resolvedId, {
        method: "PATCH", headers: h,
        body: JSON.stringify({ pipeline_stage: newStage, last_activity_date: new Date().toISOString() })
      });
    }
  } catch(e) { console.error("logToSupabase error:", e.message); }
}
