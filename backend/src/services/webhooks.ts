/** Live app events. First login on a device claims earlier anonymous activity; a later login only claims from that moment. */

import { APP_USER_ORIGIN, type AppEventName } from '../config/constants.js';
import type { Executor } from '../lib/db.js';
import { isUniqueViolation } from '../lib/sql.js';

export interface IncomingAppEvent {
  eventId: string;
  event: AppEventName;
  userId: string | null;
  deviceId: string;
  occurredAt: Date;
  properties: Record<string, string | number | boolean | null>;
}

export interface IngestResult {
  duplicate: boolean;
  eventId: string;
  resolvedUserId: string | null;
}

interface EventRow {
  event_id: string;
  resolved_user_id: string | null;
}

interface UserRow {
  user_id: string;
}

export async function ingestAppEvent(exec: Executor, incoming: IncomingAppEvent): Promise<IngestResult> {
  const existing = await exec.query<EventRow>(
    'select event_id, resolved_user_id from app_events where event_id = $1',
    [incoming.eventId],
  );
  if (existing.rows[0]) {
    return {
      duplicate: true,
      eventId: existing.rows[0].event_id,
      resolvedUserId: existing.rows[0].resolved_user_id,
    };
  }

  await ensureDevice(exec, incoming.deviceId, incoming.occurredAt);

  if (incoming.userId) {
    await ensureAppUser(exec, incoming.userId, incoming.occurredAt);
  }

  if (incoming.event === 'login' && incoming.userId) {
    await recordLogin(exec, incoming.deviceId, incoming.userId, incoming.occurredAt);
  }

  const resolvedUserId = incoming.userId ?? (await ownerAt(exec, incoming.deviceId, incoming.occurredAt));

  try {
    await exec.query(
      `
      insert into app_events
        (event_id, event, raw_user_id, resolved_user_id, device_id, occurred_at, properties)
      values ($1, $2, $3, $4, $5, $6, $7::jsonb)
      `,
      [
        incoming.eventId,
        incoming.event,
        incoming.userId,
        resolvedUserId,
        incoming.deviceId,
        incoming.occurredAt,
        JSON.stringify(incoming.properties),
      ],
    );
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    const raced = await exec.query<EventRow>(
      'select event_id, resolved_user_id from app_events where event_id = $1',
      [incoming.eventId],
    );
    return {
      duplicate: true,
      eventId: incoming.eventId,
      resolvedUserId: raced.rows[0]?.resolved_user_id ?? null,
    };
  }

  return { duplicate: false, eventId: incoming.eventId, resolvedUserId };
}

async function ensureDevice(exec: Executor, deviceId: string, at: Date): Promise<void> {
  await exec.query(
    `
    insert into app_devices (device_id, first_seen_at, last_seen_at)
    values ($1, $2, $2)
    on conflict (device_id) do update set
      first_seen_at = least(app_devices.first_seen_at, excluded.first_seen_at),
      last_seen_at  = greatest(app_devices.last_seen_at, excluded.last_seen_at)
    `,
    [deviceId, at],
  );
}

async function ensureAppUser(exec: Executor, userId: string, at: Date): Promise<void> {
  await exec.query(
    `
    insert into app_users (user_id, origin, first_seen_at)
    values ($1, $2, $3)
    on conflict (user_id) do nothing
    `,
    [userId, APP_USER_ORIGIN.webhook, at],
  );
}

async function recordLogin(exec: Executor, deviceId: string, userId: string, at: Date): Promise<void> {
  await exec.query(
    `
    insert into device_user_sessions (device_id, user_id, login_at, claimed_from, claimed_to)
    values ($1, $2, $3, $3, null)
    on conflict (device_id, user_id, login_at) do nothing
    `,
    [deviceId, userId, at],
  );

  await exec.query(
    `
    with ordered as (
      select
        id,
        login_at,
        lead(login_at) over (order by login_at, id) as next_login,
        row_number() over (order by login_at, id) as position
      from device_user_sessions
      where device_id = $1
    )
    update device_user_sessions as session
    set
      claimed_from = case when ordered.position = 1 then null else session.login_at end,
      claimed_to   = ordered.next_login
    from ordered
    where session.id = ordered.id
    `,
    [deviceId],
  );

  await exec.query(
    `
    update app_events as event
    set resolved_user_id = session.user_id
    from device_user_sessions as session
    where event.device_id = session.device_id
      and event.device_id = $1
      and event.raw_user_id is null
      and (session.claimed_from is null or event.occurred_at >= session.claimed_from)
      and (session.claimed_to is null or event.occurred_at < session.claimed_to)
    `,
    [deviceId],
  );

  await exec.query(
    `
    update app_devices
    set current_user_id = (
      select user_id
      from device_user_sessions
      where device_id = $1
      order by login_at desc, id desc
      limit 1
    )
    where device_id = $1
    `,
    [deviceId],
  );
}

async function ownerAt(exec: Executor, deviceId: string, at: Date): Promise<string | null> {
  const { rows } = await exec.query<UserRow>(
    `
    select user_id
    from device_user_sessions
    where device_id = $1
      and (claimed_from is null or $2 >= claimed_from)
      and (claimed_to is null or $2 < claimed_to)
    order by login_at desc, id desc
    limit 1
    `,
    [deviceId, at],
  );

  return rows[0]?.user_id ?? null;
}
