# CHAPTER 7: CONCLUSION AND REFERENCES

## 7.1 Conclusion

Aegis Wealth AI shows that an AI can take part in wealth advice as a real participant, holding the dialogue, choosing tools and proposing allocations, while remaining suitable, explainable and supervised. The approach is architectural rather than a matter of instructions to the model: tested code computes every number and enforces every rule, and the model can only ask, talk and explain.

Each objective of Section 1.1 is met and verified:

- **O1, no unsuitable product can pass:** the nine-rule gate runs inside the only save path of every proposal version. AT-07 passes, and no unsuitable proposal passed in the red-team run.
- **O2, every figure can be traced:** every number comes from an engine, and every number in a reply is checked against the turn's tool results and shown with its source. AT-08 and AT-09 pass.
- **O3, the AI can propose but never execute:** no tool exists for execution, and orders need the client's quiz, Confirm click and one-time token. AT-10 passes, and the 30 red-team prompts placed no order.
- **O4, compliance can supervise and stop the AI:** the AI Control Room gives the officer alerts, a review queue, a model disclosure and two switches that take effect at once, even in the middle of a turn.
- **O5, every recommendation leaves a tamper-evident record:** hash-chained advice records and an append-only log. AT-11 passes.
- **O6, the service works without the model:** checked template answers call the same tools through the same broker. AT-12 passes.

Beyond the requirements, Aegis adds features that make its advice understandable and its AI accountable. The crisis time machine records a client's reaction at the worst moment of a real crisis. How to fix explains a rejection by the smallest change that passes. The goal planner answers "will I get there?" reproducibly. The monitoring loop keeps a portfolio suitable after the market moves without letting the AI trade, and every AI reply carries a label, a configuration fingerprint and a content hash.

## 7.2 Limitations

- **Synthetic data:** the monthly history, the crisis replay paths and the simulated market are synthetic and labelled "Illustrative" until licensed series replace them. The products are samples. Projections resample this history, and the past does not predict the future.
- **Single instance:** SQLite and in-memory rate limits suit a prototype and a single server. Several instances would need a shared database and a shared store for the limits and the lock-out.
- **Hosted demo:** the free instance sleeps after about 15 minutes without traffic and resets its data on every restart. Its demonstration accounts are public, so anyone with the link can use them, see other visitors' actions and trigger the five-minute lock-out.
- **Pattern-based threat signals:** the signals catch known wordings; new phrasings can pass unflagged, although the broker and the gate still stop the attack itself.
- **No external anchor:** the record chain detects edits, but replacing the whole database would go undetected without publishing or signing the latest hash outside the system.
- **Simulated time:** the market clock moves prices but not the calendar of a plan, so horizons and near-term needs keep their agreed values as simulated time passes.
- **Testing:** there has been no external penetration test, no formal accessibility audit and no load test with concurrent users.

## 7.3 Future Work

- **Gateway for outside agents:** expose the read-only T0 and T1 tools to clients' own AI assistants through the Model Context Protocol, with per-client tokens, the same broker and the same logging. Outside agents could then consult Aegis but still never execute.
- **Simplified Chinese interface:** a full translation of the screens, the advisor's replies and the disclosures, with the regulatory texts reviewed by a qualified person.
- **Licensed data:** replace the synthetic history with licensed market series and real product data, with their data dates.
- **Production hosting:** a managed database, a shared rate-limit store, persistent storage for the hosted service and an external anchor for the record chain.
- **Stronger detection:** a classifier, or the model itself as a second opinion, beside the pattern rules, and anomaly detection instead of fixed alert thresholds.
- **Planning features:** glide paths that shorten the horizon as time passes, rebalancing through new contributions, and tax-aware trading.

## 7.4 References

{{REFERENCES}}
