"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { API_MOCK } from "@/lib/api-mode";
import { clearSessionToken, getSessionToken, setSessionToken } from "@/lib/session-token";
import type {
  AdviceRecord,
  ChatMessage,
  ChatRating,
  Goal,
  GoalInput,
  Insights,
  PortfolioAnalytics,
  Projection,
  ProjectionRequest,
  ProposalPreview,
  Remedy,
  ReviewQueue,
  TurnDetail,
  CompareResult,
  ConfirmTokenResponse,
  ControlName,
  Controls,
  ControlStateValue,
  ModelCard,
  Oversight,
  Regulations,
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

export function useReplay(episodeId: string | null, amount = 100000) {
  return useQuery<ReplayResult>({
    queryKey: ["replay", episodeId, amount],
    queryFn: () => api.get<ReplayResult>(`/replay/${episodeId}${amount === 100000 ? "" : `?amount=${amount}`}`),
    enabled: !!episodeId,
    placeholderData: (previous) => previous,
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
      qc.invalidateQueries({ queryKey: ["insights"] });
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
      qc.invalidateQueries({ queryKey: ["insights"] });
      qc.invalidateQueries({ queryKey: ["remedy"] });
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
      qc.invalidateQueries({ queryKey: ["insights"] });
    },
  });
}

/**
 * A dry run of a revision (addition): the engines and the gate on the weights being edited, nothing saved.
 * Keeps the previous result on screen while the next one computes, so the what-if lab never flickers.
 */
export function usePreview(proposalId: number, items: { product_code: string; weight_pct: number }[] | null) {
  return useQuery<ProposalPreview>({
    queryKey: ["preview", proposalId, items],
    queryFn: () => api.post<ProposalPreview>(`/proposals/${proposalId}/preview`, { items }),
    enabled: !!items && items.length > 0,
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });
}

/** How to fix (addition): the smallest change that passes the gate. */
export function useRemedy(proposalId: number | null, enabled = true) {
  return useQuery<Remedy>({
    queryKey: ["remedy", proposalId],
    queryFn: () => api.get<Remedy>(`/proposals/${proposalId}/remedy`),
    enabled: !!proposalId && enabled,
    retry: false,
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

/** Rate a reply (addition). A thumbs-down flags the turn for compliance review. */
export function useChatFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { message_id: number; rating: ChatRating; reason?: string }) =>
      api.post<{ message_id: number; rating: ChatRating }>("/chat/feedback", body),
    onSuccess: (result) => {
      qc.setQueryData<{ items: ChatMessage[] }>(["chat", "history"], (old) =>
        old
          ? { items: old.items.map((m) => (m.message_id === result.message_id ? { ...m, feedback: result.rating } : m)) }
          : old
      );
      toast.success(
        result.rating === "down" ? "Thanks. The compliance team will review this answer." : "Thanks for the feedback."
      );
    },
  });
}

// ---------------------------------------------------------------------------
// Planning (additions): projections, goals, briefing, live-portfolio analytics
// ---------------------------------------------------------------------------

/** A seeded Monte Carlo projection; the same inputs always give the same answer, so it caches by its inputs. */
export function useProjection(body: ProjectionRequest | null) {
  return useQuery<Projection>({
    queryKey: ["projection", body],
    queryFn: () => api.post<Projection>("/projections", body),
    enabled: !!body,
    placeholderData: (previous) => previous,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useGoal() {
  return useQuery<Goal | null>({
    queryKey: ["goal"],
    queryFn: async () => (await api.get<{ goal: Goal | null }>("/goals/current")).goal,
  });
}

export function useSetGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GoalInput) => api.put<{ goal: Goal | null }>("/goals/current", body),
    onSuccess: (data) => {
      qc.setQueryData(["goal"], data.goal);
      qc.invalidateQueries({ queryKey: ["insights"] });
      toast.success(`Goal saved: ${data.goal?.name}. Your dashboard now tracks it.`);
    },
  });
}

export function useInsights() {
  return useQuery<Insights>({
    queryKey: ["insights"],
    queryFn: () => api.get<Insights>("/insights"),
  });
}

export function usePortfolioAnalytics() {
  return useQuery<PortfolioAnalytics>({
    queryKey: ["sandbox", "analytics"],
    queryFn: () => api.get<PortfolioAnalytics>("/sandbox/analytics"),
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

// ---------------------------------------------------------------------------
// Compliance controls and oversight (additions)
// ---------------------------------------------------------------------------

/** The two compliance switches. Clients see their state, not the reason; checked every 15 s. */
export function useControls(enabled = true) {
  return useQuery<Controls>({
    queryKey: ["controls"],
    queryFn: () => api.get<Controls>("/controls"),
    refetchInterval: 15_000,
    enabled,
  });
}

export function useSetControl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { control: ControlName; state: ControlStateValue; reason: string }) =>
      api.post<Controls>("/compliance/controls", body),
    onSuccess: (controls, body) => {
      qc.setQueryData(["controls"], controls);
      qc.invalidateQueries({ queryKey: ["oversight"] });
      qc.invalidateQueries({ queryKey: ["logs"] });
      const verb: Record<ControlStateValue, string> = {
        suspended: "AI advisor suspended",
        active: "AI advisor resumed",
        halted: "Order execution halted",
        open: "Order execution resumed",
      };
      toast.success(`${verb[body.state]}. The change is in the operation log.`);
    },
  });
}

/** The Control Room's live view: counts and the latest agent turns, refreshed every 3 s. */
export function useOversight() {
  return useQuery<Oversight>({
    queryKey: ["oversight"],
    queryFn: () => api.get<Oversight>("/compliance/overview"),
    refetchInterval: 3_000,
  });
}

/** Flagged AI turns for human review (addition), refreshed with the Control Room. */
export function useReviews(status: "open" | "resolved" | "all" = "open") {
  return useQuery<ReviewQueue>({
    queryKey: ["reviews", status],
    queryFn: () => api.get<ReviewQueue>(`/compliance/reviews?status=${status}`),
    refetchInterval: 5_000,
  });
}

export function useTurn(logId: number | null) {
  return useQuery<TurnDetail>({
    queryKey: ["turn", logId],
    queryFn: () => api.get<TurnDetail>(`/compliance/turns/${logId}`),
    enabled: !!logId,
  });
}

export function useDecideReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { log_id: number; decision: "cleared" | "escalated"; note: string }) =>
      api.post<TurnDetail>(`/compliance/reviews/${body.log_id}`, { decision: body.decision, note: body.note }),
    onSuccess: (turn) => {
      qc.setQueryData(["turn", turn.log_id], turn);
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["oversight"] });
      toast.success(`Turn ${turn.status === "cleared" ? "cleared" : "escalated"}. The decision is in the operation log.`);
    },
  });
}

export function useRegulations() {
  return useQuery<Regulations>({
    queryKey: ["regulations"],
    queryFn: () => api.get<Regulations>("/compliance/regulations"),
    staleTime: Infinity,
  });
}

/** Fetches the model disclosure (logged by the server) and saves it as a JSON file. */
export async function downloadModelCard(): Promise<ModelCard> {
  const card = await api.get<ModelCard>("/compliance/model-card");
  const blob = new Blob([JSON.stringify(card, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `aegis_model_disclosure_${card.generated_at.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("Model disclosure downloaded. The export is in the operation log.");
  return card;
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
