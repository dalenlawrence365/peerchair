// Status tags that mean "you probably shouldn't be reaching out to this
// person" — shared by Draft Email, Draft DM (client warning banner + server
// prompt context), and the warmth index (these tags floor warmth at Cold
// regardless of past engagement). Single source of truth so the definition
// can't drift between the places that check it.
export const WARNING_TAGS = ["do_not_contact", "opted_out", "not_a_fit", "out_of_market"]
