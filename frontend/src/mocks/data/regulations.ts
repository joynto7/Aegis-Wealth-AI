import type { AiControl, Framework, RuleBasis } from "@/lib/types";

/**
 * regulations.json — the regulatory basis of each compliance rule and AI
 * control (an addition). Same content as backend/data/regulations.json;
 * scripts/verify.ts fails if the two drift apart.
 */

interface RawBasis {
  framework: string;
  ref: string;
  requirement: string;
}

interface RawAiControl extends RawBasis {
  id: string;
  control: string;
  check: AiControl["check"];
  note?: string;
}

export const REGULATIONS_VERSION = "reg-2026-10";
export const REGULATIONS_NOTE =
  "Mapping prepared by the team for this sandbox. It shows which requirement each control is designed to meet; it is not legal advice.";

export const FRAMEWORKS: Framework[] = [
  {
    id: "CN-AMGO",
    short: "CN 2018 Guiding Opinions",
    title:
      "Guiding Opinions on Regulating the Asset Management Business of Financial Institutions (PBOC, CBIRC, CSRC and SAFE, 2018)",
    jurisdiction: "China",
  },
  {
    id: "CN-SUIT",
    short: "CSRC Suitability Measures",
    title: "Measures for the Suitability Management of Securities and Futures Investors (CSRC, 2016)",
    jurisdiction: "China",
  },
  {
    id: "EU-MIFID2",
    short: "MiFID II",
    title: "Markets in Financial Instruments Directive (Directive 2014/65/EU)",
    jurisdiction: "EU",
  },
  {
    id: "EU-2017-565",
    short: "MiFID II Delegated Reg.",
    title: "Commission Delegated Regulation (EU) 2017/565",
    jurisdiction: "EU",
  },
  {
    id: "EU-AIACT",
    short: "EU AI Act",
    title: "Artificial Intelligence Act (Regulation (EU) 2024/1689)",
    jurisdiction: "EU",
  },
  {
    id: "AEGIS",
    short: "Aegis policy",
    title: "Internal control set by the Aegis team",
    jurisdiction: "Internal",
  },
];

const RULE_BASIS: Record<string, RawBasis[]> = {
  "R-01": [
    {
      framework: "AEGIS",
      ref: "Integrity control",
      requirement:
        "A proposal invests the whole amount exactly once, so every other check measures the real portfolio.",
    },
  ],
  "R-02": [
    {
      framework: "CN-AMGO",
      ref: "Art. 23",
      requirement: "Asset management that uses AI must follow the general rules on investor suitability.",
    },
    {
      framework: "CN-SUIT",
      ref: "Product-investor matching",
      requirement:
        "Match each product's risk level to the investor's risk tolerance, and do not recommend products above it.",
    },
    {
      framework: "EU-MIFID2",
      ref: "Art. 25(2)",
      requirement: "Recommend only investments that suit the client's risk tolerance and ability to bear losses.",
    },
  ],
  "R-03": [
    {
      framework: "AEGIS",
      ref: "Diversification limit",
      requirement:
        "No single non-cash product may exceed 40% of a portfolio, so one product cannot dominate the outcome.",
    },
  ],
  "R-04": [
    {
      framework: "EU-2017-565",
      ref: "Art. 54(4)",
      requirement:
        "The suitability assessment covers the client's financial situation, including liquid assets and regular commitments.",
    },
  ],
  "R-05": [
    {
      framework: "EU-2017-565",
      ref: "Art. 54(5)",
      requirement:
        "The suitability assessment covers the client's objectives, including how long they want to hold the investment.",
    },
    {
      framework: "AEGIS",
      ref: "Short-horizon cap",
      requirement: "Under a 3-year horizon, equity and gold together stay at or below 20%.",
    },
  ],
  "R-06": [
    {
      framework: "EU-2017-565",
      ref: "Art. 54(5)",
      requirement:
        "The suitability assessment covers how long the client wants to hold the investment, so no lock-up may outlast it.",
    },
  ],
  "R-07": [
    {
      framework: "EU-MIFID2",
      ref: "Art. 24(4)",
      requirement: "Tell clients about all costs and related charges in good time.",
    },
    {
      framework: "AEGIS",
      ref: "Fee ceiling",
      requirement: "A weighted annual fee above 1.00% is flagged for the client to acknowledge.",
    },
  ],
  "R-08": [
    {
      framework: "EU-MIFID2",
      ref: "Art. 25(2)",
      requirement: "Take the client's ability to bear losses into account.",
    },
    {
      framework: "CN-SUIT",
      ref: "Risk tolerance assessment",
      requirement: "Assess the investor's risk tolerance before recommending products.",
    },
  ],
  "R-09": [
    {
      framework: "EU-MIFID2",
      ref: "Art. 25(2)",
      requirement: "Take the client's ability to bear losses into account.",
    },
    {
      framework: "CN-SUIT",
      ref: "Risk tolerance assessment",
      requirement: "Assess the investor's risk tolerance before recommending products.",
    },
  ],
};

const AI_CONTROLS: RawAiControl[] = [
  {
    id: "A23-REPORT",
    framework: "CN-AMGO",
    ref: "Art. 23",
    requirement: "Report the AI model's main parameters and asset-allocation logic to the regulator.",
    control:
      "Model disclosure report (model, prompt fingerprint, tools, allocation logic and rules), exported from the Control Room.",
    check: "report",
  },
  {
    id: "A23-ACCOUNT",
    framework: "CN-AMGO",
    ref: "Art. 23",
    requirement: "Open a separate account for each investor's AI-managed investing.",
    control: "Each client has a separate sandbox account; executed orders touch nothing else.",
    check: "built_in",
  },
  {
    id: "A23-DISCLOSE",
    framework: "CN-AMGO",
    ref: "Art. 23",
    requirement: "Make investors fully aware of the AI algorithm's inherent defects and risks.",
    control: "Disclosure DISC-04 on the Confirm screen, read before every execution.",
    check: "built_in",
  },
  {
    id: "A23-SUITABILITY",
    framework: "CN-AMGO",
    ref: "Art. 23",
    requirement: "Follow the general rules on investor suitability and information disclosure.",
    control: "The compliance gate (R-02, R-08, R-09) checks every proposal, the AI's included.",
    check: "built_in",
  },
  {
    id: "A23-NO-MISLEAD",
    framework: "CN-AMGO",
    ref: "Art. 23 and Art. 19",
    requirement: "Do not use AI to exaggerate products or mislead investors; never promise principal or returns.",
    control: "Every AI reply passes the grounding check: unsupported numbers and promise words never reach the client.",
    check: "built_in",
  },
  {
    id: "A23-INTERVENE",
    framework: "CN-AMGO",
    ref: "Art. 23",
    requirement:
      "When model defects or system faults cause herd behaviour that threatens market stability, step in by hand to adjust or stop the AI business.",
    control: "Suspend AI advisor and Halt execution switches, each with a logged reason.",
    check: "controls",
  },
  {
    id: "AIA-12",
    framework: "EU-AIACT",
    ref: "Art. 12",
    requirement: "Record events automatically over the system's lifetime.",
    control: "Append-only operation log of every tool call, broker decision, gate result and order.",
    check: "built_in",
    note: "Applied as good practice: investment advice is not on the Act's high-risk list.",
  },
  {
    id: "AIA-14",
    framework: "EU-AIACT",
    ref: "Art. 14",
    requirement: "Let people oversee the system and stop it.",
    control: "Only the client's own Confirm click places orders, and compliance can stop the advisor at any time.",
    check: "built_in",
    note: "Applied as good practice: investment advice is not on the Act's high-risk list.",
  },
  {
    id: "MIFID-25-6",
    framework: "EU-MIFID2",
    ref: "Art. 25(6)",
    requirement: "Before the transaction, give a retail client a statement on how the advice suits them.",
    control: "A hash-chained advice record holds the proposal, the gate result, the disclosures and the quiz.",
    check: "built_in",
  },
];

function framework(id: string): Framework {
  const found = FRAMEWORKS.find((f) => f.id === id);
  if (!found) throw new Error(`Unknown framework ${id}`);
  return found;
}

export function ruleBasis(ruleId: string): RuleBasis[] {
  return (RULE_BASIS[ruleId] ?? []).map((b) => ({
    framework: framework(b.framework).short,
    title: framework(b.framework).title,
    ref: b.ref,
    requirement: b.requirement,
  }));
}

export const AI_CONTROL_LIST: AiControl[] = AI_CONTROLS.map((c) => ({
  id: c.id,
  framework: framework(c.framework).short,
  title: framework(c.framework).title,
  ref: c.ref,
  requirement: c.requirement,
  control: c.control,
  check: c.check,
  note: c.note ?? null,
}));
