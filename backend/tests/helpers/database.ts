import { loadDotenv } from '../../src/config/dotenv.js';

loadDotenv();

export const hasDatabase = Boolean(process.env.DATABASE_URL);

export class RollbackSignal extends Error {
  constructor() {
    super('rollback');
    this.name = 'RollbackSignal';
  }
}
