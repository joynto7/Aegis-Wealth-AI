/**
 * API types for Aegis Wealth AI (Section 2.6), generated from the backend's
 * OpenAPI file and never written by hand (NFR-5.2).
 *
 *   cd backend && python scripts/export_openapi.py   # -> backend/openapi.json
 *   cd frontend && npm run gen:types                 # -> src/lib/api-types.ts
 *
 * This module only gives the generated schemas their contract names, so
 * screens import `Profile`, not `components["schemas"]["Profile"]`.
 */

import type { components } from "./api-types";

type Schemas = components["schemas"];

// ---------------------------------------------------------------------------
// 2.6.3 Fixed values
// ---------------------------------------------------------------------------

export type UserRole = Schemas["User"]["role"];
export type ProfileStatus = Schemas["Profile"]["status"];
export type ProposalStatus = Schemas["Proposal"]["status"];
export type GateDecision = Schemas["GateResult"]["decision"];
export type RuleType = Schemas["GateRule"]["type"];
export type RuleResult = Schemas["GateRule"]["result"];
export type ReplayReaction = Schemas["ReplayReactionRequest"]["reaction"];
export type ProductType = Schemas["Product"]["type"];
export type AssetClass = Schemas["Product"]["asset_class"];
export type ChatMode = Schemas["ChatReply"]["mode"];
export type ChatGrounding = Schemas["ChatReply"]["grounding"];
export type LogActor = Schemas["LogEntry"]["actor"];
export type LogDecision = Schemas["ToolCallSummary"]["decision"];
export type OrderStatus = Schemas["Order"]["status"];

// ---------------------------------------------------------------------------
// 2.6.2 Error format
// ---------------------------------------------------------------------------

export type ErrorCode = Schemas["ApiErrorDetail"]["code"];
export type ApiErrorBody = Schemas["ApiErrorBody"];

// ---------------------------------------------------------------------------
// Response and request bodies
// ---------------------------------------------------------------------------

export type User = Schemas["User"];
export type QuestionOption = Schemas["QuestionOption"];
export type Question = Schemas["Question"];
export type Questionnaire = Schemas["Questionnaire"];
export type Contradiction = Schemas["Contradiction"];
export type ProfileReplay = Schemas["ProfileReplay"];
export type Profile = Schemas["Profile"];
export type ReplayEpisodeSummary = Schemas["ReplayEpisodeSummary"];
export type ReplayPoint = Schemas["ReplayPoint"];
export type ReplayResult = Schemas["ReplayResult"];
export type ReplayEvent = Schemas["ReplayEvent"];
export type Product = Schemas["Product"];
export type CompareItem = Schemas["CompareItem"];
export type CompareResult = Schemas["CompareResult"];
export type ProposalItem = Schemas["ProposalItem"];
export type ProposalMetrics = Schemas["ProposalMetrics"];
export type StressContribution = Schemas["StressContribution"];
export type StressResult = Schemas["StressResult"];
export type GateRule = Schemas["GateRule"];
export type GateResult = Schemas["GateResult"];
export type Proposal = Schemas["Proposal"];
export type ProposalSummary = Schemas["ProposalSummary"];
export type QuizQuestion = Schemas["QuizQuestion"];
export type QuizResult = Schemas["QuizResult"];
export type ToolCallSummary = Schemas["ToolCallSummary"];
export type Citation = Schemas["Citation"];
export type NumberSource = Schemas["NumberSource"];
export type RuleBasis = Schemas["RuleBasis"];
export type ProductsCard = Schemas["ProductsCard"];
export type ComparisonCard = Schemas["ComparisonCard"];
export type ProposalCard = Schemas["ProposalCard"];
export type RuleCard = Schemas["RuleCard"];
export type ProfileCard = Schemas["ProfileCard"];
export type BlockedCard = Schemas["BlockedCard"];
export type ChatCard = NonNullable<Schemas["ChatReply"]["cards"]>[number];
export type ChatMessage = Schemas["ChatMessage"];
export type ChatReply = Schemas["ChatReply"];
export type Order = Schemas["Order"];
export type Position = Schemas["Position"];
export type SandboxAccount = Schemas["SandboxAccount"];
export type ConfirmTokenResponse = Schemas["ConfirmTokenResponse"];
export type ExecuteResponse = Schemas["ExecuteResponse"];
export type RecordSummary = Schemas["RecordSummary"];
export type AdviceRecord = Schemas["AdviceRecord"];
export type VerifyResult = Schemas["VerifyResult"];
export type LogEntry = Schemas["LogEntry"];
export type Rule = Schemas["Rule"];
export type HealthStatus = Schemas["HealthStatus"];

// ---------------------------------------------------------------------------
// Additions: compliance controls, oversight, regulations, model disclosure
// ---------------------------------------------------------------------------

export type ControlName = Schemas["ControlChange"]["control"];
export type ControlStateValue = Schemas["ControlState"]["state"];
export type ControlState = Schemas["ControlState"];
export type Controls = Schemas["Controls"];
export type AgentTurn = Schemas["AgentTurn"];
export type OversightKpis = Schemas["OversightKpis"];
export type Oversight = Schemas["Oversight"];
export type AiControl = Schemas["AiControl"];
export type Framework = Schemas["Framework"];
export type Regulations = Schemas["Regulations"];
export type ModelCard = Schemas["ModelCard"];
