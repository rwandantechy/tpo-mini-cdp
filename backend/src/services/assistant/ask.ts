import type { Content } from '@google/genai';

import {
  ASSISTANT_ANSWER_MAX_LENGTH,
  ASSISTANT_DEADLINE_MS,
  ASSISTANT_HISTORY_TURNS,
  ASSISTANT_QUESTION_MAX_LENGTH,
  ASSISTANT_TOOL_ROUNDS,
  COLD_WINDOW_DAYS,
  REFERENCE_DATE,
} from '../../config/constants.js';
import { daysBeforeReference } from '../../lib/dates.js';
import { assertNoPii, containsPii, PiiBlockedError } from '../../lib/pii.js';
import { log } from '../../lib/logger.js';
import { functionResponseParts, type GeminiClient } from './gemini.js';
import { runTool, type ToolSegment, type ToolTable } from './tools.js';

export const PII_REFUSAL =
  "I can't look up a specific person. Ask about totals, sources, pages, or a segment.";

export interface AssistantAnswer {
  answer: string;
  blocked: boolean;
  tables: ToolTable[];
  segment?: ToolSegment;
}

export interface HistoryTurn {
  question: string;
  answer: string;
}

export interface AskOptions {
  gemini: GeminiClient;
  model: string;
  createdBy: string;
  history?: HistoryTurn[];
}

export function systemInstruction(): string {
  return [
    'You are Growth’s analyst for this newsletter, website, and app.',
    `Treat ${REFERENCE_DATE} as today.`,
    `Cold means no open since ${daysBeforeReference(COLD_WINDOW_DAYS)} — last newsletter open, not signup date.`,
    'Acquisition sources: Direct, Facebook, Google, Instagram, Podcast, Referral, X.',
    'Use tools for every number. Interpret, compare, and recommend. Do not invent counts.',
    'You only see aggregates. Never emails, names, or raw people.',
    'If they name a person, refuse. Pronouns keep the last source or filter in this conversation.',
    'Save a list only when they ask to save or build one. The app will show the people.',
    'You may use markdown.',
  ].join(' ');
}

export function plainAnswer(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim().slice(0, ASSISTANT_ANSWER_MAX_LENGTH);
}

/** The exact user text that would be sent to the model. Empty means we do not call it. */
export function modelUserText(question: string): { ok: true; text: string } | { ok: false; reason: 'pii' | 'empty' } {
  const text = question.trim();
  if (text.length === 0) return { ok: false, reason: 'empty' };
  if (containsPii(text)) return { ok: false, reason: 'pii' };
  return { ok: true, text: text.slice(0, ASSISTANT_QUESTION_MAX_LENGTH) };
}

export async function ask(question: string, options: AskOptions): Promise<AssistantAnswer> {
  const gated = modelUserText(question);
  if (!gated.ok) {
    log.info('assistant question blocked', { reason: gated.reason });
    return {
      answer: gated.reason === 'pii' ? PII_REFUSAL : 'Ask a question about totals, pages, or segments.',
      blocked: gated.reason === 'pii',
      tables: [],
    };
  }

  try {
    return await runAsk(gated.text, options);
  } catch (error) {
    if (error instanceof PiiBlockedError) {
      log.info('assistant payload blocked', { kinds: error.kinds });
      return { answer: PII_REFUSAL, blocked: true, tables: [] };
    }
    throw error;
  }
}

async function runAsk(text: string, options: AskOptions): Promise<AssistantAnswer> {
  assertNoPii(text);

  const contents: Content[] = [
    ...historyContents(options.history ?? []),
    { role: 'user', parts: [{ text }] },
  ];
  const tables: ToolTable[] = [];
  let segment: ToolSegment | undefined;
  const deadline = Date.now() + ASSISTANT_DEADLINE_MS;

  for (let round = 0; round < ASSISTANT_TOOL_ROUNDS; round += 1) {
    const remaining = deadline - Date.now();
    if (remaining < 1_500) break;

    assertNoPii(contents);

    const turn = await options.gemini.generate({
      model: options.model,
      systemInstruction: systemInstruction(),
      contents,
      timeoutMs: remaining,
    });

    if (turn.functionCalls && turn.functionCalls.length > 0) {
      if (turn.modelContent) contents.push(turn.modelContent);

      const payloads: Array<Record<string, unknown>> = [];
      for (const call of turn.functionCalls) {
        const result = await runTool(call.name ?? '', call.args, options.createdBy);
        if (result.ok) {
          if (result.table) rememberTable(tables, result.table);
          if (result.segment) segment = result.segment;
          payloads.push(result.data);
        } else {
          payloads.push({ error: result.error });
        }
      }

      assertNoPii(payloads);
      contents.push({ role: 'user', parts: functionResponseParts(turn.functionCalls, payloads) });
      continue;
    }

    const answer = plainAnswer(turn.text || '') || 'I could not put that into words. Try asking another way.';
    if (containsPii(answer, { names: false })) {
      log.info('assistant answer blocked', { reason: 'pii' });
      return { answer: PII_REFUSAL, blocked: true, tables: [] };
    }

    return { answer, blocked: false, tables, segment };
  }

  return {
    answer: tables.length || segment ? 'Here is what I found.' : 'I could not finish that. Try a narrower question.',
    blocked: false,
    tables,
    segment,
  };
}

export function historyContents(history: HistoryTurn[]): Content[] {
  const contents: Content[] = [];

  for (const turn of history.slice(-ASSISTANT_HISTORY_TURNS)) {
    const gated = modelUserText(turn.question);
    if (!gated.ok) continue;
    const answer = plainAnswer(turn.answer);
    // Same name check as the question. Stopwords keep headings such as "Top Pages".
    if (!answer || containsPii(answer)) continue;
    contents.push({ role: 'user', parts: [{ text: gated.text }] });
    contents.push({ role: 'model', parts: [{ text: answer }] });
  }

  assertNoPii(contents);
  return contents;
}

function rememberTable(tables: ToolTable[], table: ToolTable): void {
  const existing = tables.findIndex((item) => item.title === table.title);
  if (existing >= 0) tables.splice(existing, 1);
  tables.push(table);
}
