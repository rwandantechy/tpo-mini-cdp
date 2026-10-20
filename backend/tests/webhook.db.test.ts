import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';

import { closePool, withTransaction } from '../src/lib/db.js';
import { ingestAppEvent, type IncomingAppEvent, type IngestResult } from '../src/services/webhooks.js';
import { previewSegment } from '../src/services/segments.js';
import { getSubscriberProfile } from '../src/services/subscribers.js';
import { hasDatabase, RollbackSignal } from './helpers/database.js';

const describeDb = hasDatabase ? describe : describe.skip;

afterAll(closePool);

const DEVICE = () => `d_wh_${randomUUID()}`;
const USER = (label: string) => `u_wh_${label}_${randomUUID()}`;

function at(hour: number, minute = 0): Date {
  return new Date(`2026-09-28T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
}

function event(
  partial: Partial<IncomingAppEvent> & Pick<IncomingAppEvent, 'event' | 'deviceId' | 'occurredAt'>,
): IncomingAppEvent {
  return {
    eventId: `evt_${randomUUID()}`,
    userId: null,
    properties: {},
    ...partial,
  };
}

async function run<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  let captured!: T;

  await expect(
    withTransaction(async (client) => {
      captured = await work(client);
      throw new RollbackSignal();
    }),
  ).rejects.toThrow(RollbackSignal);

  return captured;
}

async function ingest(client: PoolClient, events: IncomingAppEvent[]): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const incoming of events) results.push(await ingestAppEvent(client, incoming));
  return results;
}

async function resolved(client: PoolClient, deviceId: string): Promise<Array<{ event: string; user: string | null }>> {
  const { rows } = await client.query<{ event: string; resolved_user_id: string | null }>(
    `select event, resolved_user_id
     from app_events
     where device_id = $1
     order by occurred_at, event_id`,
    [deviceId],
  );

  return rows.map((row) => ({ event: row.event, user: row.resolved_user_id }));
}

describeDb('ingestAppEvent', () => {
  it('makes a linked webhook event visible in subscriber lookup and the live app segment', async () => {
    const deviceId = DEVICE();
    const userId = USER('lookup');
    const email = `${randomUUID()}@example.test`;
    let subscriberId = '';

    try {
      await withTransaction(async (client) => {
        const subscriber = await client.query<{ id: string }>(
          `insert into subscribers (email_normalized, email_original, status)
           values ($1, $1, 'active') returning id`,
          [email],
        );
        subscriberId = subscriber.rows[0]!.id;
        await client.query(
          `insert into app_users (user_id, subscriber_id, origin) values ($1, $2, 'webhook')`,
          [userId, subscriberId],
        );
        await ingestAppEvent(
          client,
          event({ event: 'app_open', userId, deviceId, occurredAt: at(14, 22) }),
        );
      });

      const profile = await getSubscriberProfile(subscriberId);
      expect(profile?.app.events.map((item) => item.event)).toContain('app_open');

      const appSegment = await previewSegment({ hasApp: true }, { limit: 10_000 });
      expect(appSegment.results.some((person) => person.id === subscriberId)).toBe(true);
    } finally {
      await withTransaction(async (client) => {
        await client.query('delete from app_devices where device_id = $1', [deviceId]);
        await client.query('delete from app_users where user_id = $1', [userId]);
        if (subscriberId) await client.query('delete from subscribers where id = $1', [subscriberId]);
      });
    }
  });

  it('keeps an unknown user_id as its own profile and still stores the event', async () => {
    const deviceId = DEVICE();
    const userId = USER('unknown');

    const snapshot = await run(async (client) => {
      const result = await ingestAppEvent(
        client,
        event({ event: 'read_story', userId, deviceId, occurredAt: at(14, 22), properties: { story: 'supreme-court-ruling-explained' } }),
      );

      const users = await client.query<{ origin: string; subscriber_id: string | null }>(
        'select origin, subscriber_id from app_users where user_id = $1',
        [userId],
      );

      return { result, users: users.rows };
    });

    expect(snapshot.result.duplicate).toBe(false);
    expect(snapshot.result.resolvedUserId).toBe(userId);
    expect(snapshot.users).toEqual([{ origin: 'webhook', subscriber_id: null }]);
  });

  it('treats a repeated event_id as a no-op', async () => {
    const deviceId = DEVICE();
    const incoming = event({ event: 'app_open', userId: USER('dup'), deviceId, occurredAt: at(10) });

    const snapshot = await run(async (client) => {
      const first = await ingestAppEvent(client, incoming);
      const second = await ingestAppEvent(client, incoming);
      const count = await client.query<{ count: string }>(
        'select count(*) as count from app_events where event_id = $1',
        [incoming.eventId],
      );

      return { first, second, count: Number(count.rows[0]?.count) };
    });

    expect(snapshot.first.duplicate).toBe(false);
    expect(snapshot.second.duplicate).toBe(true);
    expect(snapshot.second.resolvedUserId).toBe(snapshot.first.resolvedUserId);
    expect(snapshot.count).toBe(1);
  });

  it('links anonymous device events to the user after they log in', async () => {
    const deviceId = DEVICE();
    const userId = USER('late-login');

    const users = await run(async (client) => {
      await ingest(client, [
        event({ event: 'app_open', deviceId, occurredAt: at(10) }),
        event({ event: 'read_story', deviceId, occurredAt: at(10, 15) }),
        event({ event: 'login', userId, deviceId, occurredAt: at(11) }),
      ]);

      return resolved(client, deviceId);
    });

    expect(users).toEqual([
      { event: 'app_open', user: userId },
      { event: 'read_story', user: userId },
      { event: 'login', user: userId },
    ]);
  });

  it('still links when the anonymous events arrive after the login', async () => {
    const deviceId = DEVICE();
    const userId = USER('out-of-order');

    const users = await run(async (client) => {
      await ingest(client, [
        event({ event: 'login', userId, deviceId, occurredAt: at(11) }),
        event({ event: 'app_open', deviceId, occurredAt: at(10) }),
        event({ event: 'link_click', deviceId, occurredAt: at(12) }),
      ]);

      return resolved(client, deviceId);
    });

    expect(users).toEqual([
      { event: 'app_open', user: userId },
      { event: 'login', user: userId },
      { event: 'link_click', user: userId },
    ]);
  });

  it('gives a shared device to the user who logged in at that time, not whoever logged in last', async () => {
    const deviceId = DEVICE();
    const alice = USER('alice');
    const bob = USER('bob');

    const users = await run(async (client) => {
      await ingest(client, [
        event({ event: 'app_open', deviceId, occurredAt: at(9) }),
        event({ event: 'login', userId: alice, deviceId, occurredAt: at(10) }),
        event({ event: 'read_story', deviceId, occurredAt: at(10, 30) }),
        event({ event: 'login', userId: bob, deviceId, occurredAt: at(12) }),
        event({ event: 'app_open', deviceId, occurredAt: at(12, 30) }),
      ]);

      return resolved(client, deviceId);
    });

    expect(users).toEqual([
      { event: 'app_open', user: alice },
      { event: 'login', user: alice },
      { event: 'read_story', user: alice },
      { event: 'login', user: bob },
      { event: 'app_open', user: bob },
    ]);
  });

  it('ends up with the same owners when a later login is delivered first', async () => {
    const deviceId = DEVICE();
    const alice = USER('alice');
    const bob = USER('bob');

    const users = await run(async (client) => {
      await ingest(client, [
        event({ event: 'app_open', deviceId, occurredAt: at(9) }),
        event({ event: 'login', userId: bob, deviceId, occurredAt: at(12) }),
        event({ event: 'login', userId: alice, deviceId, occurredAt: at(10) }),
        event({ event: 'read_story', deviceId, occurredAt: at(10, 30) }),
        event({ event: 'app_open', deviceId, occurredAt: at(12, 30) }),
      ]);

      return resolved(client, deviceId);
    });

    expect(users).toEqual([
      { event: 'app_open', user: alice },
      { event: 'login', user: alice },
      { event: 'read_story', user: alice },
      { event: 'login', user: bob },
      { event: 'app_open', user: bob },
    ]);
  });

  it('does not move an identified event onto whoever currently owns the device', async () => {
    const deviceId = DEVICE();
    const alice = USER('alice');
    const guest = USER('guest');

    const users = await run(async (client) => {
      await ingest(client, [
        event({ event: 'login', userId: alice, deviceId, occurredAt: at(10) }),
        event({ event: 'read_story', userId: guest, deviceId, occurredAt: at(11) }),
      ]);

      return resolved(client, deviceId);
    });

    expect(users).toEqual([
      { event: 'login', user: alice },
      { event: 'read_story', user: guest },
    ]);
  });
});
