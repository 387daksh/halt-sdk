import { encoding_for_model } from "tiktoken";
import type OpenAI from "openai";
import type Anthropic from "@anthropic-ai/sdk";

// ─── Model Cost Table ────────────────────────────────────────────────────────

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  // OpenAI -- June 2026
  "gpt-5.5": { input: 0.000005, output: 0.00003 },
  "gpt-5.4": { input: 0.0000025, output: 0.000015 },
  "gpt-5.4-mini": { input: 0.00000075, output: 0.0000045 },
  "gpt-5.4-nano": { input: 0.0000002, output: 0.00000125 },
  "gpt-4.1": { input: 0.000002, output: 0.000008 },
  "gpt-4.1-mini": { input: 0.0000004, output: 0.0000016 },
  "gpt-4.1-nano": { input: 0.0000001, output: 0.0000004 },
  "gpt-4o": { input: 0.0000025, output: 0.00001 },
  "gpt-4o-mini": { input: 0.00000015, output: 0.0000006 },
  "o3": { input: 0.000002, output: 0.000008 },
  "o3-mini": { input: 0.0000011, output: 0.0000044 },
  "o4-mini": { input: 0.0000011, output: 0.0000044 },
  "o1": { input: 0.000015, output: 0.00006 },
  "o1-mini": { input: 0.000003, output: 0.000012 },
  // Anthropic -- June 2026
  "claude-opus-4-8": { input: 0.000005, output: 0.000025 },
  "claude-opus-4-7": { input: 0.000005, output: 0.000025 },
  "claude-sonnet-4-6": { input: 0.000003, output: 0.000015 },
  "claude-haiku-4-5": { input: 0.000001, output: 0.000005 },
  "claude-3-5-sonnet-20241022": { input: 0.000003, output: 0.000015 },
  "claude-3-5-haiku-20241022": { input: 0.0000008, output: 0.000004 },
  "claude-3-opus-20240229": { input: 0.000015, output: 0.000075 },
  "claude-3-haiku-20240307": { input: 0.00000025, output: 0.00000125 },
  // Google Gemini -- June 2026
  "gemini-3.5-flash": { input: 0.0000015, output: 0.000009 },
  "gemini-3.1-pro": { input: 0.000002, output: 0.000012 },
  "gemini-3.1-flash-lite": { input: 0.00000025, output: 0.0000015 },
  "gemini-2.5-pro": { input: 0.00000125, output: 0.00001 },
  "gemini-2.5-flash": { input: 0.0000003, output: 0.0000025 },
  "gemini-2.5-flash-lite": { input: 0.0000001, output: 0.0000004 },
  "gemini-1.5-pro": { input: 0.0000035, output: 0.0000105 },
  "gemini-1.5-flash": { input: 0.000000075, output: 0.0000003 },
  "gemini-2.0-flash": { input: 0.0000001, output: 0.0000004 },
  // DeepSeek -- June 2026
  "deepseek-v4-flash": { input: 0.00000014, output: 0.00000028 },
  "deepseek-v4-pro": { input: 0.000000435, output: 0.00000087 },
  "deepseek-v3": { input: 0.00000014, output: 0.00000028 },
  "deepseek-r1": { input: 0.00000055, output: 0.00000219 },
  // Groq (open source models) -- June 2026
  "llama-3.3-70b-versatile": { input: 0.00000059, output: 0.00000079 },
  "llama-3.1-8b-instant": { input: 0.00000005, output: 0.00000008 },
  "llama-3.1-70b-versatile": { input: 0.00000059, output: 0.00000079 },
  "mixtral-8x7b-32768": { input: 0.00000024, output: 0.00000024 },
  // Mistral -- June 2026
  "mistral-large-latest": { input: 0.000003, output: 0.000009 },
  "mistral-small-latest": { input: 0.000001, output: 0.000003 },
  "codestral-latest": { input: 0.000001, output: 0.000003 },
  "mistral-7b-instruct": { input: 0.00000025, output: 0.00000025 },
};

const DEFAULT_COST = { input: 0.000005, output: 0.000015 };

// ─── Errors ───────────────────────────────────────────────────────────────────

export class HaltBudgetExceeded extends Error {
  public spent: number;
  public limit: number;
  public partialResults: any[];
  public canResume: boolean;

  constructor(spent: number, limit: number, partialResults: any[] = [], canResume: boolean = false) {
    super(
      `Halt: budget exceeded. Spent $${spent.toFixed(6)} of $${limit.toFixed(6)} limit.` +
      (partialResults.length > 0 ? ` Partial results available.` : '')
    );
    this.name = "HaltBudgetExceeded";
    this.spent = spent;
    this.limit = limit;
    this.partialResults = partialResults;
    this.canResume = canResume;
  }

  public savePartialResults(filename: string = 'halt-partial-results.json'): void {
    try {
      const fs = require('fs');
      const data = {
        timestamp: new Date().toISOString(),
        spent: this.spent,
        limit: this.limit,
        partialResults: this.partialResults,
        canResume: this.canResume
      };
      fs.writeFileSync(filename, JSON.stringify(data, null, 2));
      console.log(`[Halt] Partial results saved to ${filename}`);
    } catch (e: any) {
      console.warn(`[Halt] Could not save partial results: ${e.message}`);
    }
  }

  public static loadPartialResults(filename: string = 'halt-partial-results.json'): any {
    try {
      const fs = require('fs');
      const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
      console.log(`[Halt] Loaded partial results from ${filename}`);
      return data;
    } catch (e: any) {
      console.warn(`[Halt] Could not load partial results: ${e.message}`);
      return null;
    }
  }
}

export class HaltConfigError extends Error {
  constructor(message: string) {
    super(`Halt config error: ${message}`);
    this.name = "HaltConfigError";
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HaltOptions {
  budget: string;
  model?: string;
  onExceed?: "throw" | "warn";
  stopMidStream?: boolean;
}

export interface HaltSession {
  readonly spent: number;
  readonly limit: number;
  readonly remaining: number;
  readonly stopMidStream: boolean;
  trackTokens: (inputTokens: number, outputTokens: number, model?: string, partialResults?: any[]) => void;
  check: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseBudget(budget: string): number {
  if (!budget || typeof budget !== "string") {
    throw new HaltConfigError("budget must be a non-empty string like '$5' or '$0.50'");
  }
  const cleaned = budget.replace("$", "").trim();
  const value = parseFloat(cleaned);
  if (isNaN(value)) {
    throw new HaltConfigError(`Cannot parse budget "${budget}". Use format like "$5" or "$0.50"`);
  }
  if (value <= 0) {
    throw new HaltConfigError(`Budget must be greater than $0. Got "${budget}"`);
  }
  if (value > 10000) {
    throw new HaltConfigError(`Budget "$${value}" seems unreasonably high. Max allowed is $10,000`);
  }
  return value;
}

function getCost(model: string): { input: number; output: number } {
  const normalized = model.toLowerCase().trim();
  if (MODEL_COSTS[normalized]) return MODEL_COSTS[normalized];
  // partial match fallback
  for (const key of Object.keys(MODEL_COSTS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return MODEL_COSTS[key];
    }
  }
  console.warn(`[Halt] Unknown model "${model}", using default GPT-4o pricing. Pass correct model name for accurate tracking.`);
  return DEFAULT_COST;
}

// ─── Core Session ─────────────────────────────────────────────────────────────

export function createSession(options: HaltOptions): HaltSession {
  if (!options || typeof options !== "object") {
    throw new HaltConfigError("options must be an object with at least a budget field");
  }

  const limit = parseBudget(options.budget);
  const model = options.model ?? "gpt-4o";
  const strategy = options.onExceed ?? "throw";
  const stopMidStream = options.stopMidStream ?? false;
  let spent = 0;

  function check(partialResults?: any[]) {
    if (spent >= limit) {
      if (strategy === "throw") {
        const canResume = partialResults !== undefined && partialResults.length > 0;
        throw new HaltBudgetExceeded(spent, limit, partialResults || [], canResume);
      } else {
        console.warn(
          `[Halt] Warning: budget exceeded. Spent $${spent.toFixed(6)} of $${limit.toFixed(6)}`
        );
      }
    }
  }

  function trackTokens(
    inputTokens: number,
    outputTokens: number,
    overrideModel?: string,
    partialResults?: any[]
  ) {
    if (typeof inputTokens !== "number" || inputTokens < 0) {
      throw new HaltConfigError("inputTokens must be a non-negative number");
    }
    if (typeof outputTokens !== "number" || outputTokens < 0) {
      throw new HaltConfigError("outputTokens must be a non-negative number");
    }
    const costs = getCost(overrideModel ?? model);
    const cost = inputTokens * costs.input + outputTokens * costs.output;
    spent += cost;
    check(partialResults);
  }

  return {
    get spent() { return spent; },
    get limit() { return limit; },
    get remaining() { return Math.max(0, limit - spent); },
    get stopMidStream() { return stopMidStream; },
    trackTokens,
    check,
  };
}

// ─── halt() Wrapper ───────────────────────────────────────────────────────────

export async function halt<T>(
  options: HaltOptions,
  fn: (session: HaltSession) => Promise<T>
): Promise<T> {
  const session = createSession(options);
  try {
    return await fn(session);
  } catch (e: any) {
    if (e instanceof HaltBudgetExceeded) {
      // Re-throw with additional context if needed
      throw e;
    }
    throw e;
  }
}

// Enhanced version that collects partial results
export async function haltWithRecovery<T>(
  options: HaltOptions,
  fn: (session: HaltSession) => Promise<T>,
  recoveryFn?: (error: HaltBudgetExceeded) => Promise<T>
): Promise<T> {
  const session = createSession(options);
  try {
    return await fn(session);
  } catch (e: any) {
    if (e instanceof HaltBudgetExceeded && recoveryFn) {
      return recoveryFn(e);
    }
    throw e;
  }
}

// ─── OpenAI Auto Wrapper ──────────────────────────────────────────────────────

export function wrapOpenAI<T extends OpenAI>(client: T, session: HaltSession): T {
  const originalCreate = client.chat.completions.create.bind(client.chat.completions);

  (client.chat.completions as any).create = async (params: any, options?: any) => {
    session.check();
    const response = await originalCreate(params, options);
    if (response && typeof response === "object" && "usage" in response) {
      const usage = (response as any).usage;
      if (usage?.prompt_tokens != null && usage?.completion_tokens != null) {
        session.trackTokens(
          usage.prompt_tokens,
          usage.completion_tokens,
          params.model
        );
      }
    }
    return response;
  };

  // Add streaming support for mid-stream stopping
  if (session.stopMidStream && client.chat.completions) {
    const originalStream = (client.chat.completions as any).create.bind(client.chat.completions);
    (client.chat.completions as any).create = async (params: any, options?: any) => {
      session.check();
      const response = await originalStream(params, options);

      // If streaming is requested and budget is tight, we need to wrap the stream
      if (params.stream && response && Symbol.asyncIterator in response) {
        let totalOutputTokens = 0;
        const collectedChunks: any[] = [];
        const streamWrapper = {
          [Symbol.asyncIterator]: async function* () {
            for await (const chunk of response) {
              // Estimate tokens in this chunk
              const content = chunk.choices?.[0]?.delta?.content || '';
              const chunkTokens = estimateTokens(content, params.model);
              totalOutputTokens += chunkTokens;

              // Collect chunk for partial results first
              collectedChunks.push(chunk);

              // Track tokens as we go
              session.trackTokens(0, chunkTokens, params.model, collectedChunks);

              // If mid-stream stopping is enabled and budget exceeded, throw with partial results
              if (session.stopMidStream && session.spent >= session.limit) {
                throw new HaltBudgetExceeded(
                  session.spent,
                  session.limit,
                  collectedChunks,
                  true // can resume
                );
              }

              yield chunk;
            }
          }
        };
        return streamWrapper;
      }

      return response;
    };
  }

  return client;
}

// ─── Anthropic Auto Wrapper ───────────────────────────────────────────────────

export function wrapAnthropic<T extends Anthropic>(client: T, session: HaltSession): T {
  const originalCreate = client.messages.create.bind(client.messages);

  (client.messages as any).create = async (params: any, options?: any) => {
    session.check();
    const response = await originalCreate(params, options);
    if (response && typeof response === "object" && "usage" in response) {
      const usage = (response as any).usage;
      if (usage?.input_tokens != null && usage?.output_tokens != null) {
        session.trackTokens(
          usage.input_tokens,
          usage.output_tokens,
          params.model
        );
      }
    }
    return response;
  };

  return client;
}

// ─── Token Estimator ──────────────────────────────────────────────────────────

export function estimateTokens(text: string, model: string = "gpt-4o"): number {
  if (typeof text !== "string") {
    throw new HaltConfigError("text must be a string");
  }
  try {
    const enc = encoding_for_model("gpt-4o");
    const tokens = enc.encode(text).length;
    enc.free();
    return tokens;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

// ─── Model Cost Lookup ────────────────────────────────────────────────────────

export function getModelCost(model: string): { input: number; output: number } {
  return getCost(model);
}

export function listSupportedModels(): string[] {
  return Object.keys(MODEL_COSTS);
}