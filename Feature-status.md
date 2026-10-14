USBKStudies 26.7.1 — Feature Status and Test Report
Included in source
Responsive dark single-page UI; Learn With Utsab branding; PWA manifest/service-worker app-shell cache
Student and Teacher registration/login, profile changes, password change, JWT session
PostgreSQL per-user records for notes, flashcards/reviews, personal library, chat history, study tasks, exam logs, knowledge concepts, settings and dashboard counters
Utsab AI chat adapter, multilingual prompt selection, practice Study Pack, previous-question practice generator and tutor modes (Socratic, Mistake Detective, Examiner/Viva, Teacher Simulator, revision, concept map)
Voice input through browser speech recognition where supported; answer read-aloud through speech synthesis where supported
Camera/gallery image attachment and text/PDF attachment flows; AI vision depends on provider model capability
Live-search adapter for Tavily-compatible provider (recommended for new setups), with legacy Google Custom Search JSON API support only for existing eligible customers
Global Book Finder: Google Books catalogue search by title/author/subject/ISBN, language filter, pagination, book info/preview links, optional 30-minute refresh, and official NCTB e-book source links
Study planner/task list, knowledge system, question bank, flashcards, notes, library, founder task list, calculator, timer, unit converter, print/PDF via browser, dashboard, settings
Local offline notes, flashcards, questions, revision logs and JSON backup/restore; app-shell cache after online visit
Email password reset via configured SMTP provider
Checks performed for 26.7.1
node --check server.js — syntax check
scripts/check-frontend.js — inline JavaScript syntax, duplicate HTML IDs, navigation IDs and required route markers
scripts/quality-check.js — version consistency, search provider configuration markers, NCTB link, core security markers, PWA and required files
ZIP integrity test is run after packaging
Live internet access was unavailable in the build environment, so Google Books/Google CSE calls could not be exercised against live services here
No real PostgreSQL, AI provider, SMTP, or Render credentials were available; those require deployment smoke tests
Requires external setup
DATABASE_URL and JWT_SECRET are required for the server to start
AI chat and generation require a supported AI provider, valid key, model and compatible endpoint
Live research requires a compatible provider key; Google Custom Search JSON API is closed to new customers and existing users must transition by 2027-01-01
Email reset requires a working SMTP provider; SMS reset is not supplied
AI image understanding requires a vision-capable provider/model
OCR for scanned PDF and reliable DOC/DOCX extraction are not included
Not claimed as complete
This source is not proof of a successful deployment on your accounts; deploy and endpoint tests remain necessary
Generated practice questions are not official verified past papers
No packaged offline/on-device AI model, no video-generation system, and no administrator approval/control panel
Browser voice and PDF print support vary by device/browser
Final smoke-test checklist after deploy
[ ]
/api/health reports database connected
[ ]
Create account, sign out/in, reload app, then view profile
[ ]
Save and delete a note and flashcard
[ ]
Create a task and mark complete
[ ]
Test AI once with configured provider
[ ]
Test web research once with configured search provider
[ ]
Test password-reset email only after SMTP is configured
[ ]
Open app once online, then verify local Offline Study Mode and Export/Import
Global Book Finder limitations
The Google Books API supplies catalogue metadata and whatever preview/access links Google and rights holders allow; it does not unlock every book or provide a universal free-PDF database.
The NCTB buttons link to official sources; the app does not automatically mirror/download every NCTB PDF into its own database.
Auto-refresh runs every 30 minutes only when the user enables it and the app tab remains visible; otherwise searching is on demand.
Live results depend on third-party service availability. Search provider/API terms and copyright permissions still apply.
Version 26.7.1 changes
Retained legacy Google Custom Search JSON API support for existing eligible customers and documented Tavily-compatible provider setup for new deployments.
Added pagination to Google Books results and bounded API paging parameters.
Added basic response security headers and explicit search-provider health indicators.
Updated NCTB e-book link and version markers; added automated quality-check script.
Version 26.7.1 hardening pass
Standardized the release version across package, UI, health endpoint, PWA manifest, service-worker cache, Render service name and docs.
Added npm test / scripts/acceptance-check.js to check feature-module markers, required API route markers, version consistency, auth/security markers, book-source markers and the service worker's exclusion of private API responses.
Kept the full previous source reference in the archive so the older project history is not silently discarded.
No AI video generation was added; it remains deferred as previously requested.