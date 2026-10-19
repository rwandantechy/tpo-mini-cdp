/** Map a question onto a tool call. The question text stays here. */

import {
  ACQUISITION_SOURCES,
  COLD_WINDOW_DAYS,
  ENGAGED_PRESET,
  ENGAGED_SEGMENT_NAME,
  INSTAGRAM_COLD_SEGMENT_NAME,
  REFERENCE_DATE,
  type AcquisitionSource,
} from '../../config/constants.js';
import { daysBeforeReference } from '../../lib/dates.js';
import { findPii } from '../../lib/pii.js';
import type { SegmentDefinition } from '../segments.js';

export interface HistoryTurn {
  question: string;
  answer: string;
}

export const UNSUPPORTED_ANSWER =
  'I can answer totals, sources, pages, and saved segments. Try one of the suggested questions.';

export type PlanTool =
  | 'get_snapshot'
  | 'subscriber_breakdown'
  | 'top_pages'
  | 'first_pages_for_new_subscribers'
  | 'count_segment'
  | 'save_segment';

export type AssistantPlan =
  | { ok: false; reason: 'pii' | 'unsupported' | 'empty' }
  | { ok: true; tool: PlanTool; args: Record<string, unknown>; definition?: SegmentDefinition };

export function planQuestion(question: string, history: readonly HistoryTurn[] = []): AssistantPlan {
  const text = question.trim();
  if (text.length === 0) return { ok: false, reason: 'empty' };
  if (findPii(text).length > 0) return { ok: false, reason: 'pii' };

  const planned = classify(text, priorDefinition(history));
  if (!planned) return { ok: false, reason: 'unsupported' };
  return planned;
}

function priorDefinition(history: readonly HistoryTurn[]): SegmentDefinition | undefined {
  let filters: SegmentDefinition | undefined;

  for (const turn of history) {
    if (findPii(turn.question).length > 0) continue;
    const planned = classify(turn.question, filters);
    if (planned?.ok && planned.definition) filters = planned.definition;
  }

  return filters;
}

function classify(question: string, prior: SegmentDefinition | undefined): AssistantPlan | null {
  const text = question.toLowerCase();

  if (isFirstPages(text)) {
    return { ok: true, tool: 'first_pages_for_new_subscribers', args: {} };
  }

  if (isBreakdown(text)) return { ok: true, tool: 'subscriber_breakdown', args: {} };
  if (isTopPages(text)) return { ok: true, tool: 'top_pages', args: {} };

  const definition = definitionFrom(text, prior);
  if (isSnapshot(text, definition)) return { ok: true, tool: 'get_snapshot', args: {} };

  if (!hasFilter(definition)) return null;

  if (isSave(text)) {
    return {
      ok: true,
      tool: 'save_segment',
      args: { name: segmentName(definition), definition },
      definition,
    };
  }

  return { ok: true, tool: 'count_segment', args: { ...definition }, definition };
}

function isFirstPages(text: string): boolean {
  return /\bpages?\b/.test(text) && /\b(first|hit)\b/.test(text);
}

function isTopPages(text: string): boolean {
  return /\btop pages\b/.test(text) || /\bmost viewed\b/.test(text);
}

function isBreakdown(text: string): boolean {
  return /\bbreak ?down\b/.test(text) || /\bby source\b/.test(text) || /\bunsubscribe rate\b/.test(text) || /\bsource mix\b/.test(text);
}

function isSnapshot(text: string, definition: SegmentDefinition): boolean {
  if (hasFilter(definition)) return false;
  return /\b(overview|snapshot|headline)\b/.test(text) || (/\bhow many\b/.test(text) && /\bsubscribers\b/.test(text));
}

function isSave(text: string): boolean {
  return /\b(save|build|create)\b/.test(text) && /\b(list|segment)\b/.test(text);
}

function definitionFrom(text: string, prior: SegmentDefinition | undefined): SegmentDefinition {
  const definition: SegmentDefinition = {};

  if (/\bengaged\b/.test(text)) Object.assign(definition, ENGAGED_PRESET);

  const source = sourceIn(text);
  if (source) definition.acquisitionSource = source;

  if (/\bunsubscrib/.test(text)) definition.status = 'unsubscribed';
  else if (/\bactive\b/.test(text) || /\bstill subscribed\b/.test(text) || /\bsubscribed\b/.test(text)) {
    definition.status = 'active';
  }

  if (/\bcold\b|have not opened|haven't opened|havent opened|no open|not opened|inactive/.test(text)) {
    definition.lastOpen = 'cold';
  } else if (/\bnever opened\b|\bnever open\b/.test(text)) {
    definition.lastOpen = 'never';
  }

  if (/\bwebsite\b/.test(text) && /\bapp\b/.test(text)) {
    definition.hasWebsite = true;
    definition.hasApp = true;
  }

  if (wantsSignupWindow(text)) {
    definition.signupFrom = daysBeforeReference(COLD_WINDOW_DAYS);
    definition.signupTo = REFERENCE_DATE;
  }

  if (/\b(them|those|they|their)\b/.test(text) && prior) {
    definition.acquisitionSource ??= prior.acquisitionSource;
    definition.status ??= prior.status;
    definition.lastOpen ??= prior.lastOpen;
    definition.signupFrom ??= prior.signupFrom;
    definition.signupTo ??= prior.signupTo;
    if (definition.hasWebsite === undefined) definition.hasWebsite = prior.hasWebsite;
    if (definition.hasApp === undefined) definition.hasApp = prior.hasApp;
  }

  return definition;
}

function wantsSignupWindow(text: string): boolean {
  if (/\bpages?\b/.test(text)) return false;
  return /\b(signed up|sign-?up date|signups since|joined)\b/.test(text);
}

function sourceIn(text: string): AcquisitionSource | undefined {
  if (/\btwitter\b/.test(text)) return 'X';

  return ACQUISITION_SOURCES.find((source) => new RegExp(`\\b${source}\\b`, 'i').test(text));
}

function hasFilter(definition: SegmentDefinition): boolean {
  return Object.values(definition).some((value) => value !== undefined);
}

function segmentName(definition: SegmentDefinition): string {
  if (
    definition.status === ENGAGED_PRESET.status &&
    definition.hasWebsite === true &&
    definition.hasApp === true &&
    !definition.acquisitionSource &&
    !definition.lastOpen
  ) {
    return ENGAGED_SEGMENT_NAME;
  }

  if (definition.acquisitionSource === 'Instagram' && definition.lastOpen === 'cold' && !definition.signupFrom && !definition.status) {
    return INSTAGRAM_COLD_SEGMENT_NAME;
  }

  return [definition.acquisitionSource, definition.status, definition.lastOpen === 'cold' ? 'cold' : undefined]
    .filter(Boolean)
    .join(', ');
}
