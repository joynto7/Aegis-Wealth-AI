/**
 * disclosures.json — risk disclosure texts shown on the Confirm screen and
 * stored (id and version) in the advice record (Section 2.5.1). The API
 * contract has no disclosures endpoint, so the texts ship with the client.
 */
export interface Disclosure {
  id: string;
  version: string;
  title: string;
  text: string;
}

export const DISCLOSURES: Disclosure[] = [
  {
    id: "DISC-01",
    version: "2026-01",
    title: "This is a simulation",
    text: "All products, prices and market data in Aegis are sample or hypothetical data for demonstration only. No real money, brokerage connection or live market data is involved. Orders placed here are simulated in a sandbox account.",
  },
  {
    id: "DISC-02",
    version: "2026-01",
    title: "Value can go down as well as up",
    text: "The value of any investment can fall as well as rise. Historical and stress-test figures describe the past or a hypothetical scenario; they are not a promise or prediction of future returns.",
  },
  {
    id: "DISC-03",
    version: "2026-01",
    title: "This proposal passed a suitability check",
    text: "The compliance gate checked this proposal against your risk tier and the rules in force. A PASS or an acknowledged WARNING means no hard rule was broken — it does not remove the risk of loss.",
  },
];
