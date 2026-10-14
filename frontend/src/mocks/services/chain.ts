import { db } from "@/mocks/db";
import { nextHash, GENESIS_HASH } from "@/mocks/engines/chain";
import { SEED_USERS } from "@/mocks/data/users";
import type { VerifyResult } from "@/lib/types";

/** Recomputes one client's chain and reports the first record that fails to verify. */
export async function verifyUserChain(userId: number): Promise<{ checked: number; brokenId: number | null }> {
  const records = [...db.recordsFor(userId)].sort((a, b) => a.id - b.id);
  let prev = GENESIS_HASH;
  let checked = 0;
  for (const record of records) {
    const recomputed = await nextHash(prev, record.content);
    checked += 1;
    if (recomputed !== record.hash) {
      return { checked, brokenId: record.id };
    }
    prev = record.hash;
  }
  return { checked, brokenId: null };
}

export async function verifyChain(scope: "mine" | "all", userId: number, isCompliance: boolean): Promise<VerifyResult> {
  const userIds = scope === "all" && isCompliance ? SEED_USERS.filter((u) => u.role === "client").map((u) => u.id) : [userId];
  let totalChecked = 0;
  for (const uid of userIds) {
    const { checked, brokenId } = await verifyUserChain(uid);
    totalChecked += checked;
    if (brokenId !== null) {
      return { valid: false, checked: totalChecked, broken_record_id: brokenId };
    }
  }
  return { valid: true, checked: totalChecked, broken_record_id: null };
}
