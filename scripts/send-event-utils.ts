import { randomUUID } from 'node:crypto';

export interface EventOptions {
  event: string;
  deviceId: string;
  userId: string | null;
  eventId?: string;
}

export function parseEventArgs(args: string[]): EventOptions {
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!['--event', '--device', '--user', '--event-id'].includes(flag ?? '')) {
      throw new Error(`Unknown option: ${flag}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Expected a value after ${flag}.`);
    options.set(flag as string, value);
    index += 1;
  }

  const event = options.get('--event') ?? 'read_story';
  const deviceId = options.get('--device')?.trim();
  const userId = options.get('--user')?.trim() || null;
  const eventId = options.get('--event-id')?.trim();
  if (!deviceId) throw new Error('Provide --device <id>.');
  if (!['app_open', 'read_story', 'link_click', 'login'].includes(event)) {
    throw new Error('Event must be app_open, read_story, link_click, or login.');
  }
  if (event === 'login' && !userId) throw new Error('Provide --user <id> for a login event.');
  if (options.has('--event-id') && !eventId) throw new Error('Provide a non-empty value for --event-id.');
  return { event, deviceId, userId, ...(eventId ? { eventId } : {}) };
}

export function createEventBody(options: EventOptions): Record<string, unknown> {
  return {
    event_id: options.eventId ?? `evt_${randomUUID()}`,
    event: options.event,
    user_id: options.userId,
    device_id: options.deviceId,
    timestamp: new Date().toISOString(),
    properties: {},
  };
}
