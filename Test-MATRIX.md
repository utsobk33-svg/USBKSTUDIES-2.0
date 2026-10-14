USBKStudies 26.7.1 — Test Matrix
Automated checks run in this environment
Check
Result
What it proves
node --check server.js
PASS
Backend file parses as JavaScript
node --check sw.js
PASS
Service worker parses as JavaScript
scripts/check-frontend.js
PASS
Inline JS syntax, duplicate IDs, navigation targets, inline handler names and core route markers
scripts/quality-check.js
PASS
Version/config markers, NCTB/Google Books/search setup, security markers and required files
scripts/acceptance-check.js
PASS
Core module and API route markers, auth/security markers, release consistency, and no caching of private API responses
npm test
PASS
All checks above executed in sequence
ZIP integrity (unzip -t)
PASS after packaging
Archive entries can be read without CRC errors
Not executed (requires dependencies or accounts)
npm install did not complete within the restricted build environment; dependency installation and a real server boot were therefore not verified.
PostgreSQL connection/schema creation and real account/note/card/task CRUD.
AI provider request/response, vision model attachment, quotas and timeout behavior.
Google Books live HTTP request, configured live web-search provider, SMTP delivery and password-reset email.
Render deployment, mobile-browser UI interaction, PWA install and offline navigation on a physical device.
These are explicitly pending, not silently skipped or reported as passing. Use TEST_REPORT.md and the post-deploy smoke checklist in README.md.