export const dynamic = "force-dynamic"

import { serverClient } from "@/lib/supabaseServer"

// Common write of the original unmatched message into a person's
// communications timeline once it's been linked (merged or added).
async function writeToTimeline(sb, row, personId) {
  return sb.from("communications").insert({
    person_id: personId,
    direction: row.direction,
    channel: row.channel,
    subject: row.subject,
    body: row.body_preview
      ? `Subject: ${row.subject || "(no subject)"}\n\n${row.body_preview}`
      : null,
    occurred_at: row.occurred_at,
    step_label: row.direction === "inbound"
      ? "Received Email (Outlook)"
      : "Sent Email (Outlook)",
    source: "outlook_sync",
  })
}

export async function POST(req, { params }) {
  const { id } = await params
  const sb = serverClient()

  const body = await req.json().catch(function(){ return {} })
  const action = body.action

  const { data: row, error: getErr } = await sb
    .from("unmatched_communications")
    .select("*")
    .eq("id", id)
    .single()
  if (getErr || !row) {
    return Response.json({ error: "Unmatched row not found" }, { status: 404 })
  }

  // --- DELETE: allowed on any status, wipes the row entirely ---
  if (action === "delete") {
    const { error } = await sb.from("unmatched_communications").delete().eq("id", id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ success: true, action: "deleted" })
  }

  // All other actions require the row to be in 'new' state
  if (row.status !== "new") {
    return Response.json({ error: `Already actioned (${row.status}). Reload the list.` }, { status: 409 })
  }

  if (action === "archive") {
    const { error } = await sb.from("unmatched_communications").update({
      status: "archived",
      actioned_at: new Date().toISOString(),
    }).eq("id", id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ success: true, action: "archived" })
  }

  if (action === "ignore") {
    const { error } = await sb.from("unmatched_communications").update({
      status: "ignored",
      actioned_at: new Date().toISOString(),
    }).eq("id", id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ success: true, action: "ignored" })
  }

  if (action === "merge_into_existing") {
    const personId = body.person_id
    if (!personId) return Response.json({ error: "person_id required" }, { status: 400 })

    const { data: target, error: tgtErr } = await sb.from("people")
      .select("id, full_name, email")
      .eq("id", personId)
      .single()
    if (tgtErr || !target) return Response.json({ error: "Target person not found" }, { status: 404 })

    const { error: commErr } = await writeToTimeline(sb, row, personId)
    if (commErr) return Response.json({ error: "Timeline write failed: " + commErr.message }, { status: 500 })

    const { error: uErr } = await sb.from("unmatched_communications").update({
      status: "merged_into_existing",
      merged_into_person_id: personId,
      actioned_at: new Date().toISOString(),
    }).eq("id", id)
    if (uErr) return Response.json({ error: uErr.message }, { status: 500 })

    return Response.json({
      success: true,
      action: "merged",
      merged_into: { id: personId, full_name: target.full_name }
    })
  }

  if (action === "add_to_peerchair") {
    const { first_name, last_name, role, company, title, email } = body
    if (!first_name || !last_name || !role) {
      return Response.json({ error: "first_name, last_name, role required" }, { status: 400 })
    }
    const validRoles = ["cfo", "sponsor_contact", "referral_partner"]
    if (!validRoles.includes(role)) {
      return Response.json({ error: "Invalid role: " + role }, { status: 400 })
    }

    const stateCol = role === "sponsor_contact" ? "sponsor_state"
                   : role === "cfo"             ? "cfo_state"
                   :                              "referral_state"

    // Email defaults to the unmatched row's from_address, but the form can
    // override — important for transactional senders (e.g. Calendly), where
    // the actual person's email lives in the body, not the From: header.
    const finalEmail = (email && email.trim()) || row.from_address

    const insertPayload = {
      first_name,
      last_name,
      full_name: `${first_name} ${last_name}`,
      email: finalEmail,
      company: company || null,
      title: title || null,
      roles: [role],
      [stateCol]: "pool",
      source: "inbox_triage",
      notes: `Added via inbox triage on ${new Date().toISOString().slice(0,10)}` +
             (row.subject ? ` — first inbound: "${row.subject}"` : ""),
    }

    const { data: newPerson, error: insErr } = await sb.from("people")
      .insert(insertPayload)
      .select("id, full_name")
      .single()
    if (insErr) return Response.json({ error: "People insert failed: " + insErr.message }, { status: 500 })

    const { error: commErr } = await writeToTimeline(sb, row, newPerson.id)
    if (commErr) {
      // Person was created — don't roll back, just flag
      console.warn("People created but timeline write failed:", commErr.message)
    }

    const { error: uErr } = await sb.from("unmatched_communications").update({
      status: "added_to_peerchair",
      resulted_in_person_id: newPerson.id,
      actioned_at: new Date().toISOString(),
    }).eq("id", id)
    if (uErr) return Response.json({ error: uErr.message }, { status: 500 })

    return Response.json({
      success: true,
      action: "added",
      person: { id: newPerson.id, full_name: newPerson.full_name }
    })
  }

  return Response.json({ error: "Unknown action: " + action }, { status: 400 })
}
