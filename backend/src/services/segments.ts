import { COLD_WINDOW_DAYS, SEARCH_LIMIT, type AcquisitionSource, type SubscriberStatus } from '../config/constants.js';
import { daysBeforeReference } from '../lib/dates.js';
import { query, queryOne } from '../lib/db.js';
import { subscriberHitFromRow, type SubscriberPage, type SubscriberRow } from './subscribers.js';

export type LastOpenFilter = 'any' | 'never' | 'cold';

export interface SegmentDefinition {
  acquisitionSource?: AcquisitionSource;
  status?: SubscriberStatus;
  signupFrom?: string;
  signupTo?: string;
  lastOpen?: LastOpenFilter;
  hasWebsite?: boolean;
  hasApp?: boolean;
}

export interface SegmentPreview extends SubscriberPage {
  cutoffDate: string;
}

export interface SavedSegment {
  id: string;
  name: string;
  definition: SegmentDefinition;
  createdAt: string;
}

export const LAST_OPEN_FILTERS = ['any', 'never', 'cold'] as const;

function buildWhere(definition: SegmentDefinition): { sql: string; params: unknown[] } {
  const conditions: string[] = ['true'];
  const params: unknown[] = [];

  if (definition.acquisitionSource) {
    params.push(definition.acquisitionSource);
    conditions.push(`s.acquisition_source = $${params.length}`);
  }

  if (definition.status) {
    params.push(definition.status);
    conditions.push(`s.status = $${params.length}`);
  }

  if (definition.signupFrom) {
    params.push(definition.signupFrom);
    conditions.push(`s.signup_date >= $${params.length}::date`);
  }

  if (definition.signupTo) {
    params.push(definition.signupTo);
    conditions.push(`s.signup_date <= $${params.length}::date`);
  }

  if (definition.lastOpen === 'never') {
    conditions.push('s.last_open_date is null');
  } else if (definition.lastOpen === 'cold') {
    params.push(daysBeforeReference(COLD_WINDOW_DAYS));
    conditions.push(`(s.last_open_date is null or s.last_open_date < $${params.length}::date)`);
  }

  if (definition.hasWebsite === true) {
    conditions.push('exists (select 1 from web_visitors v where v.subscriber_id = s.id)');
  } else if (definition.hasWebsite === false) {
    conditions.push('not exists (select 1 from web_visitors v where v.subscriber_id = s.id)');
  }

  if (definition.hasApp === true) {
    conditions.push('exists (select 1 from app_users a where a.subscriber_id = s.id)');
  } else if (definition.hasApp === false) {
    conditions.push('not exists (select 1 from app_users a where a.subscriber_id = s.id)');
  }

  return { sql: conditions.join(' and '), params };
}

export async function previewSegment(
  definition: SegmentDefinition,
  options: { limit?: number; offset?: number } = {},
): Promise<SegmentPreview> {
  const limit = options.limit ?? SEARCH_LIMIT;
  const offset = options.offset ?? 0;
  const { sql, params } = buildWhere(definition);

  const rows = await query<SubscriberRow & { total: string }>(
    `
    select s.id, s.email_original, s.email_normalized, s.status, s.acquisition_source, s.signup_date, s.last_open_date,
           count(*) over() as total
    from subscribers s
    where ${sql}
    order by s.email_normalized
    limit $${params.length + 1}
    offset $${params.length + 2}
    `,
    [...params, limit, offset],
  );

  return {
    results: rows.map(subscriberHitFromRow),
    total: Number(rows[0]?.total ?? 0),
    limit,
    offset,
    cutoffDate: daysBeforeReference(COLD_WINDOW_DAYS),
  };
}

export async function listSegments(): Promise<SavedSegment[]> {
  const rows = await query<{ id: string; name: string; definition: SegmentDefinition; created_at: Date }>(
    `
    select id, name, definition, created_at
    from segments
    order by created_at desc
    `,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    definition: row.definition,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function saveSegment(name: string, definition: SegmentDefinition, createdBy: string): Promise<SavedSegment> {
  const row = await queryOne<{ id: string; name: string; definition: SegmentDefinition; created_at: Date }>(
    `
    insert into segments (name, definition, created_by)
    values ($1, $2::jsonb, $3)
    returning id, name, definition, created_at
    `,
    [name, JSON.stringify(definition), createdBy],
  );

  if (!row) throw new Error('Segment insert returned no row.');

  return {
    id: row.id,
    name: row.name,
    definition: row.definition,
    createdAt: row.created_at.toISOString(),
  };
}

export async function deleteSegment(id: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>('delete from segments where id = $1 returning id', [id]);
  return Boolean(row);
}
