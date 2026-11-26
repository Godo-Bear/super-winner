import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

/**
 * Family-friendly filter for words typed into the Writer box.
 *
 * Players can type ANY word: dictionary words get their hand-made hazard and
 * everything else becomes a Mystery Blob. Inappropriate words are rejected.
 *
 * Detection uses the `obscenity` package's maintained English dataset, which
 * also catches common letter tricks (repeated letters, look-alike characters)
 * and avoids false alarms on innocent words that merely contain a bad one.
 *
 * EXTRA_BLOCKED lets you add your own words (whole-word, case-insensitive).
 */
const EXTRA_BLOCKED = [];

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
const extra = new Set(EXTRA_BLOCKED.map((w) => w.toLowerCase()));

/** Returns true if the word is OK to use in the game. */
export function isWordAllowed(raw) {
  const w = String(raw).toLowerCase().trim();
  if (!w) return false;
  if (matcher.hasMatch(w) || matcher.hasMatch(w.replace(/\s+/g, ''))) return false;
  for (const part of w.split(/\s+/)) if (extra.has(part)) return false;
  return true;
}
