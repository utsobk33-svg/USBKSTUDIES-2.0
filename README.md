# USBKSTUDIES-2.0
Anam AI powered study app

USBKStudies 26.7.1 — Utsab AI
Learn With Utsab — an offline-first student learning web app, with a Node.js/Express backend and PostgreSQL storage.
সবচেয়ে গুরুত্বপূর্ণ কথা
এই ZIP-এ frontend, backend, database schema auto-initialization, API adapters, PWA shell এবং deployment configuration আছে। তবে এটি আপনার Render account-এ deploy করা live app নয়। Cloud account, PostgreSQL connection, AI provider key এবং web-search/SMTP credentials বসিয়ে deploy ও live test করতে হবে। কোনো API key ZIP-এ রাখবেন না।
ফাইলগুলোর কাজ
index.html — সম্পূর্ণ single-page frontend/UI এবং client-side modules
server.js — Express API, auth, PostgreSQL schema, AI এবং web-search adapters
package.json — Node dependencies ও syntax-check commands
.env.example — Render-এ সেট করার environment variable তালিকা; বাস্তব secret নয়
render.yaml — Render Web Service configuration
manifest.webmanifest, sw.js, icon.svg — PWA manifest, app-shell cache ও icon
FEATURE_STATUS.md — কী চলে, কীতে external key/data লাগে, আর কোন সীমাবদ্ধতা আছে
TEST_MATRIX.md — কোন পরীক্ষাগুলো পাস করেছে এবং কোনগুলো credentials/device দরকার বলে বাকি
scripts/check-frontend.js — frontend JavaScript এবং API route marker syntax-check
scripts/quality-check.js — version, search configuration, security and required-file checks
USBKStudies_26.7.1_ALL_CODE.txt — current combined source reference
scripts/quality-check.js — version consistency, search adapter, NCTB, security markers ও deployment files
Google Web Search / Global Book Finder
Global Book Finder uses the public Google Books Volumes API for catalogue metadata, search, paging, and preview links. It is not a full-text search of every website and does not unlock copyrighted PDFs.
The Books page links to the official NCTB site and its e-book listing. NCTB listings can change; prefer the official source.
Google Custom Search JSON API support is retained only for existing eligible customers: Google says it is closed to new customers and existing customers must transition by 1 January 2027. Keep its key only in Render, never in frontend code. See the official Google notice: https://developers.google.com/custom-search/v1/overview
For new setups, configure the Tavily-compatible adapter using WEB_SEARCH_API_KEY, WEB_SEARCH_BASE_URL=https://api.tavily.com, and WEB_SEARCH_ENDPOINT=/search. If neither an eligible Google CSE setup nor the fallback provider is configured, live research returns a clear setup message.
Book search can paginate through returned results (Google Books API limits how far results can be paged). Results and previews depend on Google, the publisher and rights holder.
Render-এ চালু করার ধাপ
ZIP extract করুন। USBKStudies_26.7.1 ফোল্ডারের ভেতরের ফাইলগুলো GitHub repository-এর root-এ upload করুন। ZIP-ফাইলটিকে extract না করে repository-তে রাখলে deploy হবে না।
Render-এ একটি PostgreSQL database তৈরি করুন। Render Web Service-এর সঙ্গে একই region ব্যবহার করে database-এর Internal Database URL নিন; DATABASE_URL-এ সেটি দিন। Database schema প্রথম server start-এ স্বয়ংক্রিয়ভাবে তৈরি হবে।
GitHub repository থেকে Render-এ New Web Service তৈরি করুন। Build command: npm install; Start command: npm start; Node 20+ ব্যবহার করুন।
Environment Variables-এ NODE_ENV=production, DATABASE_URL, এবং কমপক্ষে 32-অক্ষরের এলোমেলো JWT_SECRET দিন। JWT_SECRET-এর জন্য Render-এর generate option ব্যবহার করতে পারেন।
নতুন সেটআপে Live Web Research-এর জন্য WEB_SEARCH_API_KEY, WEB_SEARCH_BASE_URL=https://api.tavily.com, WEB_SEARCH_ENDPOINT=/search দিন। Google CSE variables কেবল আগে থেকেই অনুমোদিত existing customer হলে ব্যবহার করুন।
AI চালাতে আপনার provider-এর ডকুমেন্টেশন দেখে GROW_API_KEY, GROW_API_BASE_URL, GROW_API_ENDPOINT (সাধারণত /chat/completions) এবং GROW_API_MODEL পূরণ করুন। এই adapter OpenAI-compatible Chat Completions format আশা করে; provider/model-এর format বা vision support আলাদা হলে adapter/provider সেটিং বদলাতে হবে।
Live Web Research-এর জন্য compatible Tavily-style API ব্যবহার করলে WEB_SEARCH_API_KEY, WEB_SEARCH_BASE_URL=https://api.tavily.com, WEB_SEARCH_ENDPOINT=/search দিন। অন্য provider-এর request/response format ভিন্ন হলে adapter সংশোধন প্রয়োজন।
Password reset email-এর জন্য SMTP provider configure করুন: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM, APP_BASE_URL। এগুলো না থাকলেও login/register চলতে পারে, কিন্তু email reset কাজ করবে না। Phone-only SMS reset অন্তর্ভুক্ত নয়।
Frontend ও backend একই Render Web Service থেকে চললে CORS_ORIGIN খালি রাখুন। আলাদা frontend origin হলে CORS_ORIGIN-এ exact origin দিন, যেমন https://your-app.example; একাধিক origin comma দিয়ে আলাদা করুন।
Deploy হওয়ার পরে https://YOUR-SERVICE.onrender.com/api/health খুলুন। database: connected ও provider configured দেখা মানে settings শনাক্ত হয়েছে—এটি end-to-end AI/search test-এর বিকল্প নয়। এরপর register, login, note save, flashcard save এবং একটি AI request হাতে পরীক্ষা করুন।
Local checks and verification
Run the project checks with Node.js 20+: npm test or npm run check. These verify JavaScript syntax, HTML ID/navigation references, key backend routes, core feature markers, and required deployment files. They do not prove live database, API quota, email delivery, or hosted browser behavior.
Local syntax checks
Node.js 20+ ইনস্টল করা থাকলে:
npm install
npm run check
এই check server ও inline frontend JavaScript syntax পরীক্ষা করে; PostgreSQL, AI provider বা SMTP live credentials যাচাই করে না।
নিরাপত্তা
বাস্তব API keys, database password, SMTP password এবং JWT secret GitHub বা frontend-এ রাখবেন না।
User passwords bcrypt দিয়ে hash করা হয়; API-তে bearer JWT ও rate limits আছে।
Registration-এ Student/Teacher role নির্বাচন করা যায়। আলাদা owner/admin approval panel এই সংস্করণে নেই।
Offline notes/cards/questions/revision এই browser-এর local storage-এ থাকে। এগুলো cloud-synced নয়; JSON backup Export/Import আছে।
AI, live search, cloud account data ও password-reset email internet/provider config-এর ওপর নির্ভরশীল।
Real-data / provider limitations
Previous Questions module AI-generated practice material তৈরি করে; এটি verified official past-paper archive নয়। Scanned PDF-এর OCR, full DOC/DOCX parsing, device-এ bundled offline AI model এবং AI video creation অন্তর্ভুক্ত নয়। PDF text extraction-এর জন্য browser-এ PDF.js CDN পাওয়া প্রয়োজন; selectable text না থাকলে OCR দরকার।
Global Book Finder (26.7.1)
Search live Google Books catalogue by title, author, subject, or ISBN through /api/books/search. No Google Books API key is required for basic public-volume searches.
Optional language filter and 10–40 results; book info and preview links are returned when available.
The Books screen links to official NCTB pages and includes optional 30-minute refresh while the page is visible.
Google Books is a catalogue/search API, not a guarantee that every book has full text or a free PDF. For Bangladesh school textbooks, prefer official NCTB download links. For other books, only open full text or download links made available by the rights holder/library.
This is live per-query discovery, not a complete global index or an automatic crawl of every website. Google Books results and NCTB listings can change independently.