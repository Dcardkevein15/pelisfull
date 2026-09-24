#!/usr/bin/env node
/* 🔔 IndexNow: avisa a Bing/Yandex de las URLs nuevas/actualizadas
   (Google no participa, pero su Search Console + sitemap.xml ya cubren el resto). */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')), '..');
/* Prioriza las URLs publicadas HOY (seo-new-urls.json); si no hay, todo el sitemap */
let urls = JSON.parse(fs.readFileSync(path.join(ROOT, 'sitemap-urls.json'), 'utf8'));
try {
  const nuevas = JSON.parse(fs.readFileSync(path.join(ROOT, 'seo-new-urls.json'), 'utf8'));
  if (Array.isArray(nuevas) && nuevas.length) urls = nuevas;
} catch {}
console.log(`IndexNow: enviando ${urls.length} urls`);
const KEY = 'xstream-2026';

const chunks = [];
for (let i = 0; i < urls.length; i += 9000) chunks.push(urls.slice(i, i + 9000));

for (const chunk of chunks) {
  const r = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      host: 'x.yapido.click',
      key: KEY,
      keyLocation: `https://x.yapido.click/indexnow-${KEY}.txt`,
      urlList: chunk,
    }),
  });
  console.log('IndexNow →', r.status, `(${chunk.length} urls)`);
}
