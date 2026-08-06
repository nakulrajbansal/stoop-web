/**
 * A button that swaps its label for a spinner has no accessible name while the
 * request is in flight, so a screen reader user who navigates back to it hears
 * nothing. This scans the action surfaces this release owns and fails if the
 * label is ever replaced rather than accompanied.
 *
 * Scope is deliberate: these are the files the uncertainty release touches.
 * Older surfaces have the same pattern and are left for their own change.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ACTION_SURFACES = [
  'src/app/inbox/[id]/page.tsx',
  'src/app/plan/[slug]/PlanDetailClient.tsx',
  'src/app/plan/[slug]/edit/page.tsx',
  'src/app/post/page.tsx'
];

const source = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

describe('action buttons keep their name while busy', () => {
  it('never renders a spinner in place of the label', () => {
    const offenders: string[] = [];
    for (const file of ACTION_SURFACES) {
      source(file).split('\n').forEach((line, index) => {
        // `{busy ? <span className="spinner" /> : 'Accept'}` and its mirror.
        if (/[?:]\s*<span className="spinner"/.test(line)) offenders.push(`${file}:${index + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('marks a busy control with aria-busy wherever a spinner is shown', () => {
    for (const file of ACTION_SURFACES) {
      const text = source(file);
      if (!text.includes('className="spinner"')) continue;
      expect(text, `${file} shows a spinner without aria-busy`).toMatch(/aria-busy=/);
    }
  });

  it('hides the spinner itself from assistive technology', () => {
    for (const file of ACTION_SURFACES) {
      const text = source(file);
      const spinners = text.match(/<span className="spinner"[^>]*\/>/g) ?? [];
      for (const spinner of spinners) {
        expect(spinner, `${file}: ${spinner}`).toMatch(/aria-hidden/);
      }
    }
  });
});
