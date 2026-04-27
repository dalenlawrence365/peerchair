// POST: Register a sent Touch 1, schedule Touch 2
// GET: Run the sequence worker (check for due touches)

function addBusinessDays(date, days) {
  var d = new Date(date);
  var added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    var dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

async function sbFetch(path, opts) {
  var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
  var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  var res = await fetch(SBU + "/rest/v1/" + path, Object.assign({
    headers: {"apikey":SBK,"Authorization":"Bearer "+SBK,"Content-Type":"application/json","Prefer":"return=representation"}
  }, opts||{}));
  return res.json();
}

async function sendHeyReach(conversationId, linkedInAccountId, message) {
  var key = process.env.HEYREACH_API_KEY;
  var res = await fetch("https://api.heyreach.io/api/public/v2/conversation/SendMessage", {
    method: "POST",
    headers: {"Content-Type":"application/json","X-API-KEY": key},
    body: JSON.stringify({conversationId, linkedInAccountId, message, subject:""})
  });
  return res.ok;
}

async function generateTouch2(firstName, title, company) {
  var key = process.env.ANTHROPIC_API_KEY;
  var prompt = "You are Dalen Lawrence, Chapter Director of CFO Circle Los Angeles. You sent " + firstName + " (" + title + " at " + company + ") a LinkedIn message about CFO Circle 5 business days ago and haven't heard back. Write a single short paragraph resurfacing the conversation — acknowledge they're busy, remind them CFO Circle is a curated monthly peer group for CFOs of privately held LA companies, and invite them to grab 15 minutes if the timing is right: https://calendly.com/dalen-lawrence/cfo-circle-fit-chat. Sign as Dalen. Warm but not pushy. No em dashes. Under 60 words.";
  var res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{"Content-Type":"application/json","anthropic-version":"2023-06-01","x-api-key":key},
    body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:150,messages:[{role:"user",content:prompt}]})
  });
  if (!res.ok) return null;
  var d = await res.json();
  return (d.content && d.content[0] && d.content[0].text) || null;
}

export async function POST(request) {
  try {
    var body = await request.json();
    var {conversationId, linkedInAccountId, contactId, firstName, lastName, title, company, profileUrl} = body;

    var touch2Date = addBusinessDays(new Date(), 5);
    var touch3Date = new Date(Date.now() + 14 * 24 * 3600 * 1000);

    // Check if sequence already exists for this conversation
    var existing = await sbFetch("outreach_sequences?conversation_id=eq." + encodeURIComponent(conversationId) + "&limit=1");
    if (Array.isArray(existing) && existing.length > 0) {
      return Response.json({success:true, existing:true, id:existing[0].id});
    }

    var record = await sbFetch("outreach_sequences", {
      method:"POST",
      body:JSON.stringify({
        contact_id: contactId || null,
        conversation_id: conversationId,
        linkedin_account_id: linkedInAccountId || 185228,
        current_touch: 1,
        touch1_sent_at: new Date().toISOString(),
        touch2_scheduled_for: touch2Date.toISOString(),
        touch3_scheduled_for: touch3Date.toISOString(),
        status: "active",
        contact_first_name: firstName,
        contact_last_name: lastName,
        contact_title: title,
        contact_company: company,
        contact_profile_url: profileUrl,
      })
    });

    return Response.json({success:true, id: Array.isArray(record) ? record[0]?.id : record?.id});
  } catch(e) {
    console.error("outreach-sequence POST error:", e);
    return Response.json({success:false, error:e.message}, {status:500});
  }
}

export async function GET() {
  try {
    var now = new Date().toISOString();

    // 1. Find sequences where Touch 2 is due and not yet sent
    var touch2Due = await sbFetch(
      "outreach_sequences?status=eq.active&touch2_scheduled_for=lte." + now + "&touch2_sent_at=is.null&limit=20"
    );

    var touch2Results = [];
    for (var i = 0; i < (touch2Due||[]).length; i++) {
      var seq = touch2Due[i];
      try {
        var msg = await generateTouch2(
          seq.contact_first_name || "there",
          seq.contact_title || "CFO",
          seq.contact_company || "your company"
        );
        if (msg) {
          var sent = await sendHeyReach(seq.conversation_id, seq.linkedin_account_id, msg);
          if (sent) {
            await sbFetch("outreach_sequences?id=eq." + seq.id, {
              method:"PATCH",
              body:JSON.stringify({touch2_sent_at:new Date().toISOString(), current_touch:2, updated_at:new Date().toISOString()})
            });
            // Log to communications if we have a contact_id
            if (seq.contact_id) {
              await sbFetch("communications", {
                method:"POST",
                body:JSON.stringify({contact_id:seq.contact_id, occurred_at:new Date().toISOString(), channel:"LinkedIn", direction:"OUT", step_label:"Touch 2 — Auto Follow-Up", body:msg, source:"PeerChair Auto", logged_by:"System"})
              });
            }
            touch2Results.push({id:seq.id, name:seq.contact_first_name, sent:true});
          }
        }
      } catch(e) {
        console.error("Touch 2 error for", seq.id, e);
        touch2Results.push({id:seq.id, name:seq.contact_first_name, sent:false, error:e.message});
      }
    }

    // 2. Find sequences timed out (14 days, touch 2 sent, no reply)
    var timedOut = await sbFetch(
      "outreach_sequences?status=eq.active&touch3_scheduled_for=lte." + now + "&touch2_sent_at=not.is.null&last_reply_at=is.null&limit=50"
    );

    var timedOutResults = [];
    for (var j = 0; j < (timedOut||[]).length; j++) {
      var ts = timedOut[j];
      await sbFetch("outreach_sequences?id=eq." + ts.id, {
        method:"PATCH",
        body:JSON.stringify({status:"timed_out", timed_out_at:new Date().toISOString(), updated_at:new Date().toISOString()})
      });
      if (ts.contact_id) {
        await sbFetch("contacts?id=eq." + ts.contact_id, {
          method:"PATCH",
          body:JSON.stringify({pipeline_stage:"No Reply/Reserve", member_status:"Reserve"})
        });
      }
      timedOutResults.push({id:ts.id, name:ts.contact_first_name});
    }

    return Response.json({
      touch2_sent: touch2Results.length,
      timed_out: timedOutResults.length,
      details: {touch2Results, timedOutResults}
    });
  } catch(e) {
    console.error("outreach-sequence GET error:", e);
    return Response.json({error:e.message}, {status:500});
  }
}
