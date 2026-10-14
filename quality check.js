'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const pkg = JSON.parse(read('package.json'));
const manifest = JSON.parse(read('manifest.webmanifest'));
const html = read('index.html');
const server = read('server.js');
const env = read('.env.example');
const render = read('render.yaml');
const failures = [];
const requireText = (text, pattern, label) => { if (!pattern.test(text)) failures.push(label); };
if (pkg.version !== '26.7.1') failures.push('package version must be 26.7.1');
requireText(html, /USBKStudies 26\.7\.1/, 'frontend version marker missing');
requireText(server, /service: "USBKStudies 26\.7\.1"/, 'backend health version missing');
requireText(server, /\/api\/books\/search/, 'Google Books endpoint missing');
requireText(server, /customsearch\/v1/, 'Google Custom Search adapter missing');
requireText(server, /GOOGLE_CSE_API_KEY && process\.env\.GOOGLE_CSE_CX/, 'Google CSE health configuration missing');
requireText(server, /\/api\/research/, 'live research endpoint missing');
requireText(server, /X-Content-Type-Options/, 'basic security headers missing');
requireText(env, /GOOGLE_CSE_API_KEY=/, 'Google CSE key placeholder missing from .env.example');
requireText(env, /GOOGLE_CSE_CX=/, 'Google CSE engine ID placeholder missing from .env.example');
requireText(render, /key: GOOGLE_CSE_API_KEY/, 'Render Google CSE key env missing');
requireText(render, /key: GOOGLE_CSE_CX/, 'Render Google CSE engine ID env missing');
requireText(html, /booksPagination/, 'book pagination UI missing');
requireText(html, /changeBookPage\(delta\)/, 'book pagination handler missing');
requireText(html, /nctb\.gov\.bd\/site\/view\/ebooks/, 'official NCTB e-book link missing');
requireText(html, /function searchBooks\(/, 'book finder function missing');
requireText(html, /function liveResearch\(/, 'web research UI function missing');
requireText(server, /password_reset_tokens/, 'password reset table missing');
requireText(server, /bcrypt\.hash/, 'password hashing missing');
requireText(server, /jwt\.verify/, 'JWT verification missing');
requireText(server, /rateLimit\(/, 'API rate limits missing');
requireText(server, /CREATE TABLE IF NOT EXISTS flashcards/, 'flashcards database table missing');
requireText(server, /CREATE TABLE IF NOT EXISTS study_tasks/, 'study planner database table missing');
requireText(server, /CREATE TABLE IF NOT EXISTS exam_logs/, 'exam log database table missing');
requireText(manifest.name, /26\.7\.1/, 'PWA manifest version missing');
for (const file of ['index.html', 'server.js', 'package.json', '.env.example', 'README.md', 'FEATURE_STATUS.md', 'render.yaml', 'manifest.webmanifest', 'sw.js', 'icon.svg']) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`required project file missing: ${file}`);
}
if (failures.length) {
  console.error('Quality checks FAILED:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log('Quality checks OK: version, book search, Google CSE adapter, NCTB link, core security markers, PWA and deployment files.');