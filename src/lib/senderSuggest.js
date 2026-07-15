// Suggest who an unmatched sender probably is.
//
// This NEVER writes. It ranks candidates and shows its reasoning, and Dalen
// confirms. Auto-matching on name similarity would silently attach mail to the
// wrong person's timeline, and a timeline write has no undo — so the guess is
// a suggestion with its evidence attached, not a decision.

// Nicknames run both ways: PeerChair has "Jim Twerdahl", the mail says "james@".
const NICKNAMES = [
  ["james", "jim", "jimmy", "jamie"], ["robert", "bob", "bobby", "rob"],
  ["william", "bill", "billy", "will"], ["michael", "mike", "mikey"],
  ["david", "dave"], ["daniel", "dan", "danny"], ["thomas", "tom", "tommy"],
  ["richard", "rick", "dick", "rich"], ["christopher", "chris"],
  ["steven", "stephen", "steve"], ["joseph", "joe", "joey"],
  ["anthony", "tony"], ["nicholas", "nick"], ["matthew", "matt"],
  ["alexander", "alex"], ["benjamin", "ben"], ["samuel", "sam"],
  ["edward", "ed", "eddie", "ted"], ["theodore", "ted", "teddy"],
  ["andrew", "andy", "drew"], ["gregory", "greg"], ["jeffrey", "jeff"],
  ["kenneth", "ken"], ["lawrence", "larry"], ["martin", "marty"],
  ["patrick", "pat"], ["philip", "phillip", "phil"], ["ronald", "ron"],
  ["russell", "russ"], ["victor", "vic"], ["walter", "walt"],
  ["catherine", "kathryn", "cathy", "kathy", "kate", "katie"],
  ["elizabeth", "liz", "beth", "betsy", "eliza"], ["susan", "sue", "suzy"],
  ["margaret", "peggy", "meg", "maggie"], ["jennifer", "jen", "jenny"],
  ["rebecca", "becky"], ["deborah", "deb", "debbie"], ["barbara", "barb"],
  ["pamela", "pam"], ["valerie", "val"], ["patricia", "pat", "patty", "trish"],
  ["charles", "charlie", "chuck"], ["francis", "frank"], ["albert", "al"],
  ["raymond", "ray"], ["ronald", "ron"], ["donald", "don"], ["gerald", "jerry"],
  ["juan", "juanito"], ["jose", "pepe"], ["francisco", "paco", "frank"],
]

const NICK_INDEX = (function () {
  const m = {}
  for (const group of NICKNAMES) {
    for (const name of group) {
      if (!m[name]) m[name] = new Set()
      for (const other of group) m[name].add(other)
    }
  }
  return m
})()

export function sameNamePerson(a, b) {
  if (!a || !b) return false
  a = a.toLowerCase(); b = b.toLowerCase()
  if (a === b) return true
  const set = NICK_INDEX[a]
  return !!(set && set.has(b))
}

const PUBLIC_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
  "icloud.com", "me.com", "protonmail.com", "proton.me", "fastmail.com",
  "msn.com", "live.com", "comcast.net", "sbcglobal.net", "verizon.net",
])

export function domainOf(addr) {
  return String(addr || "").toLowerCase().split("@")[1] || ""
}
export function localOf(addr) {
  return String(addr || "").toLowerCase().split("@")[0] || ""
}
function rootOf(domain) {
  const parts = String(domain || "").split(".")
  return parts.length >= 2 ? parts[parts.length - 2] : (parts[0] || "")
}
function tokens(s) {
  return String(s || "").toLowerCase().replace(/[^a-z\s'-]/g, " ").split(/[\s'-]+/).filter(Boolean)
}
function nameTokens(fullName) {
  // Strip credential suffixes so "Hugo Sanchez, MBA" doesn't match on "mba".
  const junk = new Set(["mba", "cpa", "cfa", "jr", "sr", "ii", "iii", "iv", "phd", "cma"])
  return tokens(fullName).filter(function (t) { return !junk.has(t) && t.length > 1 })
}

// Score one candidate person against one unmatched sender.
// Returns { score, reasons[] }.
export function scoreCandidate(sender, person) {
  const reasons = []
  let score = 0

  const sDomain = domainOf(sender.from_address)
  const sLocal = localOf(sender.from_address)
  const sName = nameTokens(sender.from_name)
  const pName = nameTokens(person.full_name)
  const isPublic = PUBLIC_DOMAINS.has(sDomain)

  const pDomains = (person.emails || []).map(domainOf).filter(Boolean)

  // Strongest single signal: same private domain as an address we already have.
  if (sDomain && !isPublic && pDomains.indexOf(sDomain) !== -1) {
    score += 50
    reasons.push("same email domain (@" + sDomain + ") as an address already on file")
  }

  const pLast = pName.length > 1 ? pName[pName.length - 1] : null
  const pFirst = pName.length ? pName[0] : null
  const sLast = sName.length > 1 ? sName[sName.length - 1] : null
  const sFirst = sName.length ? sName[0] : null

  if (pLast && sLast && pLast === sLast) {
    score += 30
    reasons.push("same surname (" + sLast + ")")
  }
  if (pFirst && sFirst) {
    if (pFirst === sFirst) {
      score += 15
      reasons.push("same first name")
    } else if (sameNamePerson(pFirst, sFirst)) {
      score += 14
      reasons.push('"' + sFirst + '" is a known variant of "' + pFirst + '"')
    }
  }

  // The local part often carries the name even when From: display name doesn't.
  if (pLast && sLocal.indexOf(pLast) !== -1 && pLast.length > 2) {
    score += 12
    reasons.push("surname appears in the address (" + sLocal + "@)")
  }
  if (pFirst && pFirst.length > 2) {
    const variants = NICK_INDEX[pFirst] ? Array.from(NICK_INDEX[pFirst]) : [pFirst]
    for (const v of variants) {
      if (v.length > 2 && sLocal.indexOf(v) !== -1) {
        score += 8
        reasons.push(v === pFirst
          ? 'first name appears in the address (' + sLocal + '@)'
          : '"' + v + '" in the address is a form of "' + pFirst + '"')
        break
      }
    }
  }

  // Company signal: domain root vs the company we have on file.
  const root = rootOf(sDomain)
  if (root && !isPublic && person.company) {
    const cTokens = tokens(person.company)
    if (cTokens.indexOf(root) !== -1) {
      score += 25
      reasons.push('email domain matches their company on file ("' + person.company + '")')
    } else if (cTokens.join("").indexOf(root) !== -1 && root.length > 4) {
      score += 18
      reasons.push('email domain looks like their company ("' + person.company + '")')
    }
  }

  return { score: score, reasons: reasons }
}

export function confidenceOf(score) {
  if (score >= 60) return "high"
  if (score >= 35) return "likely"
  if (score >= 20) return "possible"
  return "weak"
}
