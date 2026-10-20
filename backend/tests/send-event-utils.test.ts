import { describe, expect, it } from 'vitest';

import { createEventBody, parseEventArgs } from '../../scripts/send-event-utils.js';

describe('send-event CLI options', () => {
  it('keeps the existing event, device, and optional user flags', () => {
    expect(parseEventArgs(['--event', 'login', '--device', 'd_test_001', '--user', 'u_0d6f8a22']))
      .toMatchObject({ event: 'login', deviceId: 'd_test_001', userId: 'u_0d6f8a22' });
  });

  it('uses a supplied event ID so a caller can resend the same event', () => {
    const options = parseEventArgs([
      '--event', 'app_open', '--device', 'd_test_001', '--event-id', 'evt_repeat_001',
    ]);
    expect(createEventBody(options).event_id).toBe('evt_repeat_001');
    expect(createEventBody(options).event_id).toBe('evt_repeat_001');
  });

  it('generates a different event ID by default', () => {
    const options = parseEventArgs(['--event', 'app_open', '--device', 'd_test_001']);
    expect(createEventBody(options).event_id).not.toBe(createEventBody(options).event_id);
  });
});
