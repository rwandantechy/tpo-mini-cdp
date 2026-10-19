import type { PeoplePage } from '../subscribers/types.ts';

export type LastOpenFilter = 'any' | 'never' | 'cold';

export interface SegmentDefinition {
  acquisitionSource?: string;
  status?: string;
  signupFrom?: string;
  signupTo?: string;
  lastOpen?: LastOpenFilter;
  hasWebsite?: boolean;
  hasApp?: boolean;
}

export interface SegmentPreview extends PeoplePage {
  cutoffDate: string;
}

export interface SavedSegment {
  id: string;
  name: string;
  definition: SegmentDefinition;
  createdAt: string;
}
