'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const server = read('server.js');
const pkg = JSON.parse(read('package.json'));
const env = read('.env.example');
const render = read('render.yaml');
const manifest = JSON.parse(read('manifest.webmanifest'));
const sw = read('sw.js');
const failures = [];
function need(condition, label) { if (!condition) failures.push(label); }
need(pkg.version === '26.7.1', 'package version must be 26.7.1');
need(manifest.name.includes('26.7.1'), 'manifest version mismatch');
need(sw.includes('26-7-1'), 'service-worker cache version mismatch');
need(html.includes('USBKStudies 26.7.1'), 'frontend version marker missing');
need(server.includes('USBKStudies 26.7.1'), 'backend version marker missing');
// The feature list is a coverage check, not proof of external providers working.
for (const [id, label] of [
  ['home','Home / Founder Dashboard'], ['offline','Offline Study Mode'], ['ai','Utsab AI'],
  ['books','Global Book Finder'], ['research','Web Research'], ['questions','Practice Questions'],
  ['questionbank','Question Bank'], ['study','Study Pack'], ['knowledge','Knowledge System'],
  ['exam','Exam Center'], ['planner','Study Planner'], ['notes','Notes'], ['flashcards','Flashcards / Memory'],
  ['library','Personal Library'], ['toolbox','Study Toolbox'], ['dashboard','Learning Dashboard'],
  ['settings','Settings'], ['auth','Authentication']
]) need(html.includes('id=\"'+id+'\"') || html.includes("id='"+id+"'"), `missing UI module: ${label}`);
for (const route of [
  '/api/health','/api/auth/register','/api/auth/login','/api/auth/me','/api/auth/change-password',
  '/api/auth/password-reset/request','/api/auth/password-reset/confirm','/api/ai/chat','/api/ai/study-pack',
  '/api/ai/previous-questions','/api/ai/tutor-mode','/api/books/search','/api/research','/api/dashboard',
  '/api/notes','/api/flashcards','/api/library','/api/chat/history','/api/tasks','/api/knowledge','/api/exam-logs','/api/settings'
]) need(server.includes(route), `missing API route marker: ${route}`);
need(server.includes('bcrypt.hash'), 'password hashing marker missing');
need(server.includes('jwt.verify'), 'JWT verification marker missing');
need(server.includes('rateLimit('), 'rate limiting marker missing');
need(server.includes('X-Content-Type-Options'), 'security header missing');
need(server.includes('user_id=$1') || server.includes('user_id=$2'), 'user scoping marker missing');
need(server.includes('GOOGLE_BOOKS') || server.includes('googleapis.com/books/v1/volumes'), 'Google Books adapter missing');
need(html.includes('nctb.gov.bd'), 'NCTB source missing in frontend');
need(env.includes('DATABASE_URL=') && env.includes('JWT_SECRET='), 'secret placeholders missing');
need(!/sk-[A-Za-z0-9]{20,}/.test(env), 'possible hard-coded API key in env example');
need(render.includes('healthCheckPath: /api/health'), 'Render health check missing');
need(!sw.includes("url.pathname.startsWith('/api/')" ) ? false : true, 'service worker must not cache API/private responses');
need(fs.existsSync(path.join(root,'README.md')), 'README missing');
need(fs.existsSync(path.join(root,'FEATURE_STATUS.md')), 'feature status missing');
need(fs.existsSync(path.join(root,'TEST_REPORT.md')), 'test report missing');
if (failures.length) { console.error('Acceptance checks FAILED:'); failures.forEach(x=>console.error(' - '+x)); process.exit(1); }
console.log('Acceptance checks OK: version consistency, core modules/routes, auth/security markers, book sources, deployment and private-data cache exclusions.');
console.log('Note: these are static acceptance checks; external API, DB, SMTP and hosted-browser tests require configured services.');