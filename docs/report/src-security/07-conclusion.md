# CHAPTER 7: LIMITATIONS, NEXT STEPS AND REFERENCES

This chapter states the limitations of the build and of this assessment, the next steps that would reduce the remaining risks, and the conclusion.

## 7.1 Limitations

- **HTTPS.** The local deployment uses HTTP on localhost; a production deployment needs TLS 1.2 or later and `COOKIE_SECURE=1`. The hosted demonstration (`render.yaml`) is served over the host's HTTPS with `COOKIE_SECURE=1`.
- **The hosted demonstration is public.** Its demo accounts and password are published, so anyone with the link can sign in as them, see what other visitors did and trigger the lock-out (risk 13). It holds sample data only and resets on every restart. Only the web server is reachable there; it forwards `/api/*` inside the container, and the API port is not exposed.
- **Shared rate-limit state.** Rate limits and the lock-out live in one process's memory; several instances would need a shared store.
- **Proxy trust.** Behind the web container, client addresses come from `X-Forwarded-For` (`TRUST_PROXY_HEADERS=1`). The local Docker Compose setup also publishes the API port for its `/docs` page, so a direct caller there could spoof that header to evade the per-address limit.
- **External anchor for the hash chain.** Without a published or signed copy of the latest hash, a full replacement of the database would go undetected (risks 10 and 21).
- **Penetration test and automated browser tests.** Neither was done for this build. The screens were checked by hand.
- **Threat signals.** They are pattern rules, and the alerts use fixed thresholds (risks 15 and 20).
- **Supply chain.** There is no software bill of materials and no signature check of dependencies (ASI04).
- **Market data.** The replay history is synthetic and labelled "Illustrative" until licensed series replace it, and the simulated market replays the same history (risk 11).
- **Monitoring loop.** The clock moves prices, not the plan's calendar: horizons and near-term needs do not shrink as simulated time passes. Rebalancing ignores trading costs and taxes, restores the latest executed mix for every holding, and sends no notification to a client who is away (risk 23).

## 7.2 Next Steps

{@tbl:next-steps} lists the next steps, each with the risks it would reduce.

Table: Next steps and the risks they reduce {#tbl:next-steps}
| Next step | Reduces |
|----------------------------------------------|--------------------|
| Serve every deployment over TLS 1.2 or later, with Secure cookies | Risk 7 |
| Unpublish the API port outside local development, so that only the web server is reachable | Risk 13 (address spoofing) |
| Keep rate limits and the lock-out in a shared store | Risk 13 |
| Publish or sign the latest record hash at regular intervals, as an external anchor | Risks 10 and 21 |
| Commission an external penetration test, and add automated browser tests | Risk 6 and all application risks |
| Add a classifier, or the model itself as a second opinion, beside the threat-signal patterns; replace fixed alert thresholds with anomaly detection | Risks 15 and 20; ASI01 |
| Add a software bill of materials and dependency signature checks | ASI04 |
| Replace the synthetic history with licensed market data | Risks 11 and 19 |
| Require a second approver for the switches and the market clock | Risks 16 and 24 |
| Notify clients of drift, and throttle orders in a real deployment | Risks 23 and 25 |

## 7.3 Conclusion

The assessment shows that the permission tiers of Aegis are enforced where the model cannot reach them. The agent can read product data and the logged-in client's own data, and propose allocations that the gate always checks, but it has no tool that can execute an order, act for another client or move the market. Execution needs the client's own quiz, Confirm click and a single-use token. A compliance officer can stop the advisor or execution by hand, and every action of the AI is logged, labelled and traced. The 196 automated tests and the red-team run confirm these properties: none of the 30 attacks placed an order, passed an unsuitable proposal, returned another client's data or put an unsupported number in a final reply.

The 25 known risks are stated with what remains after their controls. Most residual risks concern detection, which relies on pattern rules and on people, and the operational limits of a demonstration, such as the absence of an external anchor for the hash chain and of an external penetration test. These are the first steps for any move from the sandbox towards a real deployment.

## 7.4 References

{{REFERENCES}}
