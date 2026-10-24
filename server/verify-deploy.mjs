import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const base = dirname(fileURLToPath(import.meta.url));
for (const name of ['server.js', 'ripe-engine.js', 'ripe-review.js']) {
  if (!existsSync(join(base, name))) {
    console.error(`DEPLOY INCOMPLET: fichier manquant server/${name}. Vérifier le commit GitHub et le Root Directory Render.`);
    process.exitCode = 1;
  }
}
if (!process.exitCode) {
  await import('./ripe-engine.js');
  await import('./ripe-review.js');
  console.log('OK: modules RIPE présents et importables.');
}
