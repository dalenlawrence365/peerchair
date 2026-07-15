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

  // --- FILE AS ORGANIZATION: it isn't a person, so don't make one ---
  // ProVisors and ACG mail you as entities. They don't belong in `people` (not
  // human) and they aren't sponsors (you don't sell to them). This writes the
  // routing rule + the organization, links them, and sweeps every message from
  // that sender out of the queue. Nothing is ever added to `people`.
  if (action === "file_as_organization") {
    const orgName = (body.organization_name || "").trim()
    if (!orgName) return Response.json({ error: "organization_name required" }, { status: 400 })
    if (!row.from_address) return Response.json({ error: "Row has no sender address" }, { status: 400 })

    const scope = body.scope === "domain" ? "domain" : "address"
    const domain = row.from_address.split("@")[1] || ""
    const pattern = scope === "domain" ? domain : row.from_address
    if (scope === "domain" && !domain) {
      return Response.json({ error: "Could not read a domain from " + row.from_address }, { status: 400 })
    }

    // Refuse to file a domain that real people send from — that is exactly how
    // a human gets swallowed. (mhenderson@acg.org is why this check exists.)
    if (scope === "domain") {
      const { data: humans } = await sb.from("person_emails")
        .select("email").ilike("email", "%@" + domain).limit(5)
      if (humans && humans.length) {
        return Response.json({
          error: `${humans.length} person(s) in PeerChair send from @${domain} `
               + `(e.g. ${humans[0].email}). Filing the whole domain would hide their mail. `
               + `File just ${row.from_address} instead.`
        }, { status: 409 })
      }
    }

    // The organization itself. is_sponsor=false and sponsor_state=null keep it
    // out of the sponsor pipeline, which gates every query on is_sponsor=true.
    let companyId = null
    const { data: existingCo } = await sb.from("companies")
      .select("id, org_type").ilike("name", orgName).limit(1).maybeSingle()
    if (existingCo) {
      companyId = existingCo.id
      if (!existingCo.org_type) {
        await sb.from("companies").update({ org_type: "organization" }).eq("id", companyId)
      }
    } else {
      const { data: newCo, error: coErr } = await sb.from("companies").insert({
        name: orgName,
        org_type: "organization",
        is_sponsor: false,
        sponsor_state: null,
        source: "inbox_triage",
        notes: `Organization created from inbox triage on ${new Date().toISOString().slice(0, 10)} — files mail from ${pattern}.`,
      }).select("id").single()
      if (coErr) return Response.json({ error: "Company insert failed: " + coErr.message }, { status: 500 })
      companyId = newCo.id
    }

    const { error: ruleErr } = await sb.from("sender_rules").upsert({
      pattern,
      match_type: scope,
      label: orgName,
      disposition: "file",
      company_id: companyId,
      active: true,
      notes: `Filed as an organization from inbox triage on ${new Date().toISOString().slice(0, 10)}.`,
    }, { onConflict: "match_type,pattern" })
    if (ruleErr) return Response.json({ error: "Rule write failed: " + ruleErr.message }, { status: 500 })

    // Sweep every queued message this rule now covers.
    let q = sb.from("unmatched_communications")
      .update({
        status: "filed",
        filed_label: orgName,
        filed_disposition: "file",
        filed_at: new Date().toISOString(),
      })
      .in("status", ["new"])
    q = scope === "domain"
      ? q.ilike("from_address", "%@" + domain)
      : q.eq("from_address", row.from_address)
    const { data: swept, error: sweepErr } = await q.select("id")
    if (sweepErr) return Response.json({ error: sweepErr.message }, { status: 500 })

    return Response.json({
      success: true,
      action: "filed_as_organization",
      organization: orgName,
      company_id: companyId,
      rule: (scope === "domain" ? "*@" : "") + pattern,
      filed: (swept || []).length,
    })
  }

  // --- UNFILE: pull a rule-filed message back into the triage queue ---
  // This is the escape hatch. If a rule filed something that actually needs
  // Dalen, one click returns it AND records an explicit 'queue' override so the
  // same sender is never filed again. Repeatedly rescuing from one rule is the
  // signal that the rule is too broad.
  if (action === "unfile") {
    if (row.status !== "filed") {
      return Response.json({ error: `Only filed rows can be unfiled (this one is '${row.status}').` }, { status: 409 })
    }

    // Pin the sender back to the queue permanently.
    if (row.from_address) {
      const { error: ruleErr } = await sb.from("sender_rules").upsert({
        pattern: row.from_address,
        match_type: "address",
        label: (row.from_name || row.from_address) + " — pulled back by Dalen",
        disposition: "queue",
        notes: `Unfiled from "${row.filed_label || "a rule"}" on ${new Date().toISOString().slice(0, 10)}.`
             + ` Original rule id: ${row.filed_by_rule_id || "n/a"}.`,
        active: true,
      }, { onConflict: "match_type,pattern" })
      if (ruleErr) return Response.json({ error: "Override write failed: " + ruleErr.message }, { status: 500 })
    }

    // Return every filed message from this sender, not just the one clicked —
    // if one was wrong, the rest from that sender are wrong too.
    const { data: restored, error } = await sb.from("unmatched_communications")
      .update({ status: "new", unfiled_at: new Date().toISOString() })
      .eq("from_address", row.from_address)
      .eq("status", "filed")
      .select("id")
    if (error) return Response.json({ error: error.message }, { status: 500 })

    return Response.json({
      success: true,
      action: "unfiled",
      restored: (restored || []).length,
      sender: row.from_address,
    })
  }

  // All other actions require an un-actioned row. 'filed' counts as un-actioned:
  // a rule routed it, but no human decision has been made, so Dalen can still
  // add/merge/ignore straight from the Filed tab without unfiling first.
  if (row.status !== "new" && row.status !== "filed") {
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

    // --- Teach the system, don't just move one message. ---
    // Record this address as the person's alias so mail from it is matched on
    // arrival forever. Without this, merging is a one-time act that learns
    // nothing: the same person's next message from the same address lands
    // right back in the queue and the work is done again.
    let alias_learned = false
    let alias_conflict = null
    if (row.from_address) {
      const { data: claimed } = await sb.from("person_emails")
        .select("person_id, email")
        .eq("email", row.from_address)
        .maybeSingle()

      if (claimed && claimed.person_id !== personId) {
        // Address already belongs to someone else. Do NOT silently reassign —
        // that would quietly move mail off another person's timeline.
        const { data: owner } = await sb.from("people")
          .select("full_name").eq("id", claimed.person_id).maybeSingle()
        return Response.json({
          error: `${row.from_address} is already on file as ${owner ? owner.full_name : "another contact"}.`
               + ` One address can only belong to one person — fix that record first.`
        }, { status: 409 })
      }

      if (!claimed) {
        const { error: aliasErr } = await sb.from("person_emails").insert({
          person_id: personId,
          email: row.from_address,
          label: "alternate",
          is_primary: false,
          source: "inbox_merge",
        })
        if (aliasErr) alias_conflict = aliasErr.message
        else alias_learned = true
      }
    }

    const { error: commErr } = await writeToTimeline(sb, row, personId)
    if (commErr) return Response.json({ error: "Timeline write failed: " + commErr.message }, { status: 500 })

    const { error: uErr } = await sb.from("unmatched_communications").update({
      status: "merged_into_existing",
      merged_into_person_id: personId,
      actioned_at: new Date().toISOString(),
    }).eq("id", id)
    if (uErr) return Response.json({ error: uErr.message }, { status: 500 })

    // --- Retro-sweep: if this address was theirs all along, every other queued
    // message from it was theirs too. Clear them in one go rather than making
    // Dalen identify the same person three more times.
    let also_merged = 0
    if (row.from_address) {
      const { data: siblings } = await sb.from("unmatched_communications")
        .select("*")
        .eq("from_address", row.from_address)
        .in("status", ["new", "filed"])
      for (const sib of siblings || []) {
        const { error: sErr } = await writeToTimeline(sb, sib, personId)
        if (sErr) { console.warn("retro-sweep timeline write failed:", sErr.message); continue }
        const { error: sUErr } = await sb.from("unmatched_communications").update({
          status: "merged_into_existing",
          merged_into_person_id: personId,
          actioned_at: new Date().toISOString(),
        }).eq("id", sib.id)
        if (!sUErr) also_merged++
      }
    }

    return Response.json({
      success: true,
      action: "merged",
      merged_into: { id: personId, full_name: target.full_name },
      alias_learned,
      alias_conflict,
      also_merged,
      address: row.from_address,
    })
  }

  if (action === "add_to_peerchair") {
    const { first_name, last_name, role, company, title, email, note } = body
    if (!first_name || !last_name || !role) {
      return Response.json({ error: "first_name, last_name, role required" }, { status: 400 })
    }
    // 'contact' = someone who belongs in PeerChair but isn't in a pipeline.
    // Not a new role — it writes NO role, which is what 4,099 of the 6,595
    // existing people already are. Two ways to express the same thing is how
    // you get drift, so a Contact is stored identically to what's already there.
    const validRoles = ["contact", "cfo", "sponsor_contact", "referral_partner"]
    if (!validRoles.includes(role)) {
      return Response.json({ error: "Invalid role: " + role }, { status: 400 })
    }

    const stateCol = role === "sponsor_contact" ? "sponsor_state"
                   : role === "cfo"             ? "cfo_state"
                   : role === "referral_partner" ? "referral_state"
                   :                              null

    // Email defaults to the unmatched row's from_address, but the form can
    // override — important for transactional senders (e.g. Calendly), where
    // the actual person's email lives in the body, not the From: header.
    const finalEmail = (email && email.trim()) || row.from_address

    const autoNote = `Added via inbox triage on ${new Date().toISOString().slice(0, 10)}` +
                     (row.subject ? ` — first inbound: "${row.subject}"` : "")

    const insertPayload = {
      first_name,
      last_name,
      full_name: `${first_name} ${last_name}`,
      email: finalEmail,
      company: company || null,
      title: title || null,
      roles: role === "contact" ? [] : [role],
      source: "inbox_triage",
      // Why is this person here? For a Contact this is the only thing that
      // explains them later, so it leads.
      notes: (note && note.trim() ? note.trim() + "\n\n" : "") + autoNote,
    }
    if (stateCol) insertPayload[stateCol] = "pool"

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

    // Same retro-sweep as merge: identifying someone once should clear every
    // message already sitting here from that address, not just the one clicked.
    let also_linked = 0
    if (row.from_address && finalEmail === row.from_address) {
      const { data: siblings } = await sb.from("unmatched_communications")
        .select("*")
        .eq("from_address", row.from_address)
        .in("status", ["new", "filed"])
      for (const sib of siblings || []) {
        const { error: sErr } = await writeToTimeline(sb, sib, newPerson.id)
        if (sErr) { console.warn("retro-sweep timeline write failed:", sErr.message); continue }
        const { error: sUErr } = await sb.from("unmatched_communications").update({
          status: "added_to_peerchair",
          resulted_in_person_id: newPerson.id,
          actioned_at: new Date().toISOString(),
        }).eq("id", sib.id)
        if (!sUErr) also_linked++
      }
    }

    return Response.json({
      success: true,
      action: "added",
      person: { id: newPerson.id, full_name: newPerson.full_name },
      role_written: role === "contact" ? "none (Contact)" : role,
      also_linked,
    })
  }

  return Response.json({ error: "Unknown action: " + action }, { status: 400 })
}
