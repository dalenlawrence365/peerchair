import { graphFetch } from "@/lib/microsoft-auth"

// Upsert an Outlook contact from a PeerChair person record, called every time
// a draft email is created for that person. Outlook's own contact capture is
// spotty — Dalen wants PeerChair's data (email, phone, company, title,
// LinkedIn, notes) filling in whatever Outlook is missing, automatically,
// every time he drafts to someone. Fill-blank-only, like the people.email /
// people.location backfill: this only ever ADDS to an existing Outlook
// contact's empty fields, never overwrites something already there (in case
// Dalen hand-edited it in Outlook). Never throws — a contact-sync hiccup
// should never break the actual email draft it rode in on; callers wrap this
// in try/catch (or it's already caught internally) and just log on failure.
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

    // Contacts API supports filtering by email address directly — the
    // documented way to find an existing contact rather than risking dupes.
    const filterEmail = person.email.replace(/'/g, "''")
    const searchRes = await graphFetch(
      "https://graph.microsoft.com/v1.0/me/contacts?$filter=" +
      encodeURIComponent(`emailAddresses/any(a:a/address eq '${filterEmail}')`)
    )
    if (!searchRes.ok) {
      const t = await searchRes.text().catch(() => "")
      return { error: "Graph search " + searchRes.status, detail: t.slice(0, 200) }
    }
    const searchData = await searchRes.json().catch(() => ({}))
    const existing = (searchData.value || [])[0] || null

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
      return { error: "Graph create " + createRes.status, detail: t.slice(0, 200) }
    }
    const created = await createRes.json().catch(() => ({}))
    return { ok: true, created: true, id: created.id || null }
  } catch (e) {
    return { error: String((e && e.message) || e) }
  }
}
