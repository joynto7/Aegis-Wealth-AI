"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { API_MOCK } from "@/lib/api-mode";
import { clearSessionToken, getSessionToken, setSessionToken } from "@/lib/session-token";
import type {
  AdviceRecord,
  ChatMessage,
  CompareResult,
  ConfirmTokenResponse,
  ExecuteResponse,
  GateResult,
  HealthStatus,
  LogEntry,
  Order,
  Product,
  Profile,
  Proposal,
  ProposalSummary,
  Questionnaire,
  QuizQuestion,
  QuizResult,
  RecordSummary,
  ReplayEpisodeSummary,
  ReplayResult,
  Rule,
  SandboxAccount,
  User,
  VerifyResult,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function useMe() {
  return useQuery<User>({
    queryKey: ["me"],
    queryFn: async () => (await api.get<{ user: User }>("/auth/me")).user,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api.post<{ user: User; session_token?: string; expires_at?: string }>("/auth/login", body),
    onSuccess: (data) => {
      // Only the mock layer returns the token; the real backend sets the httpOnly cookie instead.
      if (data.session_token) setSessionToken(data.session_token);
      qc.setQueryData(["me"], data.user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>("/auth/logout"),
    onSuccess: () => {
      clearSessionToken();
      qc.clear();
    },
  });
}

// ---------------------------------------------------------------------------
// Risk profiling
// ---------------------------------------------------------------------------

export function useQuestionnaire() {
  return useQuery<Questionnaire>({
    queryKey: ["questionnaire"],
    queryFn: () => api.get<Questionnaire>("/profile/questionnaire"),
  });
}

export function useCurrentProfile() {
  return useQuery<Profile | null>({
    queryKey: ["profile", "current"],
    queryFn: async () => {
      try {
        return await api.get<Profile>("/profile/current");
      } catch (e) {
        if (e instanceof ApiError && e.code === "NOT_FOUND") return null;
        throw e;
      }
    },
  });
}

export function useSubmitProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (answers: Record<string, string>) => api.post<Profile>("/profile", { answers }),
    onSuccess: (profile) => {
      qc.setQueryData(["profile", "current"], profile);
      qc.invalidateQueries({ queryKey: ["proposals"] });
      toast.success(
        profile.status === "complete"
          ? `Risk profile saved: tier ${profile.tier}.`
          : "Risk profile saved. Fix the flagged answers to continue."
      );
    },
  });
}

export function useReplayEpisodes() {
  return useQuery<{ episodes: ReplayEpisodeSummary[] }>({
    queryKey: ["replay", "episodes"],
    queryFn: () => api.get("/replay/episodes"),
  });
}

export function useReplay(episodeId: string | null) {
  return useQuery<ReplayResult>({
    queryKey: ["replay", episodeId],
    queryFn: () => api.get<ReplayResult>(`/replay/${episodeId}`),
    enabled: !!episodeId,
  });
}

export function useReplayReaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { episode_id: string; reaction: string }) =>
      api.post<Profile>("/profile/current/replay-reaction", body),
    onSuccess: (profile) => {
      qc.setQueryData(["profile", "current"], profile);
      toast.success("Your reaction was saved.");
    },
  });
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export function useProducts(filters: { type?: string; max_risk?: number; q?: string }) {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.max_risk) params.set("max_risk", String(filters.max_risk));
  if (filters.q) params.set("q", filters.q);
  const qs = params.toString();
  return useQuery<{ items: Product[] }>({
    queryKey: ["products", filters],
    queryFn: () => api.get(`/products${qs ? `?${qs}` : ""}`),
  });
}

export function useProduct(code: string | null) {
  return useQuery<Product>({
    queryKey: ["products", code],
    queryFn: () => api.get<Product>(`/products/${code}`),
    enabled: !!code,
  });
}

export function useCompareProducts() {
  return useMutation({
    mutationFn: (body: { product_codes: string[]; amount: number; horizon_years: number }) =>
      api.post<CompareResult>("/products/compare", body),
  });
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

export function useProposals() {
  return useQuery<{ items: ProposalSummary[] }>({
    queryKey: ["proposals"],
    queryFn: () => api.get("/proposals"),
  });
}

export function useProposal(id: number | null) {
  return useQuery<Proposal>({
    queryKey: ["proposals", id],
    queryFn: () => api.get<Proposal>(`/proposals/${id}`),
    enabled: !!id,
  });
}

export function useCreateProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { amount: number; horizon_years: number; near_term_need: number }) =>
      api.post<Proposal>("/proposals", body),
    onSuccess: (proposal) => {
      qc.setQueryData(["proposals", proposal.id], proposal);
      qc.invalidateQueries({ queryKey: ["proposals"] });
      toast.success(`Proposal #${proposal.id} created. The gate returned ${proposal.gate.decision}.`);
    },
  });
}

export function useReviseProposal(proposalId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: { product_code: string; weight_pct: number }[]) =>
      api.post<Proposal>(`/proposals/${proposalId}/revise`, { items }),
    onSuccess: (proposal) => {
      qc.setQueryData(["proposals", proposal.id], proposal);
      qc.invalidateQueries({ queryKey: ["proposals"] });
      toast.success(`Version ${proposal.version} saved. The gate returned ${proposal.gate.decision}.`);
    },
  });
}

export function useAcknowledgeWarnings(proposalId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleIds: string[]) => api.post<Proposal>(`/proposals/${proposalId}/acknowledge`, { rule_ids: ruleIds }),
    onSuccess: (proposal) => {
      qc.setQueryData(["proposals", proposal.id], proposal);
      toast.success("Warnings acknowledged.");
    },
  });
}

export function useQuiz(proposalId: number | null) {
  return useQuery<{ questions: QuizQuestion[] }>({
    queryKey: ["proposals", proposalId, "quiz"],
    queryFn: () => api.get(`/proposals/${proposalId}/quiz`),
    enabled: !!proposalId,
  });
}

export function useSubmitQuiz(proposalId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (answers: Record<string, string>) => api.post<QuizResult>(`/proposals/${proposalId}/quiz`, { answers }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["proposals", proposalId] });
      if (result.passed) toast.success("Quiz passed.");
    },
  });
}

export function useConfirmProposal(proposalId: number) {
  return useMutation({
    mutationFn: () => api.post<ConfirmTokenResponse>(`/proposals/${proposalId}/confirm`),
  });
}

export function useExecuteProposal(proposalId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      api.post<ExecuteResponse>(`/proposals/${proposalId}/execute`, undefined, { "X-Confirm-Token": token }),
    onSuccess: (result) => {
      toast.success(`${result.orders.length} orders filled. Advice record #${result.record_id} created.`);
      qc.invalidateQueries({ queryKey: ["proposals"] });
      qc.invalidateQueries({ queryKey: ["sandbox"] });
      qc.invalidateQueries({ queryKey: ["records"] });
    },
  });
}

export function exposeGate(proposal: Proposal | undefined): GateResult | undefined {
  return proposal?.gate;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export function useChatHistory() {
  return useQuery<{ items: ChatMessage[] }>({
    queryKey: ["chat", "history"],
    queryFn: () => api.get("/chat/history"),
  });
}

// ---------------------------------------------------------------------------
// Sandbox
// ---------------------------------------------------------------------------

export function useSandboxAccount() {
  return useQuery<SandboxAccount>({
    queryKey: ["sandbox", "account"],
    queryFn: () => api.get("/sandbox/account"),
  });
}

export function useSandboxOrders() {
  return useQuery<{ items: Order[] }>({
    queryKey: ["sandbox", "orders"],
    queryFn: () => api.get("/sandbox/orders"),
  });
}

// ---------------------------------------------------------------------------
// Records and audit
// ---------------------------------------------------------------------------

export function useRecords() {
  return useQuery<{ items: RecordSummary[] }>({
    queryKey: ["records"],
    queryFn: () => api.get("/records"),
  });
}

export function useRecord(id: number | null) {
  return useQuery<AdviceRecord>({
    queryKey: ["records", id],
    queryFn: () => api.get<AdviceRecord>(`/records/${id}`),
    enabled: !!id,
  });
}

export function useVerifyChain() {
  return useMutation({
    mutationFn: (scope: "mine" | "all") => api.post<VerifyResult>("/records/verify", { scope }),
  });
}

export function useLogs(filters: { actor?: string; action?: string; decision?: string; limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.action) params.set("action", filters.action);
  if (filters.decision) params.set("decision", filters.decision);
  params.set("limit", String(filters.limit ?? 50));
  params.set("offset", String(filters.offset ?? 0));
  return useQuery<{ items: LogEntry[]; total: number }>({
    queryKey: ["logs", filters],
    queryFn: () => api.get(`/logs?${params.toString()}`),
  });
}

export function useComplianceRules() {
  return useQuery<{ items: Rule[] }>({
    queryKey: ["compliance", "rules"],
    queryFn: () => api.get("/compliance/rules"),
  });
}

export function useHealth() {
  return useQuery<HealthStatus>({ queryKey: ["health"], queryFn: () => api.get("/health") });
}

export async function downloadLogsExport(format: "json" | "csv") {
  // Goes through fetch directly (the body is a file, not JSON), so it must
  // carry the session itself, like ApiClient does.
  const token = API_MOCK ? getSessionToken() : null;
  const res = await fetch(`/api/logs/export?format=${format}`, {
    headers: token ? { "X-Aegis-Session": token } : undefined,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(res.status, (body?.error?.code as never) ?? "INTERNAL", body?.error?.message ?? "The export failed.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `operation_log.${format}`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Operation log exported as ${format.toUpperCase()}.`);
}
