import { Router } from 'express';
import { z } from 'zod';

import {
  ASSISTANT_ANSWER_MAX_LENGTH,
  ASSISTANT_HISTORY_TURNS,
  ASSISTANT_QUESTION_MAX_LENGTH,
} from '../config/constants.js';
import { getServerEnv } from '../config/env.js';
import { serviceUnavailable } from '../lib/errors.js';
import { ask, modelUserText, PII_REFUSAL } from '../services/assistant/ask.js';
import { createGemini } from '../services/assistant/gemini.js';
import type { Limiters } from '../middleware/rateLimit.js';

const bodySchema = z.object({
  question: z.string().trim().min(1, 'Ask a question.').max(ASSISTANT_QUESTION_MAX_LENGTH),
  history: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(ASSISTANT_QUESTION_MAX_LENGTH),
        answer: z.string().trim().min(1).max(ASSISTANT_ANSWER_MAX_LENGTH),
      }),
    )
    .max(ASSISTANT_HISTORY_TURNS)
    .optional(),
});

export function assistantRouter(limiters: Limiters): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ available: Boolean(getServerEnv().GEMINI_API_KEY) });
  });

  router.post('/', limiters.assistant, async (req, res) => {
    const { question, history } = bodySchema.parse(req.body);
    const gated = modelUserText(question);
    if (!gated.ok) {
      res.json({
        answer: gated.reason === 'pii' ? PII_REFUSAL : 'Ask a question about totals, pages, or segments.',
        blocked: gated.reason === 'pii',
        tables: [],
      });
      return;
    }

    const env = getServerEnv();
    if (!env.GEMINI_API_KEY) {
      throw serviceUnavailable('The assistant is not configured on this server.');
    }

    const createdBy = req.session?.sub ?? 'unknown';
    const result = await ask(question, {
      gemini: createGemini(env.GEMINI_API_KEY, env.GEMINI_FALLBACK_MODEL),
      model: env.GEMINI_MODEL,
      createdBy,
      history,
    });

    res.json(result);
  });

  return router;
}
