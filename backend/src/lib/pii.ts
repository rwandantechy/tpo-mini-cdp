/** What must never reach Gemini: emails, channel ids, and named people. */

import { parseEmail } from './email.js';

export type PiiKind = 'email' | 'name' | 'app_user' | 'device' | 'event';

export class PiiBlockedError extends Error {
  readonly kinds: PiiKind[];

  constructor(kinds: PiiKind[]) {
    super(`Refusing to send ${kinds.join(', ')} to the model.`);
    this.name = 'PiiBlockedError';
    this.kinds = kinds;
  }
}

const EMAIL_IN_TEXT = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const APP_USER_ID = /\bu_[0-9a-f]{6,}\b/i;
const DEVICE_ID = /\bd_[0-9a-f]{4,}\b/i;
const EVENT_ID = /\bevt_[0-9a-f-]{6,}\b/i;
const NAME_PAIR = /\b[a-z]{2,21}\s+[a-z]{2,21}\b/g;

/** Words that show up in questions and headings, not people's names. */
const NAME_STOPWORDS = new Set([
  'how',
  'what',
  'which',
  'when',
  'where',
  'why',
  'who',
  'the',
  'this',
  'that',
  'these',
  'those',
  'our',
  'your',
  'instagram',
  'facebook',
  'google',
  'podcast',
  'referral',
  'direct',
  'matching',
  'active',
  'cold',
  'total',
  'share',
  'volume',
  'unsubscribe',
  'unsubscribed',
  'unsub',
  'acquisition',
  'subscribers',
  'subscriber',
  'readers',
  'reader',
  'pages',
  'page',
  'source',
  'sources',
  'status',
  'signup',
  'signups',
  'september',
  'october',
  'august',
  'july',
  'growth',
  'assistant',
  'comparison',
  'takeaways',
  'takeaway',
  'website',
  'newsletter',
  'mobile',
  'most',
  'engaged',
  'first',
  'last',
  'open',
  'opened',
  'new',
  'top',
  'rate',
  'rates',
  'performance',
  'drivers',
  'channel',
  'channels',
  'pour',
  'over',
  'mini',
  'count',
  'counts',
  'traffic',
  'retention',
  'organic',
  'visits',
  'many',
  'went',
  'days',
  'list',
  'build',
  'hit',
  'them',
  'they',
  'their',
  'still',
  'subscribed',
  'are',
  'was',
  'were',
  'been',
  'have',
  'has',
  'had',
  'not',
  'opened',
  'open',
  'for',
  'and',
  'with',
  'from',
  'into',
  'about',
  'than',
  'more',
  'less',
  'each',
  'per',
  'ago',
  'since',
  'just',
  'only',
  'also',
  'all',
  'out',
  'get',
  'got',
  'did',
  'does',
  'can',
  'show',
  'give',
  'make',
  'save',
  'create',
  'break',
  'down',
  'explain',
  'json',
  'numbers',
  'number',
  'invent',
  'use',
  'markdown',
  'allowed',
  'never',
  'write',
  'email',
  'mention',
  'person',
  'people',
  'filters',
  'filter',
  'results',
  'result',
  'already',
  'counted',
  'counts',
  'tool',
  'object',
  'those',
  'these',
  'there',
  'then',
  'that',
  'this',
  'in',
  'on',
  'at',
  'to',
  'by',
  'or',
  'an',
  'be',
  'is',
  'it',
  'as',
  'if',
  'no',
  'so',
  'up',
  'we',
  'us',
  'done',
  'lately',
  'tell',
  'me',
  'please',
  'look',
  'ask',
  'try',
  'one',
  'of',
  'do',
]);

export interface PiiOptions {
  /** Two-word names. On by default, including model answers. */
  names?: boolean;
}

function hasEmail(text: string): boolean {
  const matches = text.match(EMAIL_IN_TEXT) ?? [];
  return matches.some((raw) => parseEmail(raw.replace(/[.,;:)>\]]+$/, '')).ok);
}

function hasPersonName(text: string): boolean {
  const matches = text.toLowerCase().match(NAME_PAIR) ?? [];
  return matches.some((pair) => {
    const [first, last] = pair.split(/\s+/);
    if (!first || !last) return false;
    return !NAME_STOPWORDS.has(first) && !NAME_STOPWORDS.has(last);
  });
}

export function findPii(text: string, options: PiiOptions = {}): PiiKind[] {
  const names = options.names ?? true;
  const kinds = new Set<PiiKind>();
  if (hasEmail(text)) kinds.add('email');
  if (names && hasPersonName(text)) kinds.add('name');
  if (APP_USER_ID.test(text)) kinds.add('app_user');
  if (DEVICE_ID.test(text)) kinds.add('device');
  if (EVENT_ID.test(text)) kinds.add('event');
  return [...kinds];
}

export function containsPii(text: string, options: PiiOptions = {}): boolean {
  return findPii(text, options).length > 0;
}

/** Tool results and model payloads are JSON. If an email slipped in, we refuse to send it. */
export function assertNoPii(payload: unknown): void {
  const text = JSON.stringify(payload);
  const kinds = findPii(text);
  if (kinds.length > 0) {
    throw new PiiBlockedError(kinds);
  }
}
