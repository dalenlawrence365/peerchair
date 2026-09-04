// Status tags that mean "you probably shouldn't be reaching out to this
// person" — shared by Draft Email, Draft DM (client warning banner + server
// prompt context), and the meeting-recap hard-stop suggestion. Single
// source of truth so the definition can't drift between the places that
// check it.
export const WARNING_TAGS = ["do_not_contact", "opted_out", "not_a_fit", "out_of_market"]

// Subset that floors the WARMTH INDEX to 0/Cold. Deliberately narrower than
// WARNING_TAGS: do_not_contact/opted_out/not_a_fit are all judgments about
// the RELATIONSHIP (don't engage, they've said no, they're wrong for the
// room) — genuine hard negatives. out_of_market is a geography/eligibility
// fact about THIS chapter, not a relationship signal — an out-of-market CFO
// can still be a genuinely warm, engaged advocate (replies, refers people,
// wants to talk shop), and that warmth is real and worth seeing: they're a
// referral source now, and a candidate for a different chapter or a future
// move. Flooring their score to 0 alongside someone who said "stop
// contacting me" was wrong. Draft Email/DM still warn on the full
// WARNING_TAGS list above, since out-of-market is still a real reason to
// pause before pitching the LA chapter specifically.
export const WARMTH_FLOOR_TAGS = WARNING_TAGS.filter(function (t) { return t !== "out_of_market" })
