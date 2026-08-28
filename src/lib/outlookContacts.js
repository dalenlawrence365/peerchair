import { graphFetch } from "@/lib/microsoft-auth"

// Upsert an Outlook contact from a PeerChair person record, called every time
// a draft email is created for that person. Outlook's own contact capture is
// spotty — Dalen wants PeerChair's data (email, phone, company, title,
// LinkedIn, notes) filling in whatever Outlook is missing, automatically,
// every time he drafts to someone. Fill-blank-only, like the people.email /
// people.location backfill: this only ever ADDS to an existing Outlook
// contact's empty fields, never overwrites something already there (in case
// Dalen hand-edited it in Outlook).
//
// Finding the existing contact: an earlier version used a server-side
// $filter=emailAddresses/any(...) OData lambda query. Graph's contacts
// endpoint has known compatibility quirks with lambda filters across
// mailbox/tenant configurations, and it was silently failing (findable only
// by reading Graph's error body, which nothing was logging). Switched to
// listing contacts (paginated) and matching the email client-side instead —
// slower per call, but has no filter-syntax surface to break on, and this
// contact list isn't going to be large enough for pagination to be a
// real cost.
//
// Every failure is both logged (console.error, so it shows up in Vercel
// runtime logs) and returned in the result object, so a caller — or Dalen
// asking "did it work?" — has something concrete to go on instead of a
// silent no-op.
async function findExistingContactByEmail(email) {
  const target = email.trim().toLowerCase()
  let url = "https://graph.microsoft.com/v1.0/me/contacts?$top=250&$select=id,emailAddresses,givenName,surname,companyName,jobTitle,businessHomePage,personalNotes,mobilePhone"
  for (let page = 0; page < 8 && url; page++) {
    const res = await graphFetch(url)
    if (!res.ok) {
      const t = await res.text().catch(() => "")
      throw new Error("Graph list contacts " + res.status + ": " + t.slice(0, 200))
    }
    const data = await res.json().catch(() => ({}))
    const match = (data.value || []).find(function (c) {
      return (c.emailAddresses || []).some(function (a) { return (a.address || "").trim().toLowerCase() === target })
    })
    if (match) return match
    url = data["@odata.nextLink"] || null
  }
  return null
}

export async function upsertOutlookContact(sb, personId) {
  try {
    const { data: person } = await sb.from("people")
      .select("full_name, first_name, last_name, email, phone, company, title, location, linkedin_url, headline, about")
      .eq("id", personId).maybeSingle()
    if (!person || !person.email) return { skipped: "no_email" }

    const notesParts = []
    if (person.headline) notesParts.push(person.headline)
    if (person.about) notesParts.push(person.about)
    if (person.location) notesParts.push("Location: " + person.location)
    const notes = notesParts.join("\n\n")

    const wanted = {
      givenName: person.first_name || null,
      surname: person.last_name || null,
      displayName: person.full_name || null,
      companyName: person.company || null,
      jobTitle: person.title || null,
      businessHomePage: person.linkedin_url || null,
      personalNotes: notes || null,
      mobilePhone: person.phone || null,
    }

    let existing
    try {
      existing = await findExistingContactByEmail(person.email)
    } catch (e) {
      console.error("upsertOutlookContact: lookup failed for " + personId + ": " + e.message)
      return { error: "lookup_failed", detail: e.message }
    }

    if (existing) {
      const patch = {}
      for (const k of Object.keys(wanted)) {
        if (wanted[k] && !existing[k]) patch[k] = wanted[k]
      }
      if (Object.keys(patch).length === 0) return { ok: true, unchanged: true, id: existing.id }
      const patchRes = await graphFetch("https://graph.microsoft.com/v1.0/me/contacts/" + existing.id, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      })
      if (!patchRes.ok) {
        const t = await patchRes.text().catch(() => "")
        console.error("upsertOutlookContact: patch failed for " + personId + ": Graph " + patchRes.status + " " + t.slice(0, 300))
        return { error: "Graph patch " + patchRes.status, detail: t.slice(0, 200) }
      }
      return { ok: true, updated: Object.keys(patch), id: existing.id }
    }

    const createBody = {}
    for (const k of Object.keys(wanted)) if (wanted[k]) createBody[k] = wanted[k]
    createBody.emailAddresses = [{ address: person.email, name: person.full_name || person.email }]

    const createRes = await graphFetch("https://graph.microsoft.com/v1.0/me/contacts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(createBody),
    })
    if (!createRes.ok) {
      const t = await createRes.text().catch(() => "")
      console.error("upsertOutlookContact: create failed for " + personId + ": Graph " + createRes.status + " " + t.slice(0, 300))
      return { error: "Graph create " + createRes.status, detail: t.slice(0, 200) }
    }
    const created = await createRes.json().catch(() => ({}))
    return { ok: true, created: true, id: created.id || null }
  } catch (e) {
    console.error("upsertOutlookContact: unexpected error for " + personId + ": " + (e && e.message))
    return { error: String((e && e.message) || e) }
  }
}
