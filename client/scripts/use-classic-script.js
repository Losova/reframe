import { readFile, writeFile } from 'node:fs/promises';

const indexUrl = new URL('../dist/index.html', import.meta.url);
const html = await readFile(indexUrl, 'utf8');
const nextHtml = html.replace(
  /<script type="module" crossorigin src="([^"]+)"><\/script>/,
  '<script defer src="$1"></script>'
);

if (nextHtml === html) {
  throw new Error('Unable to rewrite Vite module script to a classic script.');
}

await writeFile(indexUrl, nextHtml);
