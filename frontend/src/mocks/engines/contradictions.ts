import type { Contradiction } from "@/lib/types";
import type { Answers } from "./scoring";

/** Three contradiction rules (Section 2.5.2). */
export function checkContradictions(answers: Answers): Contradiction[] {
  const out: Contradiction[] = [];
  const highGrowth = answers.W3 === "d" || answers.W5 === "d";

  // X1: (W3=d or W5=d) and C2=a
  if (highGrowth && answers.C2 === "a") {
    out.push({
      id: "X1",
      message: "You chose high growth but need the money within a year.",
      question_ids: ["W3", "W5", "C2"],
    });
  }
  // X2: W4=a and (W3=d or W5=d)
  if (answers.W4 === "a" && highGrowth) {
    out.push({
      id: "X2",
      message: "You want maximum growth but can accept at most a 5% loss.",
      question_ids: ["W4", "W3", "W5"],
    });
  }
  // X3: W1=d and W4=a
  if (answers.W1 === "d" && answers.W4 === "a") {
    out.push({
      id: "X3",
      message: "You would buy more after a 20% fall, but can accept at most a 5% loss.",
      question_ids: ["W1", "W4"],
    });
  }
  return out;
}
