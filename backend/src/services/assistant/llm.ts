import {
  createPartFromFunctionResponse,
  GoogleGenAI,
  type Content,
  type FunctionCall,
  type Part,
} from '@google/genai';

import { ASSISTANT_DEADLINE_MS } from '../../config/constants.js';
import { log } from '../../lib/logger.js';
import { serviceUnavailable } from '../../lib/errors.js';
import { TOOL_DECLARATIONS } from './tools.js';

export interface GeminiRequest {
  model: string;
  systemInstruction: string;
  contents: Content[];
  timeoutMs?: number;
  /** Narration calls send JSON only. Tool declarations stay off so the question is not implied. */
  includeTools?: boolean;
}

export interface GeminiTurn {
  text?: string;
  functionCalls?: FunctionCall[];
  modelContent?: Content;
}

export interface GeminiClient {
  generate(request: GeminiRequest): Promise<GeminiTurn>;
}

/** Each attempt stays short enough that a fallback still fits under the 30s function limit. */
const MODEL_ATTEMPT_MS = 12_000;

export function createGemini(apiKey: string, fallbackModel?: string): GeminiClient {
  const ai = new GoogleGenAI({ apiKey });

  return {
    async generate(request) {
      const budget = Math.max(1_000, request.timeoutMs ?? ASSISTANT_DEADLINE_MS);
      const canFallback = Boolean(fallbackModel && fallbackModel !== request.model);
      const primaryMs = canFallback ? Math.min(MODEL_ATTEMPT_MS, budget) : budget;

      try {
        return await callModel(ai, { ...request, timeoutMs: primaryMs }, request.model);
      } catch (error) {
        const remaining = budget - primaryMs;
        if (canFallback && shouldTryFallback(error) && remaining >= 1_000) {
          log.warn('gemini primary failed, trying fallback', { model: fallbackModel });
          try {
            return await callModel(
              ai,
              { ...request, timeoutMs: Math.min(MODEL_ATTEMPT_MS, remaining) },
              fallbackModel as string,
            );
          } catch (fallbackError) {
            throw unavailable(fallbackError);
          }
        }

        throw unavailable(error);
      }
    },
  };
}

export function functionResponseParts(calls: FunctionCall[], results: Array<Record<string, unknown>>): Part[] {
  return calls.map((call, index) =>
    createPartFromFunctionResponse(call.id ?? call.name ?? `call_${index}`, call.name ?? 'unknown', results[index] ?? {}),
  );
}

export function isGeminiCapacityError(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  const text = error instanceof Error ? error.message : String(error);
  if (status === 429 || status === 503) return true;
  return /429|503|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|rate.?limit|overloaded|try again later/i.test(
    text,
  );
}

export function isGeminiTimeoutError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  const text = error instanceof Error ? error.message : String(error);
  if (name === 'TimeoutError' || name === 'AbortError') return true;
  return /operation was aborted|aborted due to timeout/i.test(text);
}

export function shouldTryFallback(error: unknown): boolean {
  return isGeminiCapacityError(error) || isGeminiTimeoutError(error);
}

async function callModel(ai: GoogleGenAI, request: GeminiRequest, model: string): Promise<GeminiTurn> {
  const timeoutMs = Math.max(1_000, request.timeoutMs ?? ASSISTANT_DEADLINE_MS);
  const response = await ai.models.generateContent({
    model,
    contents: request.contents,
    config: {
      systemInstruction: request.systemInstruction,
      ...(request.includeTools === false ? {} : { tools: [{ functionDeclarations: [...TOOL_DECLARATIONS] }] }),
      automaticFunctionCalling: { disable: true },
      abortSignal: AbortSignal.timeout(timeoutMs),
    },
  });

  const modelContent = response.candidates?.[0]?.content;
  const parts = modelContent?.parts ?? [];
  const functionCalls = parts
    .map((part) => part.functionCall)
    .filter((call): call is FunctionCall => Boolean(call?.name));

  if (functionCalls.length > 0) {
    return { functionCalls, modelContent };
  }

  const text = parts
    .filter((part) => !part.thought)
    .map((part) => part.text)
    .filter((value): value is string => Boolean(value))
    .join('')
    .trim();

  return { text, modelContent };
}

function unavailable(error: unknown): Error {
  const text = error instanceof Error ? error.message : String(error);
  log.warn('gemini request failed', { error: text });

  if (isGeminiTimeoutError(error)) {
    return serviceUnavailable('The assistant took too long. Try again.');
  }

  if (isGeminiCapacityError(error)) {
    return serviceUnavailable('The assistant is busy. Try again in a minute.');
  }

  return serviceUnavailable('The assistant could not answer just now.');
}
