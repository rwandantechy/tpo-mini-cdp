import { z } from 'zod';

import {
  ACQUISITION_SOURCES,
  ASSISTANT_TABLE_LIMIT,
  COLD_WINDOW_DAYS,
  SEGMENT_NAME_MAX_LENGTH,
  SUBSCRIBER_STATUSES,
} from '../../config/constants.js';
import { assertNoPii, containsPii, findPii, PiiBlockedError } from '../../lib/pii.js';
import { countSegment, saveSegment, segmentDefinitionSchema, type SegmentDefinition } from '../segments.js';
import {
  firstPagesForNewSubscribers,
  snapshotCounts,
  subscriberBreakdown,
  topPages,
  type AggregateTable,
} from './analytics.js';

export interface ToolTable extends AggregateTable {}

export interface ToolSegment {
  id?: string;
  name?: string;
  total: number;
  cutoffDate: string;
  definition: SegmentDefinition;
}

export interface ToolSuccess {
  ok: true;
  data: Record<string, unknown>;
  table?: ToolTable;
  segment?: ToolSegment;
}

export interface ToolFailure {
  ok: false;
  error: string;
}

export type ToolResult = ToolSuccess | ToolFailure;

const limitSchema = z.number().int().min(1).max(ASSISTANT_TABLE_LIMIT).optional();

const saveSchema = z.object({
  name: z.string().trim().min(1).max(SEGMENT_NAME_MAX_LENGTH),
  definition: segmentDefinitionSchema,
});

const firstPagesSchema = z.object({
  days: z.number().int().min(1).max(365).optional(),
  limit: limitSchema,
});

const SEGMENT_FILTER_PROPERTIES = {
  acquisitionSource: {
    type: 'string',
    description: 'Exact source: Direct, Facebook, Google, Instagram, Podcast, Referral, or X.',
  },
  status: { type: 'string', description: 'active or unsubscribed' },
  signupFrom: { type: 'string', description: 'Only if they asked about signup date. ISO date.' },
  signupTo: { type: 'string', description: 'Only if they asked about signup date. ISO date.' },
  lastOpen: {
    type: 'string',
    enum: ['any', 'never', 'cold'],
    description: 'cold = no open in 30 days. Independent of signup date.',
  },
  hasWebsite: { type: 'boolean' },
  hasApp: { type: 'boolean' },
} as const;

export const TOOL_DECLARATIONS = [
  {
    name: 'get_snapshot',
    description: 'Headline counts for subscribers, website, and app. Includes Instagram cold (last open, not signup date).',
    parametersJsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'subscriber_breakdown',
    description:
      'One row per acquisition source with total, active, unsubscribed, unsubscribe rate, and share of all subscribers, largest first.',
    parametersJsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'top_pages',
    description: 'Most viewed website pages, as counts only.',
    parametersJsonSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: ASSISTANT_TABLE_LIMIT } },
      additionalProperties: false,
    },
  },
  {
    name: 'first_pages_for_new_subscribers',
    description:
      'Which pages people hit first after signing up, as counts. days is how far back from the assessment date.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        days: { type: 'integer', minimum: 1, maximum: 365 },
        limit: { type: 'integer', minimum: 1, maximum: ASSISTANT_TABLE_LIMIT },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'count_segment',
    description:
      'How many subscribers match a filter. lastOpen=cold is last newsletter open, not signup date. Returns a total, never a list of people.',
    parametersJsonSchema: {
      type: 'object',
      properties: SEGMENT_FILTER_PROPERTIES,
      additionalProperties: false,
    },
  },
  {
    name: 'save_segment',
    description:
      'Save a named segment so Growth can open the people in the app. Returns the size only, not emails.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        definition: {
          type: 'object',
          properties: SEGMENT_FILTER_PROPERTIES,
          additionalProperties: false,
        },
      },
      required: ['name', 'definition'],
      additionalProperties: false,
    },
  },
] as const;

export type ToolName = (typeof TOOL_DECLARATIONS)[number]['name'];

export async function runTool(
  name: string,
  args: Record<string, unknown> | undefined,
  createdBy: string,
): Promise<ToolResult> {
  try {
    const result = await execute(name, args ?? {}, createdBy);
    assertNoPii(result.data);
    if (result.table) assertNoPii(result.table);
    if (result.segment) assertNoPii({ ...result.segment, id: undefined });
    return result;
  } catch (error) {
    if (error instanceof PiiBlockedError) throw error;
    return { ok: false, error: error instanceof Error ? error.message : 'That tool failed.' };
  }
}

async function execute(
  name: string,
  args: Record<string, unknown>,
  createdBy: string,
): Promise<ToolSuccess> {
  switch (name) {
    case 'get_snapshot': {
      const data = await snapshotCounts();
      return { ok: true, data };
    }
    case 'subscriber_breakdown': {
      const table = await subscriberBreakdown();
      return {
        ok: true,
        data: { largest: table.rows[0]?.source, rows: table.rows },
        table,
      };
    }
    case 'top_pages': {
      const { limit } = z.object({ limit: limitSchema }).parse(args);
      const table = await topPages(limit ?? ASSISTANT_TABLE_LIMIT);
      return { ok: true, data: { rows: table.rows }, table };
    }
    case 'first_pages_for_new_subscribers': {
      const { days, limit } = firstPagesSchema.parse(args);
      const table = await firstPagesForNewSubscribers(days ?? COLD_WINDOW_DAYS, limit ?? ASSISTANT_TABLE_LIMIT);
      return { ok: true, data: { rows: table.rows }, table };
    }
    case 'count_segment': {
      const definition = segmentDefinitionSchema.parse(normalizeFilters(args));
      const counted = await countSegment(definition);
      return {
        ok: true,
        data: { ...counted, ...definition },
        table: matchingTable(definition, counted),
      };
    }
    case 'save_segment': {
      const { name: segmentName, definition } = parseSave(args);
      return saveNamedSegment(segmentName, definition, createdBy);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function saveNamedSegment(
  name: string,
  definition: SegmentDefinition,
  createdBy: string,
): Promise<ToolSuccess> {
  if (containsPii(name)) throw new PiiBlockedError(findPii(name));
  const counted = await countSegment(definition);
  const saved = await saveSegment(name, definition, createdBy);
  return {
    ok: true,
    data: { name: saved.name, total: counted.total, cutoffDate: counted.cutoffDate, ...definition },
    segment: {
      id: saved.id,
      name: saved.name,
      total: counted.total,
      cutoffDate: counted.cutoffDate,
      definition,
    },
  };
}

function parseSave(args: Record<string, unknown>): { name: string; definition: SegmentDefinition } {
  const nested = args.definition;
  const raw =
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : args;
  return saveSchema.parse({ name: args.name, definition: normalizeFilters(raw) });
}

function normalizeFilters(args: Record<string, unknown>): Record<string, unknown> {
  const next = { ...args };
  if (typeof next.acquisitionSource === 'string') {
    const requested = next.acquisitionSource;
    const match = ACQUISITION_SOURCES.find((source) => source.toLowerCase() === requested.toLowerCase());
    if (match) next.acquisitionSource = match;
  }
  if (typeof next.status === 'string') {
    const requested = next.status;
    const match = SUBSCRIBER_STATUSES.find((status) => status.toLowerCase() === requested.toLowerCase());
    if (match) next.status = match;
  }
  return next;
}

function matchingTable(
  definition: SegmentDefinition,
  counted: { total: number; cutoffDate: string },
): ToolTable {
  const row: Record<string, string | number> = { total: counted.total };
  if (definition.acquisitionSource) row.source = definition.acquisitionSource;
  if (definition.status) row.status = definition.status;
  if (definition.lastOpen && definition.lastOpen !== 'any') row.lastOpen = definition.lastOpen;
  if (definition.signupFrom) row.signupFrom = definition.signupFrom;
  row.cutoff = counted.cutoffDate;

  const title = [definition.acquisitionSource, definition.status, definition.lastOpen === 'cold' ? 'cold' : undefined]
    .filter(Boolean)
    .join(', ');

  return { title: title || 'Matching subscribers', rows: [row] };
}
