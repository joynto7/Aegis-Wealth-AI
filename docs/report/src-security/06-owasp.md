# CHAPTER 6: OWASP TOP 10 FOR AGENTIC APPLICATIONS

The OWASP GenAI Security Project published its Top 10 for Agentic Applications in December 2025: the ten risks specific to AI systems that plan and act through tools [@owasp-asi]. {@tbl:owasp} maps each item to the controls of Aegis and states its status. Seven items are mitigated, one is partly mitigated and two do not apply by design.

Table: OWASP Top 10 for Agentic Applications and the Aegis controls {#tbl:owasp}
| Item | Aegis controls | Status |
|----------------------|----------------------------------------|------------------|
| ASI01 Agent goal hijack | Rules live in code; an injection can at most attempt a revision, which the gate rejects; tool results and descriptions are data; threat signals flag instruction overrides, role-play, prompt extraction, dictated replies and hidden text | Mitigated; detection is pattern-based |
| ASI02 Tool misuse and exploitation | Eleven strict tools in tiers T0 to T2, validated again by the broker; no tool can execute an order, including a rebalancing; at most 4 tool rounds and 20 seconds a turn | Mitigated |
| ASI03 Identity and privilege abuse | The session's user scopes every tool call; another client's data is denied at T1 and logged; names and e-mail addresses never reach the model | Mitigated |
| ASI04 Agentic supply chain vulnerabilities | No plugins, MCP servers or remote tools are loaded at run time; the tool list is fixed in code and fingerprinted; dependencies are pinned to exact versions | Partly mitigated: no software bill of materials or signature checks yet |
| ASI05 Unexpected code execution | No shell, code or file tool exists; tool arguments are validated JSON, never evaluated | Not applicable by design |
| ASI06 Memory and context poisoning | No long-term memory: each turn sends the last ten messages of the client's own chat and a context block written by the system | Mitigated |
| ASI07 Insecure inter-agent communication | One agent; no agent-to-agent messages | Not applicable |
| ASI08 Cascading failures | A refusal, time-out, failed number check or round limit falls back to a checked template; orders need a separate client action; the switches stop the advisor or execution | Mitigated |
| ASI09 Human-agent trust exploitation | Orders need the client's Confirm click and a one-time token; grounding and banned phrases; AI labels on every reply; signals for risk waivers, claimed authority and pressure | Mitigated |
| ASI10 Rogue agents | No autonomy beyond one turn, and no scheduled or conditional actions (the monitoring loop only alerts and proposes); every action logged and traced; alerts and the review queue; the fingerprint shows any change to the configuration | Mitigated; relies on review |

The two qualified statuses point to the same lesson: Aegis prevents harm in code, while some of its detection and assurance still relies on people. ASI01 is mitigated, because the broker and the gate stop a hijacked goal, but its detection uses pattern rules that new wording can evade (risk 20). ASI04 is limited by a fixed, fingerprinted tool list and pinned dependencies, but the build has no software bill of materials yet. Both are among the next steps of Chapter 7.
