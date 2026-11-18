import 'dotenv/config';
// Vercel's Express preset looks for an entrypoint that imports express.
// The app itself is built in lib/app.js (so tests can create it with mocks).
// eslint-disable-next-line no-unused-vars
import express from 'express';
import { createApp } from './lib/app.js';
import { createAnthropicClient, DEFAULT_MODEL } from './lib/claude.js';

const onVercel = Boolean(process.env.VERCEL);
const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
const model = process.env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL;

const anthropic = apiKey ? createAnthropicClient(apiKey) : null;
const app = createApp({
  anthropic,
  model,
  // Locally, only a tunnel agent on loopback is trusted to set X-Forwarded-For.
  // On Vercel the edge overwrites X-Forwarded-For with the real client IP, so trust one hop.
  trustProxy: onVercel ? 1 : 'loopback',
});

// Vercel imports the default export and runs it as a function; locally we listen.
if (!onVercel) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '127.0.0.1';
  app.listen(port, host, () => {
    console.log(`Wallet Card running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    console.log(anthropic ? `Claude enabled (model ${model})` : 'Claude disabled: set ANTHROPIC_API_KEY in .env to enable "Polish with Claude"');
  });
}

export default app;
