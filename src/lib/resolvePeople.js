// Resolve inbound email addresses to people via the person_emails alias table.
//
// The old model was one person = one address (people.email), so a contact's
// second address arrived as a stranger and landed in the triage queue —
// forever, because merging taught the system nothing. Jim Twerdahl is in
// PeerChair as jim@twerdahl.net and writes from james@twerdahl.net; same
// person, same domain, three messages nobody saw.
//
// Every inbound path resolves through here so there is exactly one answer to
// "whose address is this?".
export async function resolvePeopleByEmail(sb, emails) {
  const wanted = [...new Set(
    (emails || [])
      .map(function (e) { return e ? String(e).trim().toLowerCase() : null })
      .filter(Boolean)
  )]
  if (!wanted.length) return {}

  const map = {}
  // Chunked: Supabase .in() on a long list can blow the URL length limit.
  const CHUNK = 200
  for (let i = 0; i < wanted.length; i += CHUNK) {
    const slice = wanted.slice(i, i + CHUNK)
    const { data, error } = await sb
      .from("person_emails")
      .select("person_id, email")
      .in("email", slice)
    if (error) throw new Error("person_emails lookup failed: " + error.message)
    for (const row of data || []) {
      map[row.email] = { id: row.person_id, email: row.email }
    }
  }
  return map
}
