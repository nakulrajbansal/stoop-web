/**
 * Aggregate measures for the private /admin/metrics board.
 *
 * Counts only. Nothing here takes a name, a plan text, a message, a location,
 * a plan id or a conversation id anywhere near an output value, and none of it
 * goes to a third party: the board is server rendered behind the ADMIN_USER_ID
 * gate, and /admin is not on the analytics allowlist.
 *
 * Pure, so the arithmetic can be tested without a database.
 */
import { planMeetsContract } from '@/lib/plan-contract';

export type MetricsPlan = {
  id: string;
  user_id: string;
  created_at: string;
  status: string;
  text: string | null;
  when_date: string | null;
  when_time_specific: string | null;
  spot: string | null;
  spots_total: number | null;
  cost_expectation: string | null;
};

export type MetricsConversation = {
  plan_id: string;
  status: string;
  created_at: string;
};

export type LoopSummary = {
  plans: number;
  completePlans: number;
  contractRate: number | null;
  conversations: number;
  conversationsPerPlan: string | null;
  plansWithConfirmed: number;
  confirmedRate: number | null;
  withdrawnRate: number | null;
  repeatHosts: number;
  blocks: number;
  reports: number;
};

export function percent(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

export function summarizeLoop(
  plans: readonly MetricsPlan[],
  conversations: readonly MetricsConversation[],
  blocks: number,
  reports: number
): LoopSummary {
  const completePlans = plans.filter(p => planMeetsContract(p)).length;

  const confirmed = conversations.filter(c => c.status === 'confirmed');
  const withdrawn = conversations.filter(c => c.status === 'withdrawn');
  const plansWithConfirmed = new Set(confirmed.map(c => c.plan_id)).size;

  const perHost = new Map<string, number>();
  for (const p of plans) perHost.set(p.user_id, (perHost.get(p.user_id) ?? 0) + 1);

  return {
    plans: plans.length,
    completePlans,
    contractRate: percent(completePlans, plans.length),
    conversations: conversations.length,
    conversationsPerPlan: plans.length > 0 ? (conversations.length / plans.length).toFixed(1) : null,
    plansWithConfirmed,
    confirmedRate: percent(confirmed.length, conversations.length),
    withdrawnRate: percent(withdrawn.length, conversations.length),
    repeatHosts: [...perHost.values()].filter(n => n >= 2).length,
    blocks,
    reports
  };
}
