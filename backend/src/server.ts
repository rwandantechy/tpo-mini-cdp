/** Vercel entry. Does not listen, and does not open the database until a request arrives. */

import express, { type Express, type NextFunction, type Request, type Response } from 'express';

import { createApp } from './app.js';

let app: Express | undefined;

const entry = express();

entry.use((req: Request, res: Response, next: NextFunction) => {
  app ??= createApp();
  app(req, res, next);
});

export default entry;
