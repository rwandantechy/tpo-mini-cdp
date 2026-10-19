import { afterAll, describe, expect, it } from 'vitest';

import { SEARCH_LIMIT } from '../src/config/constants.js';
import { closePool } from '../src/lib/db.js';
import { getSubscriberProfile, searchSubscribers } from '../src/services/subscribers.js';
import { hasDatabase } from './helpers/database.js';

const describeDb = hasDatabase ? describe : describe.skip;

afterAll(closePool);

describeDb('searchSubscribers', () => {
  it('finds a person by a case-insensitive fragment of their email', async () => {
    const page = await searchSubscribers('EMILY.MILLER827');

    expect(page.results.length).toBeGreaterThan(0);
    expect(page.results[0]?.email.toLowerCase()).toBe('emily.miller827@gmail.com');
    expect(page.results[0]?.status).toBe('active');
    expect(page.results[0]?.acquisitionSource).toBe('Instagram');
  });

  it('returns nobody for a string that matches no subscriber', async () => {
    expect(await searchSubscribers('no-such-person-zzzz')).toEqual({
      results: [],
      total: 0,
      limit: SEARCH_LIMIT,
      offset: 0,
    });
  });

  it('pages through the directory', async () => {
    const first = await searchSubscribers('', { limit: 10, offset: 0 });
    const second = await searchSubscribers('', { limit: 10, offset: 10 });

    expect(first.total).toBe(2900);
    expect(first.results).toHaveLength(10);
    expect(second.results).toHaveLength(10);
    expect(second.results[0]?.id).not.toBe(first.results[0]?.id);
  });
});

describeDb('getSubscriberProfile', () => {
  it('puts newsletter, website, and app activity on one record', async () => {
    const { results } = await searchSubscribers('paul.garcia558@gmail.com');
    expect(results[0]).toBeDefined();

    const profile = await getSubscriberProfile(results[0]!.id);

    expect(profile?.subscriber.email.toLowerCase()).toBe('paul.garcia558@gmail.com');
    expect(profile?.app.accounts.length).toBeGreaterThan(0);
    expect(profile?.website.pageviews).toBeDefined();
    expect(profile?.app.events).toBeDefined();
  });

  it('returns null when the id does not exist', async () => {
    expect(await getSubscriberProfile('00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});
