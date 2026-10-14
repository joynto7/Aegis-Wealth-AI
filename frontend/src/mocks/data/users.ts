import type { User } from "@/lib/types";

/** Seeded demo accounts (Section 1.3.1 FR-1.4). Demo password for all: see DEMO_PASSWORD. */
export const DEMO_PASSWORD = "password123";

export interface SeededUser extends User {
  password: string;
}

export const SEED_USERS: SeededUser[] = [
  { id: 1, email: "officer@example.com", role: "compliance", display_name: "Amara (Compliance)", password: DEMO_PASSWORD },
  { id: 2, email: "rina@example.com", role: "client", display_name: "Rina", password: DEMO_PASSWORD },
  { id: 3, email: "chen@example.com", role: "client", display_name: "Chen", password: DEMO_PASSWORD },
];

export function findUserByEmail(email: string): SeededUser | undefined {
  return SEED_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export function findUserById(id: number): SeededUser | undefined {
  return SEED_USERS.find((u) => u.id === id);
}
