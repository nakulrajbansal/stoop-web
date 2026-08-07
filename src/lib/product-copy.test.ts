import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  BROWSE_CONTRACT,
  CONTRACT_STEPS,
  CONTRACT_QUESTIONS,
  CONTRACT_FAQ,
  MESSAGING_NOT_A_RESERVATION,
  HOST_REVIEWS_REQUESTS,
  SIGNUP_REASON,
  planMessageCta,
  emptyNeighborhoodCopy,
  openPlanCount,
  FEED_ERROR_HEADLINE,
  FEED_ERROR_BODY,
  FEED_ERROR_RETRY,
  PRODUCT_COPY_STRINGS
} from './product-copy';

describe('the contract a visitor reads before signing up', () => {
  it('states the whole sequence in one paragraph', () => {
    expect(BROWSE_CONTRACT).toBe(
      'Browse plans and hosts without an account. Sign up only when you want to post or message. Messaging starts a private conversation; the host chooses who joins.'
    );
  });

  it('breaks the sequence into four steps, browsing first and the roster last', () => {
    expect(CONTRACT_STEPS).toHaveLength(4);
    expect(CONTRACT_STEPS[0].title).toMatch(/browse/i);
    expect(CONTRACT_STEPS[0].body).toMatch(/without an account/i);
    expect(CONTRACT_STEPS[1].body).toMatch(/message/i);
    expect(CONTRACT_STEPS[2].body).toMatch(/host (chooses|decides)/i);
    expect(CONTRACT_STEPS[3].body).toMatch(/confirmed/i);
  });

  it('answers the six questions a first time visitor actually has', () => {
    expect(CONTRACT_QUESTIONS).toHaveLength(6);
    const questions = CONTRACT_QUESTIONS.map(q => q.q.toLowerCase()).join(' ');
    expect(questions).toMatch(/what is this/);
    expect(questions).toMatch(/what will i see/);
    expect(questions).toMatch(/what happens when i message/);
    expect(questions).toMatch(/who decides/);
    expect(questions).toMatch(/who can see the group/);
    expect(questions).toMatch(/change my mind/);
  });

  it('adds the three FAQ entries the homepage was missing', () => {
    const questions = CONTRACT_FAQ.map(f => f.q);
    expect(questions).toContain('Can I browse before signing up?');
    expect(questions).toContain('Can I see who I would meet?');
    expect(questions).toContain('Does messaging reserve a spot?');
    const reserve = CONTRACT_FAQ.find(f => f.q === 'Does messaging reserve a spot?');
    expect(reserve?.a).toMatch(/^No\./);
  });

  it('never describes a message as acceptance', () => {
    expect(MESSAGING_NOT_A_RESERVATION).toBe(
      'Messaging starts a private conversation. The host confirms the spot.'
    );
    expect(HOST_REVIEWS_REQUESTS).toMatch(/reviews each requester/i);
  });

  it('explains what signup is for, and what stays private', () => {
    expect(SIGNUP_REASON).toMatch(/post or message/i);
    expect(SIGNUP_REASON).toMatch(/email/i);
  });

  it('no longer says a phone number is the price of an account', () => {
    // Three doors now. A line that still reads "we ask for a phone number"
    // contradicts the two buttons directly above it, and the contradiction is
    // on the one screen where a visitor is deciding whether to trust us.
    expect(SIGNUP_REASON).not.toMatch(/we ask for a phone/i);
    expect(SIGNUP_REASON).not.toMatch(/(need|require|requires|must have)[^.]{0,30}phone/i);
  });

  it('names all three ways in, so the copy matches the buttons', () => {
    expect(SIGNUP_REASON).toMatch(/google/i);
    expect(SIGNUP_REASON).toMatch(/apple/i);
    expect(SIGNUP_REASON).toMatch(/phone/i);
  });

  it('still states the privacy fact, and states it accurately', () => {
    // "Neither is ever shown" was true when there were exactly two things. It
    // has to stay true now that an account may have a phone, an email, or both.
    expect(SIGNUP_REASON).toMatch(/never shown|not shown|never shows/i);
    expect(SIGNUP_REASON).not.toMatch(/\bneither\b/i);
  });
});

describe('the plan page call to action', () => {
  it('names the host and says a message is not a reservation', () => {
    expect(planMessageCta('Maya')).toBe(
      'Create an account to message Maya. Messaging does not reserve a spot.'
    );
  });

  it('stays grammatical when the host name is missing', () => {
    expect(planMessageCta('')).toBe(
      'Create an account to message the host. Messaging does not reserve a spot.'
    );
  });
});

describe('honest availability', () => {
  it('says the neighborhood is early rather than pretending it is busy', () => {
    expect(emptyNeighborhoodCopy()).toBe(
      'Stoop is early in this neighborhood. There are no open plans this week. You can browse without an account or post a real plan you are already doing.'
    );
    expect(emptyNeighborhoodCopy('Williamsburg')).toBe(
      'Stoop is early in Williamsburg. There are no open plans this week. You can browse without an account or post a real plan you are already doing.'
    );
  });

  it('keeps the outage copy well away from the zero supply copy', () => {
    expect(FEED_ERROR_HEADLINE).toMatch(/not loading/i);
    expect(FEED_ERROR_BODY).toMatch(/not a sign that the neighborhood is empty/i);
    expect(FEED_ERROR_RETRY).toBe('Try again');
    // It must not borrow the words we use for a genuinely empty board.
    for (const value of [FEED_ERROR_HEADLINE, FEED_ERROR_BODY]) {
      expect(value).not.toMatch(/no open plans/i);
      expect(value).not.toMatch(/Stoop is early/i);
      expect(value).not.toMatch(/this week/i);
    }
    // And it is part of the copy set the house style scan covers.
    expect(PRODUCT_COPY_STRINGS).toContain(FEED_ERROR_BODY);
  });

  it('counts real open plans and never counts samples', () => {
    expect(openPlanCount(0)).toBe('No open plans');
    expect(openPlanCount(1)).toBe('1 open plan');
    expect(openPlanCount(4)).toBe('4 open plans');
  });

  it('says so when the number is a filtered one', () => {
    expect(openPlanCount(4, 'coffee')).toBe('4 open coffee plans');
    expect(openPlanCount(1, 'coffee')).toBe('1 open coffee plan');
    expect(openPlanCount(0, 'coffee')).toBe('No open coffee plans');
    expect(openPlanCount(4, null)).toBe('4 open plans');
  });
});

// Everything under src, tests included. A test that needs to search for the
// character writes it as an escape, which is the only form the house rule
// allows and the only form this scan does not object to.
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('house style', () => {
  it('uses no em dashes in any product string', () => {
    for (const value of PRODUCT_COPY_STRINGS) {
      expect(value).not.toMatch(/\u2014/);
    }
  });

  it('uses no em dashes anywhere in src, tests included', () => {
    const offenders = walk(join(process.cwd(), 'src')).filter(file =>
      readFileSync(file, 'utf8').includes('\u2014')
    );
    expect(offenders).toEqual([]);
  });
});
