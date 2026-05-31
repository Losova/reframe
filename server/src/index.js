import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app.js';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);

export async function startServer() {
  await mkdir(config.uploadDirectory, { recursive: true });

  const app = createApp();
  const builtIndexPath = path.join(config.clientDistDirectory, 'index.html');
  const hasBuiltClient = await access(builtIndexPath)
    .then(() => true)
    .catch(() => false);

  if (hasBuiltClient) {
    app.use(express.static(config.clientDistDirectory));
    app.get(/^\/(?!api).*/, (_request, response) => {
      response.sendFile(builtIndexPath);
    });
  }

  app.listen(config.port, () => {
    console.log(`Reframe server running on http://localhost:${config.port}`);
  });
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
