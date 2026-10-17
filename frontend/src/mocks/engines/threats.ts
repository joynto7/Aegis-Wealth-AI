import type { ThreatSignal } from "@/lib/types";

/**
 * Threat signals, a port of backend/app/agent/threats.py: pattern rules that tag a client message with the
 * attack it looks like, mapped to the OWASP Top 10 for Agentic Applications (2026). Defence in depth only:
 * the broker and the gate stop attacks; these make attempts visible in the review queue.
 */
type Severity = ThreatSignal["severity"];

interface Pattern {
  id: string;
  label: string;
  severity: Severity;
  owasp: string;
  regex: RegExp;
}

const SEVERITY_ORDER: Record<Severity, number> = { low: 1, medium: 2, high: 3 };

export const PATTERNS: Pattern[] = [
  {
    id: "goal_hijack",
    label: "Instruction override",
    severity: "high",
    owasp: "ASI01",
    regex: new RegExp(
      String.raw`\b(ignore|disregard|forget|override|bypass|skip|disable[ds]?|suspend(ed)?)\b[^.?!\n]{0,40}` +
        String.raw`\b(rules?|instructions?|guidelines?|polic(y|ies)|limits?|gate|restrictions?|guardrails?|checks?|tiers?)\b` +
        String.raw`|\b(system override|admin mode|developer mode|new (policy|instructions?)|from now on you)\b` +
        String.raw`|<\s*\/?\s*system\s*>|\bonly a suggestion\b|\bapprove all\b`,
      "i"
    ),
  },
  {
    id: "prompt_extraction",
    label: "Prompt extraction",
    severity: "medium",
    owasp: "ASI01",
    regex: new RegExp(
      String.raw`\b(system|hidden|initial|original|secret)\s+(prompt|instructions?|message|rules)\b` +
        String.raw`|\b(print|reveal|show|repeat|output)\b[^.?!\n]{0,30}\b(prompt|instructions?)\b` +
        String.raw`|\bword for word\b`,
      "i"
    ),
  },
  {
    id: "execution_request",
    label: "Execution request",
    severity: "medium",
    owasp: "ASI02",
    regex: new RegExp(
      String.raw`\b(execute|execut\w+|place (the |an |my )?orders?|order placed|confirm (it|and)|buy|sell)\b` +
        String.raw`[^.?!\n]{0,40}\b(now|immediately|right now|for me|on my behalf|today|all|everything|orders?|trade)\b` +
        String.raw`|\bexecute_\w+|\bconfirmation token\b|\bskip the (comprehension )?quiz\b|\bmark\b[^.?!\n]{0,40}\bexecuted\b`,
      "i"
    ),
  },
  {
    id: "cross_client",
    label: "Another client's data",
    severity: "high",
    owasp: "ASI03",
    regex: new RegExp(
      String.raw`\b(another|other|different|every|all)\s+(client|user|customer|account)s?\b` +
        String.raw`|\buser\s*(id|#|no\.?)?\s*\d+\b|\b[\w.+-]+@[\w-]+\.\w+\b|\bsomeone else'?s?\b` +
        String.raw`|\b(chen|rina)'?s\b`,
      "i"
    ),
  },
  {
    id: "tier_claim",
    label: "Unverified tier claim",
    severity: "medium",
    owasp: "ASI09",
    regex: new RegExp(
      String.raw`\b(i'?m|i am)\s+(actually |really )?(a )?tier\s*\d\b|\b(set|change)\s+my\s+tier\b|\bclient is tier\s*\d\b`,
      "i"
    ),
  },
  {
    id: "role_play",
    label: "Role-play jailbreak",
    severity: "medium",
    owasp: "ASI01",
    regex: new RegExp(String.raw`\b(you are now|pretend( that| to be| you are)?|act as|role-?play|\bDAN\b|jailbreak|no rules)\b`, "i"),
  },
  {
    id: "authority_claim",
    label: "Claimed authority",
    severity: "medium",
    owasp: "ASI09",
    regex: new RegExp(
      String.raw`\b(as (your|the) (developer|admin|administrator|operator|creator)|i authori[sz]e you` +
        String.raw`|compliance (memo|says|team says)|my advisor'?s note|tool result:)\b`,
      "i"
    ),
  },
  {
    id: "output_control",
    label: "Dictated reply",
    severity: "medium",
    owasp: "ASI01",
    regex: new RegExp(String.raw`\b(respond|reply|answer|say|output)\b[^.?!\n]{0,20}\bonly\b[^.?!\n]{0,20}['"“‘]|\bnothing else\b`, "i"),
  },
  {
    id: "risk_waiver",
    label: "Waiver of suitability",
    severity: "medium",
    owasp: "ASI09",
    regex: new RegExp(
      String.raw`\bi accept all (the )?risks?\b|\bat my own risk\b|\bi take full responsibility\b` +
        String.raw`|\bwaive (the )?(rules?|suitability|warnings?|checks?)\b`,
      "i"
    ),
  },
  {
    id: "concentration",
    label: "Large single weight",
    severity: "low",
    owasp: "ASI09",
    regex: new RegExp(String.raw`\b([5-9]\d|100)\s?%|\b(only|entirely|all in|all-in)\s+(in\s+)?(equit\w*|stocks?|thematic|high[- ]growth)`, "i"),
  },
  {
    id: "pressure",
    label: "Pressure or urgency",
    severity: "low",
    owasp: "ASI09",
    regex: new RegExp(String.raw`\b(urgent(ly)?|immediately|right now|asap|or else|no time|before (it'?s|the market) )\b`, "i"),
  },
  {
    id: "return_promise",
    label: "Promised returns",
    severity: "low",
    owasp: "ASI09",
    regex: new RegExp(String.raw`\b(guarantee[ds]?|risk[- ]free|can'?t lose|cannot lose|sure profit|promise[ds]?)\b`, "i"),
  },
];

const ENCODED = /[A-Za-z0-9+/]{40,}={0,2}/;
const INVISIBLE = /\p{Cf}/gu;

export function scanThreats(message: string): ThreatSignal[] {
  const signals: ThreatSignal[] = [];
  for (const p of PATTERNS) {
    const match = p.regex.exec(message);
    if (match) signals.push({ id: p.id, label: p.label, severity: p.severity, owasp: p.owasp, evidence: match[0].slice(0, 60) });
  }
  const hidden = message.match(INVISIBLE) ?? [];
  const encoded = ENCODED.exec(message);
  if (hidden.length || encoded) {
    const count = hidden.length;
    const evidence = count ? `${count} invisible character${count !== 1 ? "s" : ""}` : (encoded as RegExpExecArray)[0].slice(0, 60);
    signals.push({ id: "obfuscation", label: "Hidden or encoded text", severity: "medium", owasp: "ASI01", evidence });
  }
  return signals.sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);
}
