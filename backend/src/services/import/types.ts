import type { AcquisitionSource, SubscriberStatus } from '../../config/constants.js';

export interface SubscriberRecord {
  emailNormalized: string;
  emailOriginal: string;
  signupDate: string | null;
  status: SubscriberStatus;
  acquisitionSource: string | null;
  lastOpenDate: string | null;
}

export interface WebEventRecord {
  visitorId: string;
  page: string;
  occurredAt: Date;
  utmSource: string | null;
  channel: AcquisitionSource | null;
  capturedEmail: string | null;
}

export interface AppUserRecord {
  userId: string;
  emailNormalized: string | null;
  emailOriginal: string | null;
  createdDate: string | null;
}

/** Skip only when there is no identity key. A bad date is a warning, not a skip. */
export type RowOutcome<T> =
  | { ok: true; record: T; warnings: string[] }
  | { ok: false; reason: string };

export interface ImportReport {
  source: string;
  rowsRead: number;
  rowsInserted: number;
  rowsMerged: number;
  rowsSkipped: number;
  skipReasons: Record<string, number>;
  warnings: Record<string, number>;
}

export interface ImportSummary {
  subscribers: ImportReport;
  appUsers: ImportReport;
  webEvents: ImportReport;
  linking: {
    appUsersLinked: number;
    appUsersWithoutSubscriber: number;
    visitorsIdentified: number;
    visitorsAnonymous: number;
  };
}

export function emptyReport(source: string): ImportReport {
  return {
    source,
    rowsRead: 0,
    rowsInserted: 0,
    rowsMerged: 0,
    rowsSkipped: 0,
    skipReasons: {},
    warnings: {},
  };
}

export function countInto(tally: Record<string, number>, key: string): void {
  tally[key] = (tally[key] ?? 0) + 1;
}
