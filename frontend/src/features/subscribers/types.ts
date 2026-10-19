export interface Person {
  id: string;
  email: string;
  status: string;
  acquisitionSource: string | null;
  signupDate: string | null;
  lastOpenDate: string | null;
}

export interface PeoplePage {
  results: Person[];
  total: number;
  limit: number;
  offset: number;
}

export interface PersonRecord {
  subscriber: Person;
  website: {
    visitors: number;
    pageviews: Array<{
      visitorId: string;
      page: string;
      occurredAt: string;
      utmSource: string | null;
      channel: string | null;
    }>;
  };
  app: {
    accounts: Array<{ userId: string; createdDate: string | null; origin: string }>;
    events: Array<{
      eventId: string;
      event: string;
      deviceId: string;
      occurredAt: string;
    }>;
  };
}
