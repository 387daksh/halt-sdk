# Halt SDK

> **A hard budget kill switch for TypeScript AI agents**

[![npm version](https://img.shields.io/npm/v/halt-sdk?color=cb3837&logo=npm)](https://www.npmjs.com/package/halt-sdk)
[![npm downloads](https://img.shields.io/npm/dt/halt-sdk?label=downloads&color=0e75b6)](https://www.npmjs.com/package/halt-sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-first-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Set a spend limit. Halt enforces it. When your agent hits the limit, execution stops: no surprises, no overages.

**Why:** autonomous agents loop, retry and call tools on their own. One runaway loop can burn a month's API budget overnight. Dashboards tell you after the fact; Halt stops the call before it happens.

```bash
npm install halt-sdk
```

## Features

✅ **Hard Budget Enforcement** - Stops execution when budget is exceeded
✅ **Auto-tracking** - Wrap your OpenAI/Anthropic clients, tokens tracked automatically
✅ **Mid-stream Stopping** - Stop generation mid-stream to prevent overages
✅ **Partial Results** - Save and recover partial results when budget is hit
✅ **40+ Models Priced** - OpenAI, Anthropic, Gemini, DeepSeek, Mistral, Llama (incl. via Groq)
✅ **TypeScript First** - Full type safety and IntelliSense support

## Install

```bash
npm install halt-sdk
# or
pnpm add halt-sdk
# or
yarn add halt-sdk
```

## Quick Start

### Basic Usage

```typescript
import { createSession, wrapOpenAI } from 'halt-sdk';
import OpenAI from 'openai';

// Set your budget
const session = createSession({ budget: '$5' });

// Wrap your OpenAI client
const openai = wrapOpenAI(new OpenAI(), session);

// Use it normally - Halt tracks tokens automatically
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }]
});

console.log(`Spent: $${session.spent.toFixed(6)}`);
```

### Mid-stream Stopping

```typescript
import { createSession, wrapOpenAI, HaltBudgetExceeded } from 'halt-sdk';
import OpenAI from 'openai';

const session = createSession({ 
  budget: '$5', 
  stopMidStream: true  // Enable mid-stream stopping
});

const openai = wrapOpenAI(new OpenAI(), session);

try {
  const stream = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Write a long story...' }],
    stream: true
  });

  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || '');
  }
} catch (error) {
  if (error instanceof HaltBudgetExceeded) {
    console.log('Budget exceeded! Stopped mid-stream.');
    console.log(`Partial results: ${error.partialResults}`);
  }
}
```

### Manual Tracking

```typescript
import { halt } from 'halt-sdk';
import OpenAI from 'openai';

const openai = new OpenAI();

await halt({ budget: '$10' }, async (session) => {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Hello!' }]
  });

  // Manually track tokens
  session.trackTokens(
    response.usage.prompt_tokens,
    response.usage.completion_tokens,
    'gpt-4o'
  );

  console.log(`Remaining: $${session.remaining.toFixed(6)}`);
});
```

## API Reference

### `createSession(options)`

Create a budget session with optional parameters.

```typescript
const session = createSession({
  budget: '$5',           // Required: Your budget
  stopMidStream: false,   // Optional: Stop mid-stream (default: false)
  warnOnly: false,        // Optional: Warn instead of throwing (default: false)
  model: 'gpt-4o'         // Optional: Default model for cost calculation
});
```

### `wrapOpenAI(client, session)`

Wrap an OpenAI client for automatic token tracking.

```typescript
import OpenAI from 'openai';
import { wrapOpenAI } from 'halt-sdk';

const openai = wrapOpenAI(new OpenAI(), session);
// Now all calls are automatically tracked
```

### `wrapAnthropic(client, session)`

Wrap an Anthropic client for automatic token tracking.

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { wrapAnthropic } from 'halt-sdk';

const anthropic = wrapAnthropic(new Anthropic(), session);
// Now all calls are automatically tracked
```

### `session.trackTokens(promptTokens, completionTokens, model?)`

Manually track token usage.

```typescript
session.trackTokens(100, 50, 'gpt-4o'); // 100 input, 50 output tokens
```

### `session.check()`

Check if budget is exceeded (throws if it is).

```typescript
try {
  session.check();
  console.log('Budget OK');
} catch (error) {
  console.log('Budget exceeded!');
}
```

## Supported Models

Halt SDK supports automatic cost calculation for the latest models (June 2026 pricing):

### OpenAI
- **GPT-5 Series**: gpt-5.5, gpt-5.4, gpt-5.4-mini, gpt-5.4-nano
- **GPT-4 Series**: gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, gpt-4o, gpt-4o-mini
- **Omni Series**: o1, o1-mini, o3, o3-mini, o4-mini

### Anthropic
- **Claude 4**: claude-opus-4-8, claude-opus-4-7, claude-sonnet-4-6, claude-haiku-4-5
- **Claude 3**: claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022, claude-3-opus-20240229, claude-3-haiku-20240307

### Google Gemini
- **Gemini 3**: gemini-3.5-flash, gemini-3.1-pro, gemini-3.1-flash-lite
- **Gemini 2**: gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite
- **Gemini 1**: gemini-1.5-pro, gemini-1.5-flash, gemini-2.0-flash

### DeepSeek
- deepseek-v4-flash, deepseek-v4-pro, deepseek-v3, deepseek-r1

### Groq (Open Source)
- llama-3.3-70b-versatile, llama-3.1-8b-instant, llama-3.1-70b-versatile, mixtral-8x7b-32768

### Mistral
- mistral-large-latest, mistral-small-latest, codestral-latest, mistral-7b-instruct

## Error Handling

Halt SDK throws `HaltBudgetExceeded` when budget is exceeded:

```typescript
import { HaltBudgetExceeded } from 'halt-sdk';

try {
  // Your AI operations
} catch (error) {
  if (error instanceof HaltBudgetExceeded) {
    console.log(`Budget exceeded: $${error.spent} > $${error.limit}`);
    console.log(`Partial results:`, error.partialResults);
  }
}
```

## Configuration

### Environment Variables

```bash
# Set default budget for all sessions
HALT_DEFAULT_BUDGET=$5

# Enable debug logging
HALT_DEBUG=true
```

### TypeScript Support

Halt SDK includes full TypeScript definitions:

```typescript
import type { HaltSession, HaltOptions } from 'halt-sdk';

const options: HaltOptions = {
  budget: '$10',
  stopMidStream: true
};

const session: HaltSession = createSession(options);
```

## Examples

### Agentic Workflows

```typescript
import { createSession, wrapOpenAI } from 'halt-sdk';
import OpenAI from 'openai';

const session = createSession({ budget: '$20' });
const openai = wrapOpenAI(new OpenAI(), session);

async function agenticTask() {
  let messages = [{ role: 'system', content: 'You are a helpful assistant.' }];

  while (true) {
    session.check(); // Check budget before each iteration

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages
    });

    messages.push(response.choices[0].message);

    if (response.choices[0].message.content.includes('DONE')) {
      break;
    }
  }
}
```

### Multiple Models

```typescript
import { createSession, wrapOpenAI, wrapAnthropic } from 'halt-sdk';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const session = createSession({ budget: '$15' });
const openai = wrapOpenAI(new OpenAI(), session);
const anthropic = wrapAnthropic(new Anthropic(), session);

// Both clients share the same budget
const openaiResponse = await openai.chat.completions.create(...);
const anthropicResponse = await anthropic.messages.create(...);

console.log(`Total spent: $${session.spent.toFixed(6)}`);
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

MIT © [Daksh Goyal](https://github.com/387daksh)

## Support

For questions or issues, please open a GitHub issue.

---

**Built with ❤️ for AI developers who care about costs**

[![npm version](https://badge.fury.io/js/halt-sdk.svg)](https://badge.fury.io/js/halt-sdk)
[![TypeScript](https://badgen.net/badge/icon/typescript?icon=typescript&label)](https://typescriptlang.org/)