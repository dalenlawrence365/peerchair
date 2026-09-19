// "Archive" is a person_status_tags row with tag="archived", same table and
// same soft-remove convention (removed_at) as do_not_contact / not_a_fit /
// out_of_market etc. -- no new column, no migration. Archiving hides someone
// from pipeline/dashboard/list surfaces without touching their history
// (meetings, communications, notes all stay intact and reachable from their
// profile), and unarchiving is just removing the tag.
//
// Two helpers because callers split into two shapes: a post-fetch filter for
// row-returning queries (list views), and a ready-to-use PostgREST "not in"
// filter string for head:true count queries, which never return rows to
// filter after the fact.

export async function getArchivedPersonIds(sb) {
  const { data } = await sb.from("person_status_tags")
    .select("person_id")
    .eq("tag", "archived")
    .is("removed_at", null)
  return new Set((data || []).map(function (r) { return r.person_id }))
}

// Returns a PostgREST-ready "(id1,id2,...)" string for .not("id", "in", str),
// or null when nobody's archived -- callers should skip applying the filter
// in that case rather than pass an empty "()" (PostgREST rejects an empty
// "in" list).
export function archivedNotInFilter(archivedIds) {
  if (!archivedIds || archivedIds.size === 0) return null
  return "(" + Array.from(archivedIds).map(function (id) { return `"${id}"` }).join(",") + ")"
}
