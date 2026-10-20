import { query } from '../lib/db.js';

export interface LiveAppEvent {
  eventId: string;
  event: string;
  deviceId: string;
  receivedAt: string;
  subscriber: string;
}

interface LiveAppEventRow {
  event_id: string;
  event: string;
  device_id: string;
  received_at: Date;
  subscriber: string | null;
}

export async function listRecentAppEvents(limit = 50): Promise<LiveAppEvent[]> {
  const rows = await query<LiveAppEventRow>(
    `
    select
      e.event_id,
      e.event,
      e.device_id,
      e.received_at,
      s.email_original as subscriber
    from app_events e
    left join app_users a on a.user_id = e.resolved_user_id
    left join subscribers s on s.id = a.subscriber_id
    order by e.received_at desc, e.event_id desc
    limit $1
    `,
    [limit],
  );

  return rows.map((row) => ({
    eventId: row.event_id,
    event: row.event,
    deviceId: row.device_id,
    receivedAt: row.received_at.toISOString(),
    subscriber: row.subscriber ?? 'Anonymous',
  }));
}