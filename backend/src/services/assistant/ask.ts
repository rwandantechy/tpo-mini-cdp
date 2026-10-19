
import type { Content } from '@google/genai';

import { ASSISTANT_ANSWER_MAX_LENGTH, ASSISTANT_DEADLINE_MS } from '../../config/constants.js';
import { AppError } from '../../lib/errors.js';
import { assertNoPii, containsPii, PiiBlockedError } from '../../lib/pii.js';
import { log } from '../../lib/logger.js';
import type { GeminiClient } from './llm.js';
import { planQuestion, UNSUPPORTED_ANSWER, type HistoryTurn } from './plan.js';
import { runTool, type ToolSegment, type ToolSuccess, type ToolTable } from './tools.js';

export const PII_REFUSAL =
  "I can't look up a specific person. Ask about totals, sources, pages, or a segment.";

export interface AssistantAnswer {
  answer: string;
  blocked: boolean;
  tables: ToolTable[];
  segment?: ToolSegment;
}

export type { HistoryTurn };

export interface AskOptions {
  gemini: GeminiClient;
  model: string;
  createdBy: string;
  history?: HistoryTurn[];
}

// Only these fields can be included in the summary sent to Gemini.
const FILTER_KEYS = [
  'acquisitionSource',
  'status',
  'signupFrom',
  'signupTo',
  'lastOpen',
  'hasWebsite',
  'hasApp',
] as const;

const ROW_KEYS = [
  'source',
  'total',
  'active',
  'unsubscribed',
  'unsubRate',
  'share',
  'page',
  'views',
  'readers',
  'status',
  'lastOpen',
  'signupFrom',
  'signupTo',
  'cutoff',
] as const;

const SNAPSHOT_KEYS = [
  'referenceDate',
  'coldWindowDays',
  'subscribers',
  'active',
  'unsubscribed',
  'neverOpened',
  'coldSinceCutoff',
  'instagramCold',
  'instagramColdActive',
  'appAccounts',
  'appLinked',
  'appEvents',
  'webVisitors',
  'webIdentified',
  'pageviews',
] as const;

export function systemInstruction(): string {
  return [
    'Explain the JSON counts.',
    'Use only those numbers. Do not invent counts.',
    'Cold is last open, not signup date.',
    'Never write an email or a person.',
    'Markdown is allowed.',
  ].join(' ');
}

export function plainAnswer(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim().slice(0, ASSISTANT_ANSWER_MAX_LENGTH);
}

// Build a summary using approved fields instead of forwarding raw data.
export function narrationSummary(tool: string, result: ToolSuccess): Record<string, unknown> {
  const summary: Record<string, unknown> = { tool };

  if (tool === 'get_snapshot') {
    for (const key of SNAPSHOT_KEYS) {
      const value = result.data[key];
      if (typeof value === 'number' || typeof value === 'string') summary[key] = value;
    }
  } else {
    const filters: Record<string, unknown> = {};
    for (const key of FILTER_KEYS) {
      const value = result.data[key];
      if (typeof value === 'string' || typeof value === 'boolean') filters[key] = value;
    }
    if (Object.keys(filters).length > 0) summary.filters = filters;
    if (typeof result.data.total === 'number') summary.total = result.data.total;
    if (typeof result.data.cutoffDate === 'string') summary.cutoffDate = result.data.cutoffDate;
  }

  if (result.table) {
    summary.rows = result.table.rows.map((row) => {
      const clean: Record<string, string | number> = {};
      for (const key of ROW_KEYS) {
        const value = row[key];
        if (typeof value === 'string' || typeof value === 'number') clean[key] = value;
      }
      return clean;
    });
  }

  return summary;
}

// Gemini receives the summary as JSON, not the original question.
export function narrationContents(summary: Record<string, unknown>): Content[] {
  return [{ role: 'user', parts: [{ text: JSON.stringify(summary) }] }];
}

function countedSentence(summary: Record<string, unknown>): string {
  if (typeof summary.total === 'number') return `${summary.total.toLocaleString('en-US')}.`;
  return 'Here is what I found.';
}

export async function ask(question: string, options: AskOptions): Promise<AssistantAnswer> {
  // Plan and validate the question locally before accessing data or Gemini.
  const plan = planQuestion(question, options.history ?? []);
  if (!plan.ok) {
    log.info('assistant question blocked', { reason: plan.reason });
    return {
      answer: plan.reason === 'pii' ? PII_REFUSAL : plan.reason === 'empty' ? 'Ask a question about totals, pages, or segments.' : UNSUPPORTED_ANSWER,
      blocked: plan.reason === 'pii',
      tables: [],
    };
  }

  try {
    const result = await runTool(plan.tool, plan.args, options.createdBy);
    if (!result.ok) return { answer: 'I could not answer that from the data.', blocked: false, tables: [] };

    const summary = narrationSummary(plan.tool, result);
    const contents = narrationContents(summary);

    // Check the outgoing payload for personal information.
    assertNoPii(summary);
    assertNoPii(contents);
    assertNoPii(systemInstruction());

    let turn;
    try {
      // Gemini explains the results without calling additional tools.
      turn = await options.gemini.generate({
        model: options.model,
        systemInstruction: systemInstruction(),
        contents,
        includeTools: false,
        timeoutMs: ASSISTANT_DEADLINE_MS,
      });
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      log.warn('assistant narration failed', { error: error.message });

      // Keep the verified results available if Gemini fails.
      return {
        answer: countedSentence(summary),
        blocked: false,
        tables: result.table ? [result.table] : [],
        segment: result.segment,
      };
    }

    // Check the generated answer before returning it to the client.
    const answer = plainAnswer(turn.text || '');
    if (!answer || containsPii(answer)) {
      log.info('assistant answer blocked', { reason: answer ? 'pii' : 'empty' });
      return { answer: PII_REFUSAL, blocked: true, tables: [] };
    }

    return {
      answer,
      blocked: false,
      tables: result.table ? [result.table] : [],
      segment: result.segment,
    };
  } catch (error) {
    if (error instanceof PiiBlockedError) {
      log.info('assistant payload blocked', { kinds: error.kinds });
      return { answer: PII_REFUSAL, blocked: true, tables: [] };
    }
    throw error;
  }
}
