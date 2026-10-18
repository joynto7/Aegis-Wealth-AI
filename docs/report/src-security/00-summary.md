# SUMMARY

This report is the security self-assessment of Aegis Wealth AI, deliverable 05 of the 2026 Shenzhen International FinTech Competition, International Track [@competition]. As the competition asks, it describes how the permission tiers are implemented and lists the known risks. It also sets out every control with the code that enforces it and the test that proves it, and reports the results of a red-team run.

Aegis gives an AI agent a real role in wealth advice, so its security starts from one rule: the agent can propose, but it can never execute. The agent works only through eleven tools in three tiers. T0 reads product data, T1 reads the logged-in client's own data, and T2 creates or revises a proposal, which the compliance gate always checks. A permission broker in code checks every call before any service runs. No tool exists for tier T3: an order is placed only after the client's own comprehension quiz, Confirm click and a single-use token that the agent cannot obtain. A compliance officer holds a separate oversight role and can suspend the advisor or halt execution by hand.

The assessment finds:

- **Permission tiers enforced in code.** Every tier is enforced by the server, not by the model's instructions, and every control has an automated test. All 196 backend tests pass, including the twelve acceptance tests of the project documentation.
- **Red team: 30 of 30 attacks passed.** No attack placed an order, passed an unsuitable proposal, returned another client's data or put an unsupported number in a final reply. The threat signals flagged 27 of the 30 attacks for human review.
- **25 known risks**, each with an example, its controls and what remains. The main residual risks are new attack wording that the pattern-based threat signals miss, the replacement of a whole database, rate limits held in one process's memory, and the absence of an external penetration test.
- **OWASP Top 10 for Agentic Applications:** seven items mitigated, one partly mitigated (supply chain) and two not applicable by design [@owasp-asi].

All money in Aegis is simulated, all products and market data are samples, and the system has no connection to a real broker.

**Keywords:** AI agent, permission tiers, least privilege, prompt injection, red team, compliance gate, human oversight, known-risk list.
