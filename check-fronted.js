'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(m => m[1]).filter(s => s.trim());
if (!scripts.length) throw new Error('No inline JavaScript found in index.html');
for (let i = 0; i < scripts.length; i++) new vm.Script(scripts[i], { filename: `index.inline-${i + 1}.js` });
const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]);
const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
if (dup.length) throw new Error(`Duplicate HTML id(s): ${[...new Set(dup)].join(', ')}`);
const inline = scripts.join('\n');
const functions = new Set([...inline.matchAll(/(?:async\s+)?function\s+([\w$]+)\s*\(/g)].map(m => m[1]));
const handlers = [...html.matchAll(/\bonclick=["']([^"']+)["']/g)].map(m => m[1]);
const safeGlobals = new Set(['show','Number','localStorage','JSON','String','document','window','confirm','prompt','alert','Math','Date','setTimeout','clearInterval','setInterval','encodeURIComponent']);
const missing = new Set();
for (const h of handlers) for (const m of h.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
  const name = m[1];
  if (!functions.has(name) && !safeGlobals.has(name) && !['getElementById','setItem','splice','click'].includes(name)) missing.add(name);
}
if (missing.size) throw new Error(`Potentially undefined inline handler function(s): ${[...missing].join(', ')}`);
const navMatch = inline.match(/const nav=\[(.*?)\];/s);
if (navMatch) {
  const navIds = [...navMatch[1].matchAll(/\[['"]([^'"]+)['"]/g)].map(m => m[1]);
  for (const id of navIds) if (!ids.includes(id)) throw new Error(`Navigation section has no HTML element: ${id}`);
}
for (const route of ['/api/auth/register','/api/auth/login','/api/ai/chat','/api/ai/study-pack','/api/ai/previous-questions','/api/ai/tutor-mode','/api/research','/api/dashboard']) {
  if (!server.includes(route)) throw new Error(`Expected backend route missing: ${route}`);
}
if (!server.includes('teacher-simulator":"Act as a patient school teacher')) throw new Error('Teacher Simulator instruction is missing.');
console.log(`Frontend syntax OK (${scripts.length} inline script block(s)); ${ids.length} unique HTML IDs; navigation and required route checks passed.`);