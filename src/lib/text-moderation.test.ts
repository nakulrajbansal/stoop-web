import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SQUASHED_TERMS,
  WORD_TERMS,
  containsBlockedLanguage,
  firstBlockedField,
  isBlockedLanguageError,
  normalizeForModeration,
  squashForModeration
} from './text-moderation';

const MIGRATION = readFileSync('supabase/migrations/0008_mobile_contract.sql', 'utf8');

/** Pull one of the SQL ARRAY[...] literals back out of the migration. */
function sqlTerms(varName: string): string[] {
  const match = new RegExp(`${varName} TEXT\\[\\] := ARRAY\\[([\\s\\S]*?)\\];`).exec(MIGRATION);
  if (!match) throw new Error(`could not find ${varName} in migration 0008`);
  return [...match[1].matchAll(/'([^']*)'/g)].map(m => m[1]);
}

/**
 * The database is the enforcement point; this module is a mirror so the API can
 * answer with a sentence. If the two lists drift, the API starts accepting text
 * the trigger will then reject with a raw SQL error. This test is the contract.
 */
describe('SQL and TypeScript blocklists stay identical', () => {
  it('has the same word-boundary terms as migration 0008', () => {
    expect(sqlTerms('word_terms')).toEqual([...WORD_TERMS]);
  });

  it('has the same separator-stripped terms as migration 0008', () => {
    expect(sqlTerms('squashed_terms')).toEqual([...SQUASHED_TERMS]);
  });

  it('builds word patterns the same way, letter-repeat allowance included', () => {
    expect(MIGRATION).toContain(
      "regexp_replace(regexp_replace(term, '([a-z0-9])', '\\1+', 'g'), ' ', '[^a-z0-9]+', 'g')"
    );
  });

  it('uses the same leet-substitution table as public.moderation_normalize', () => {
    const match = /translate\(lower\(coalesce\(input, ''\)\), '([^']*)', '([^']*)' \|\| '([^']*)'\)/.exec(MIGRATION);
    expect(match, 'moderation_normalize translate() not found').toBeTruthy();
    const from = match![1];
    const to = match![2] + match![3];
    expect(from.length).toBe(to.length);
    // Same mapping, applied by normalizeForModeration.
    for (let i = 0; i < from.length; i++) {
      expect(normalizeForModeration(from[i]), `${from[i]} -> ${to[i]}`).toBe(to[i]);
    }
  });
});

describe('normalizeForModeration', () => {
  it('lowercases and undoes digit-for-letter substitution', () => {
    expect(normalizeForModeration('N1GG3R')).toBe('nigger');
    expect(normalizeForModeration('$LUT')).toBe('slut');
  });

  it('collapses a letter repeated three or more times but leaves doubles alone', () => {
    expect(normalizeForModeration('sluuuuut')).toBe('sluut');
    expect(normalizeForModeration('coffee')).toBe('coffee');
    expect(normalizeForModeration('bookkeeper')).toBe('bookkeeper');
  });

  it('keeps word boundaries', () => {
    expect(normalizeForModeration('a b c')).toBe('a b c');
  });
});

describe('squashForModeration', () => {
  it('removes every separator', () => {
    expect(squashForModeration('f.a.g.g.o.t')).toBe('faggot');
    expect(squashForModeration('f a g g o t')).toBe('faggot');
    expect(squashForModeration('c-h-i-l-d p_o_r_n')).toBe('childporn');
  });
});

describe('containsBlockedLanguage', () => {
  it('catches a plain listed term', () => {
    expect(containsBlockedLanguage('you are a whore')).toBe(true);
    expect(containsBlockedLanguage('kys')).toBe(true);
  });

  it('catches leetspeak and padded spellings', () => {
    expect(containsBlockedLanguage('n1gg3r')).toBe(true);
    expect(containsBlockedLanguage('SLUUUUT')).toBe(true);
    expect(containsBlockedLanguage('f4gg0t')).toBe(true);
  });

  it('catches separator evasion for the long terms', () => {
    expect(containsBlockedLanguage('f.a.g.g.o.t')).toBe(true);
    expect(containsBlockedLanguage('k i l l y o u r s e l f')).toBe(true);
    expect(containsBlockedLanguage('child-porn')).toBe(true);
  });

  it('matches multi-word terms across any separator', () => {
    expect(containsBlockedLanguage('go kill yourself')).toBe(true);
    expect(containsBlockedLanguage('go kill-yourself')).toBe(true);
    expect(containsBlockedLanguage('go kill  yourself')).toBe(true);
  });

  it('ignores empty and whitespace-only input', () => {
    expect(containsBlockedLanguage('')).toBe(false);
    expect(containsBlockedLanguage('   ')).toBe(false);
    expect(containsBlockedLanguage(null)).toBe(false);
    expect(containsBlockedLanguage(undefined)).toBe(false);
  });

  /**
   * False positives are the expensive failure here: they reject a neighbour's
   * real post. Every string below contains a listed term as a substring, or is
   * a classic filter casualty, and every one must pass.
   */
  it('does not fire on ordinary words that merely contain a listed term', () => {
    const innocent = [
      'Scunthorpe',
      'Penistone',
      'a classic assignment',
      'grape juice at the market',
      'my therapist recommended it',
      'raccoon by the bins',
      'shiitake mushrooms',
      'Cockburn Street',
      'Lake Titicaca',
      'analysis of the data',
      'cumulative rainfall',
      'we can meet at the dyke path by the canal',
      'bareback riding lesson at the stable',
      'cum laude graduate',
      'I can escort you from the station',
      'that hill will kill you, bring water',
      'underage drinking is not allowed at this one',
      'having a fag break outside',
      'a spic and span kitchen'
    ];
    for (const text of innocent) {
      expect(containsBlockedLanguage(text), text).toBe(false);
    }
  });

  it('does not fire on any real plan text from the product', () => {
    const plans = [
      'Coffee and a slow walk around McCarren on Saturday morning, anyone welcome.',
      'Reading in Prospect Park Sunday afternoon. Bring whatever you are halfway through.',
      'Sunset run along the river Thursday. Easy pace, we can talk the whole way.',
      'Taco crawl on East Cesar Chavez Friday evening, three of us so far.'
    ];
    for (const text of plans) {
      expect(containsBlockedLanguage(text), text).toBe(false);
    }
  });
});

describe('firstBlockedField', () => {
  it('names the field that tripped', () => {
    expect(firstBlockedField({ text: 'a normal plan', spot: 'the whore house' })).toBe('spot');
  });

  it('returns null when everything is clean', () => {
    expect(firstBlockedField({ name: 'Maya', about: 'designer, moved from Chicago' })).toBeNull();
  });
});

describe('isBlockedLanguageError', () => {
  it('recognises the error the 0008 triggers raise', () => {
    expect(isBlockedLanguageError({ message: 'stoop_blocked_language: text' })).toBe(true);
  });

  it('does not swallow unrelated database errors', () => {
    expect(isBlockedLanguageError({ message: 'duplicate key value violates unique constraint' })).toBe(false);
    expect(isBlockedLanguageError(null)).toBe(false);
    expect(isBlockedLanguageError('stoop_blocked_language')).toBe(false);
  });
});
