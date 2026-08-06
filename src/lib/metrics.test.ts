import { describe, it, expect } from 'vitest';
import { summarizeLoop, percent, type MetricsPlan, type MetricsConversation } from './metrics';

const COMPLETE = {
  text: 'coffee at Partners on Wythe saturday morning before the market gets busy, come sit',
  when_date: '2026-08-08',
  when_time_specific: '9:00 AM',
  spot: 'Partners Coffee',
  spots_total: 2,
  cost_expectation: 'free'
};

function plan(id: string, over: Partial<MetricsPlan> = {}): MetricsPlan {
  return {
    id,
    user_id: `host-${id}`,
    created_at: '2026-08-01T12:00:00.000Z',
    status: 'open',
    ...COMPLETE,
    ...over
  } as MetricsPlan;
}

function conv(planId: string, status: string): MetricsConversation {
  return { plan_id: planId, status, created_at: '2026-08-02T12:00:00.000Z' };
}

describe('percent', () => {
  it('rounds, and returns null rather than dividing by zero', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 4)).toBe(0);
    expect(percent(2, 0)).toBeNull();
  });
});

describe('summarizeLoop', () => {
  it('counts only plans that meet the clarity contract as complete', () => {
    const plans = [
      plan('a'),
      plan('b', { when_time_specific: null }),
      plan('c', { cost_expectation: null }),
      plan('d', { spot: null })
    ];
    const summary = summarizeLoop(plans, [], 0, 0);
    expect(summary.completePlans).toBe(1);
    expect(summary.contractRate).toBe(25);
  });

  it('measures the request loop without touching a single message or name', () => {
    const plans = [plan('a'), plan('b'), plan('c')];
    const conversations = [
      conv('a', 'confirmed'),
      conv('a', 'pending'),
      conv('b', 'declined'),
      conv('b', 'withdrawn'),
      conv('c', 'pending')
    ];
    const summary = summarizeLoop(plans, conversations, 0, 0);

    expect(summary.conversations).toBe(5);
    expect(summary.conversationsPerPlan).toBe('1.7');
    expect(summary.plansWithConfirmed).toBe(1);
    // Four requests reached a decision: confirmed, declined, withdrawn, and one
    // still pending is not counted as decided.
    expect(summary.confirmedRate).toBe(percent(1, 5));
    expect(summary.withdrawnRate).toBe(percent(1, 5));
  });

  it('counts a repeat host once they have posted twice', () => {
    const summary = summarizeLoop(
      [plan('a', { user_id: 'maya' }), plan('b', { user_id: 'maya' }), plan('c', { user_id: 'theo' })],
      [],
      0,
      0
    );
    expect(summary.repeatHosts).toBe(1);
  });

  it('passes the guardrail counts straight through', () => {
    const summary = summarizeLoop([plan('a')], [], 3, 7);
    expect(summary.blocks).toBe(3);
    expect(summary.reports).toBe(7);
  });

  it('says nothing rather than zero when there is no activity at all', () => {
    const summary = summarizeLoop([], [], 0, 0);
    expect(summary.contractRate).toBeNull();
    expect(summary.confirmedRate).toBeNull();
    expect(summary.withdrawnRate).toBeNull();
    expect(summary.conversationsPerPlan).toBeNull();
  });

  it('returns counts only, never an id or any user text', () => {
    const summary = summarizeLoop([plan('a')], [conv('a', 'confirmed')], 0, 0);
    // The key names describe the counts; the values are what could leak.
    const values = JSON.stringify(Object.values(summary));
    for (const value of Object.values(summary)) {
      expect(value === null || typeof value === 'number' || typeof value === 'string').toBe(true);
      if (typeof value === 'string') expect(value).toMatch(/^[\d.]+$/);
    }
    expect(values).not.toMatch(/host-|coffee|Partners|2026-/i);
  });
});
