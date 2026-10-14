require("dotenv").config();

const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const app = express();
const PORT = Number(process.env.PORT || 10000);
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("Set JWT_SECRET to a random value at least 32 characters long.");
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
  if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

const allowedOrigins = (process.env.CORS_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  let sameOrigin = false;
  if (origin) {
    try { sameOrigin = new URL(origin).host === req.get("host"); } catch { sameOrigin = false; }
    // Same-origin works by default. Cross-origin frontends must be explicitly allow-listed.
    const allowed = allowedOrigins.length ? allowedOrigins.includes(origin) : sameOrigin;
    if (!allowed) return res.status(403).json({ error: "Origin not allowed. Set CORS_ORIGIN to the exact frontend origin if hosted separately." });
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: "draft-7", legacyHeaders: false }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 25, standardHeaders: "draft-7", legacyHeaders: false }));
app.use("/api/ai", rateLimit({ windowMs: 60 * 1000, limit: 15, standardHeaders: "draft-7", legacyHeaders: false }));

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000
});

const clampText = (v, max = 20000) => typeof v === "string" ? v.trim().slice(0, max) : "";
const asSafeUser = r => ({ id: String(r.id), name: r.name, role: r.role, className: r.class_name, school: r.school, emailOrPhone: r.email_or_phone, createdAt: r.created_at });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'student' CHECK (role IN ('student','teacher')),
      class_name VARCHAR(80) NOT NULL DEFAULT '', school VARCHAR(160) NOT NULL DEFAULT '',
      email_or_phone VARCHAR(190) NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS notes (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL, content TEXT NOT NULL DEFAULT '', subject VARCHAR(100) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS flashcards (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject VARCHAR(100) NOT NULL DEFAULT '', front TEXT NOT NULL, back TEXT NOT NULL,
      due_at DATE, last_reviewed_at TIMESTAMPTZ, review_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS library_items (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL, item_type VARCHAR(60) NOT NULL DEFAULT 'resource',
      content TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL CHECK (role IN ('user','assistant')),
      content TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS study_tasks (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL, subject VARCHAR(100) NOT NULL DEFAULT '',
      task_type VARCHAR(60) NOT NULL DEFAULT 'study', due_date DATE,
      notes TEXT NOT NULL DEFAULT '', completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS knowledge_concepts (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      concept VARCHAR(200) NOT NULL, prerequisite TEXT NOT NULL DEFAULT '',
      related TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS exam_logs (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject VARCHAR(100) NOT NULL DEFAULT '', exam_name VARCHAR(160) NOT NULL DEFAULT '',
      score NUMERIC(7,2), total NUMERIC(7,2), mistake TEXT NOT NULL DEFAULT '',
      correction TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS reset_user_idx ON password_reset_tokens(user_id, expires_at DESC);
    CREATE INDEX IF NOT EXISTS notes_user_idx ON notes(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS flashcards_user_idx ON flashcards(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS library_user_idx ON library_items(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS chats_user_idx ON chat_messages(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS tasks_user_idx ON study_tasks(user_id, due_date);
  `);
}

function authRequired(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Please log in first." });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: "Session expired. Please log in again." }); }
}
function ownerId(req) { return req.user.sub; }

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      ok: true, service: "USBKStudies 26.7.1", version: "26.7.1", database: "connected",
      aiConfigured: Boolean(process.env.GROW_API_KEY && process.env.GROW_API_BASE_URL && process.env.GROW_API_MODEL),
      liveSearchConfigured: Boolean((process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_CX) || (process.env.WEB_SEARCH_API_KEY && process.env.WEB_SEARCH_BASE_URL)),
      liveSearchProviders: { googleCSE: Boolean(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_CX), tavilyCompatible: Boolean(process.env.WEB_SEARCH_API_KEY && process.env.WEB_SEARCH_BASE_URL) },
      passwordResetConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_FROM),
      offlineMode: "available in browser; AI and cloud sync require internet"
    });
  } catch { res.status(503).json({ ok: false, service: "USBKStudies 26.7.1", version: "26.7.1", database: "unavailable" }); }
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const name = clampText(req.body.name, 100), role = req.body.role === "teacher" ? "teacher" : "student";
    const className = clampText(req.body.className, 80), school = clampText(req.body.school, 160);
    const emailOrPhone = clampText(req.body.emailOrPhone, 190).toLowerCase();
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (name.length < 2 || emailOrPhone.length < 4 || password.length < 10) return res.status(400).json({ error: "Enter a name, valid email/phone, and password of at least 10 characters." });
    const exists = await pool.query("SELECT 1 FROM users WHERE email_or_phone=$1", [emailOrPhone]);
    if (exists.rowCount) return res.status(409).json({ error: "An account with this email/phone already exists." });
    const hash = await bcrypt.hash(password, 12);
    const r = await pool.query("INSERT INTO users(name,role,class_name,school,email_or_phone,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING *", [name,role,className,school,emailOrPhone,hash]);
    const user = asSafeUser(r.rows[0]);
    const token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ user, token });
  } catch (e) { next(e); }
});
app.post("/api/auth/login", async (req, res, next) => {
  try {
    const login = clampText(req.body.emailOrPhone, 190).toLowerCase();
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const r = await pool.query("SELECT * FROM users WHERE email_or_phone=$1", [login]);
    const row = r.rows[0];
    if (!row || !(await bcrypt.compare(password, row.password_hash))) return res.status(401).json({ error: "Incorrect email/phone or password." });
    const user = asSafeUser(row), token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ user, token });
  } catch (e) { next(e); }
});
app.get("/api/auth/me", authRequired, async (req,res,next) => {
  try { const r=await pool.query("SELECT * FROM users WHERE id=$1",[ownerId(req)]); if(!r.rowCount)return res.status(404).json({error:"Account not found."}); res.json({user:asSafeUser(r.rows[0])}); } catch(e){next(e);}
});
app.patch("/api/auth/profile", authRequired, async (req,res,next) => {
  try {
    const name=clampText(req.body.name,100), className=clampText(req.body.className,80), school=clampText(req.body.school,160);
    if(name.length<2)return res.status(400).json({error:"Name must contain at least 2 characters."});
    const r=await pool.query("UPDATE users SET name=$1,class_name=$2,school=$3 WHERE id=$4 RETURNING *",[name,className,school,ownerId(req)]);
    res.json({user:asSafeUser(r.rows[0])});
  }catch(e){next(e);}
});
app.post("/api/auth/change-password", authRequired, async (req,res,next) => {
  try {
    const oldPassword=String(req.body.oldPassword||""), newPassword=String(req.body.newPassword||"");
    if(newPassword.length<10)return res.status(400).json({error:"New password must be at least 10 characters."});
    const r=await pool.query("SELECT password_hash FROM users WHERE id=$1",[ownerId(req)]);
    if(!r.rowCount||!(await bcrypt.compare(oldPassword,r.rows[0].password_hash)))return res.status(401).json({error:"Current password is incorrect."});
    const hash=await bcrypt.hash(newPassword,12);
    await pool.query("UPDATE users SET password_hash=$1 WHERE id=$2",[hash,ownerId(req)]);
    res.json({ok:true,message:"Password changed. Please log in again on other devices."});
  }catch(e){next(e);}
});
// Password reset: requires SMTP environment variables and email-based account identifier.
app.post("/api/auth/password-reset/request", async (req,res,next) => {
  try {
    const identifier=clampText(req.body.emailOrPhone,190).toLowerCase();
    // Always return the same public message to avoid account enumeration.
    const generic={ok:true,message:"If this account uses an email address and reset mail is configured, instructions will be sent."};
    if(!identifier || !identifier.includes("@") || !process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.MAIL_FROM) return res.json(generic);
    const u=await pool.query("SELECT id,email_or_phone FROM users WHERE email_or_phone=$1",[identifier]);
    if(!u.rowCount)return res.json(generic);
    const raw=crypto.randomBytes(32).toString("hex"), hash=crypto.createHash("sha256").update(raw).digest("hex");
    await pool.query("DELETE FROM password_reset_tokens WHERE expires_at < NOW() OR used_at IS NOT NULL");
    await pool.query("UPDATE password_reset_tokens SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL",[u.rows[0].id]);
    await pool.query("INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 minutes')",[u.rows[0].id,hash]);
    const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:String(process.env.SMTP_SECURE||"false")==="true",auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
    const base=(process.env.APP_BASE_URL||"").replace(/\/$/,"");
    const resetUrl=base?`${base}/?resetToken=${raw}`:null;
    await transporter.sendMail({from:process.env.MAIL_FROM,to:identifier,subject:"USBKStudies password reset",text:`A password reset was requested for your USBKStudies account.\n\n${resetUrl?`Open this link within 30 minutes: ${resetUrl}`:`Use this reset token within 30 minutes: ${raw}`}\n\nIf you did not request this, ignore this email.`});
    res.json(generic);
  }catch(e){next(e);}
});
app.post("/api/auth/password-reset/confirm", async(req,res,next)=>{
  try {
    const raw=clampText(req.body.token,200), password=typeof req.body.newPassword==="string"?req.body.newPassword:"";
    if(raw.length<32||password.length<10)return res.status(400).json({error:"A valid reset token and a password of at least 10 characters are required."});
    const hash=crypto.createHash("sha256").update(raw).digest("hex");
    const r=await pool.query("SELECT id,user_id FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW()",[hash]);
    if(!r.rowCount)return res.status(400).json({error:"Reset token is invalid or expired. Request a new one."});
    const passHash=await bcrypt.hash(password,12);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE users SET password_hash=$1 WHERE id=$2", [passHash, r.rows[0].user_id]);
      await client.query("UPDATE password_reset_tokens SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL", [r.rows[0].user_id]);
      await client.query("COMMIT");
    } catch (txError) {
      await client.query("ROLLBACK");
      throw txError;
    } finally { client.release(); }
    res.json({ok:true,message:"Password reset successful. Log in with the new password."});
  }catch(e){next(e);}
});

async function listRoute(table, fields, order, req, res, next) {
  try { const r=await pool.query(`SELECT ${fields} FROM ${table} WHERE user_id=$1 ORDER BY ${order} LIMIT 500`,[ownerId(req)]); res.json({items:r.rows}); } catch(e){next(e);}
}
app.get("/api/notes",authRequired,(req,res,next)=>listRoute("notes","id,title,content,subject,created_at,updated_at","updated_at DESC",req,res,next));
app.post("/api/notes",authRequired,async(req,res,next)=>{try{const title=clampText(req.body.title,200),content=clampText(req.body.content,50000),subject=clampText(req.body.subject,100);if(!title)return res.status(400).json({error:"Title required."});const r=await pool.query("INSERT INTO notes(user_id,title,content,subject) VALUES($1,$2,$3,$4) RETURNING *",[ownerId(req),title,content,subject]);res.status(201).json({item:r.rows[0]});}catch(e){next(e);}});
app.patch("/api/notes/:id",authRequired,async(req,res,next)=>{try{const r=await pool.query("UPDATE notes SET title=$1,content=$2,subject=$3,updated_at=NOW() WHERE id=$4 AND user_id=$5 RETURNING *",[clampText(req.body.title,200),clampText(req.body.content,50000),clampText(req.body.subject,100),req.params.id,ownerId(req)]);if(!r.rowCount)return res.status(404).json({error:"Note not found."});res.json({item:r.rows[0]});}catch(e){next(e);}});
app.delete("/api/notes/:id",authRequired,async(req,res,next)=>{try{const r=await pool.query("DELETE FROM notes WHERE id=$1 AND user_id=$2",[req.params.id,ownerId(req)]);if(!r.rowCount)return res.status(404).json({error:"Note not found."});res.json({ok:true});}catch(e){next(e);}});

app.get("/api/flashcards",authRequired,(req,res,next)=>listRoute("flashcards","id,subject,front,back,due_at,last_reviewed_at,review_count,created_at","created_at DESC",req,res,next));
app.post("/api/flashcards",authRequired,async(req,res,next)=>{try{const front=clampText(req.body.front,5000),back=clampText(req.body.back,10000),subject=clampText(req.body.subject,100);if(!front||!back)return res.status(400).json({error:"Question and answer required."});const r=await pool.query("INSERT INTO flashcards(user_id,subject,front,back,due_at) VALUES($1,$2,$3,$4,$5) RETURNING *",[ownerId(req),subject,front,back,req.body.dueAt||null]);res.status(201).json({item:r.rows[0]});}catch(e){next(e);}});
app.post("/api/flashcards/:id/review",authRequired,async(req,res,next)=>{try{const rating=["again","hard","good","easy"].includes(req.body.rating)?req.body.rating:"good";const days={again:0,hard:1,good:3,easy:7}[rating];const r=await pool.query("UPDATE flashcards SET review_count=review_count+1,last_reviewed_at=NOW(),due_at=CURRENT_DATE + $1::int WHERE id=$2 AND user_id=$3 RETURNING *",[days,req.params.id,ownerId(req)]);if(!r.rowCount)return res.status(404).json({error:"Flashcard not found."});res.json({item:r.rows[0]});}catch(e){next(e);}});
app.delete("/api/flashcards/:id",authRequired,async(req,res,next)=>{try{const r=await pool.query("DELETE FROM flashcards WHERE id=$1 AND user_id=$2",[req.params.id,ownerId(req)]);if(!r.rowCount)return res.status(404).json({error:"Flashcard not found."});res.json({ok:true});}catch(e){next(e);}});

app.get("/api/library",authRequired,(req,res,next)=>listRoute("library_items","id,title,item_type,content,created_at","created_at DESC",req,res,next));
app.post("/api/library",authRequired,async(req,res,next)=>{try{const title=clampText(req.body.title,200);if(!title)return res.status(400).json({error:"Title required."});const r=await pool.query("INSERT INTO library_items(user_id,title,item_type,content) VALUES($1,$2,$3,$4) RETURNING *",[ownerId(req),title,clampText(req.body.itemType||"resource",60),clampText(req.body.content,50000)]);res.status(201).json({item:r.rows[0]});}catch(e){next(e);}});
app.delete("/api/library/:id",authRequired,async(req,res,next)=>{try{const r=await pool.query("DELETE FROM library_items WHERE id=$1 AND user_id=$2",[req.params.id,ownerId(req)]);if(!r.rowCount)return res.status(404).json({error:"Library item not found."});res.json({ok:true});}catch(e){next(e);}});

app.get("/api/chat/history",authRequired,async(req,res,next)=>{try{const r=await pool.query("SELECT id,role,content,created_at FROM (SELECT * FROM chat_messages WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100) x ORDER BY created_at ASC",[ownerId(req)]);res.json({items:r.rows});}catch(e){next(e);}});
app.delete("/api/chat/history",authRequired,async(req,res,next)=>{try{await pool.query("DELETE FROM chat_messages WHERE user_id=$1",[ownerId(req)]);res.json({ok:true});}catch(e){next(e);}});

async function callAI(messages, temperature=0.5) {
  const key=process.env.GROW_API_KEY, base=(process.env.GROW_API_BASE_URL||"").replace(/\/+$/,""), endpoint=process.env.GROW_API_ENDPOINT||"/chat/completions", model=process.env.GROW_API_MODEL;
  if(!key||!base||!model){const e=new Error("Grow AI is not configured. Add the provider's correct key, base URL, endpoint and model in Render Environment Variables.");e.status=503;throw e;}
  const url=base+(endpoint.startsWith("/")?endpoint:"/"+endpoint);
  const response=await fetch(url,{method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model,messages,temperature}),signal:AbortSignal.timeout(Math.max(5000,Number(process.env.AI_REQUEST_TIMEOUT_MS)||45000))});
  const raw=await response.text();let data={};try{data=JSON.parse(raw);}catch{}
  if(!response.ok){const e=new Error(data?.error?.message||`AI provider returned HTTP ${response.status}.`);e.status=502;throw e;}
  const rawAnswer=data?.choices?.[0]?.message?.content;
  const answer=typeof rawAnswer==="string"?rawAnswer:(Array.isArray(rawAnswer)?rawAnswer.map(x=>x?.text||"").join("\n"):"");
  if(typeof answer!=="string"||!answer.trim()){const e=new Error("Provider response format was not recognized. Verify Grow API documentation and response schema.");e.status=502;throw e;}
  return answer.trim();
}
app.post("/api/ai/chat",authRequired,async(req,res,next)=>{try{
  const message=clampText(req.body.message,12000), language=clampText(req.body.language||"Auto-detect",40);
  if(!message)return res.status(400).json({error:"Enter a question."});
  const history=Array.isArray(req.body.history)?req.body.history.slice(-8).filter(m=>m&&["user","assistant"].includes(m.role)&&typeof m.content==="string").map(m=>({role:m.role,content:m.content.slice(0,4000)})):[];
  const system=`You are Utsab AI, a multilingual study tutor for school students. Reply in ${language==="Auto-detect"?"the user's language":language}. Teach step by step, encourage independent learning, flag uncertainty, and never invent citations or claim live search if none was performed. Keep age-appropriate and respectful.`;
  let userContent=message;
  const attachments=Array.isArray(req.body.attachments)?req.body.attachments.slice(0,3):[];
  const imageParts=[];
  for(const a of attachments){if(a&&typeof a.dataUrl==="string"&&/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(a.dataUrl)&&a.dataUrl.length<=6_000_000){imageParts.push({type:"image_url",image_url:{url:a.dataUrl}});}}
  if(imageParts.length) userContent=[{type:"text",text:message},{...imageParts[0]} ,...imageParts.slice(1)];
  const answer=await callAI([{role:"system",content:system},...history,{role:"user",content:userContent}]);
  await pool.query("INSERT INTO chat_messages(user_id,role,content) VALUES($1,'user',$2),($1,'assistant',$3)",[ownerId(req),message,answer]);
  res.json({answer});
}catch(e){next(e);}});

app.post("/api/ai/study-pack",authRequired,async(req,res,next)=>{try{
  const topic=clampText(req.body.topic,3000);if(!topic)return res.status(400).json({error:"Topic required."});
  const prompt=`Create a complete school study pack in ${clampText(req.body.language||"Bengali",40)}. Class: ${clampText(req.body.className,80)||"unspecified"}. Subject: ${clampText(req.body.subject,100)||"unspecified"}. Topic: ${topic}. Include concise notes, step-by-step explanation, 5 MCQs with answers, 5 flashcards, common mistakes, quick revision, and 3 self-test questions. Clearly state when syllabus details are uncertain.`;
  res.json({answer:await callAI([{role:"system",content:"You are Utsab AI, an accurate study material creator."},{role:"user",content:prompt}])});
}catch(e){next(e);}});
app.post("/api/ai/previous-questions",authRequired,async(req,res,next)=>{try{
  const subject=clampText(req.body.subject,100),className=clampText(req.body.className,80),exam=clampText(req.body.exam,120);
  if(!subject||!className||!exam)return res.status(400).json({error:"Subject, class and exam are required."});
  const prompt=`In ${clampText(req.body.language||"Bengali",40)}, help prepare for ${exam}, class ${className}, subject ${subject}, topic ${clampText(req.body.topic,1500)||"general syllabus"}. Do not pretend generated questions are actual past-paper questions. Label them as practice questions unless a verified source is supplied. Provide topic-wise questions, answer hints and a checking strategy.`;
  res.json({answer:await callAI([{role:"system",content:"Never fabricate official past questions or citations."},{role:"user",content:prompt}])});
}catch(e){next(e);}});
app.post("/api/ai/tutor-mode",authRequired,async(req,res,next)=>{try{
  const mode=["socratic","mistake-detective","examiner","teacher-simulator","explain","revision","concept-map"].includes(req.body.mode)?req.body.mode:"explain";
  const prompt=clampText(req.body.prompt,10000);if(!prompt)return res.status(400).json({error:"Provide a question or work to review."});
  const language=clampText(req.body.language||"Auto-detect",40);
  const instructions={
    socratic:"Use Socratic tutoring: ask one guiding question at a time and help the student reason instead of immediately giving away the final answer.",
    "mistake-detective":"Review the student's work, identify the first likely error, explain why, and provide a corrected method.",
    examiner:"Act as a fair school examiner: ask a question, wait for the student's response, then assess it using a clear rubric.",
    "teacher-simulator":"Act as a patient school teacher: teach the requested concept step by step, check understanding, give an age-appropriate example, and then ask one short practice question.",
    explain:"Explain the topic simply, then give an example and a short check question.",
    revision:"Make a compact revision sheet, recall prompts, and spaced-repetition suggestions.",
    "concept-map":"Return a text-based concept map with main idea, branches, prerequisites, and relationships."
  };
  res.json({answer:await callAI([{role:"system",content:"You are Utsab AI. Reply in "+(language==="Auto-detect"?"the user's language":language)+". "+instructions[mode]},{role:"user",content:prompt}])});
}catch(e){next(e);}});

app.get("/api/tasks",authRequired,(req,res,next)=>listRoute("study_tasks","id,title,subject,task_type,due_date,notes,completed,created_at","completed ASC, due_date ASC NULLS LAST",req,res,next));
app.post("/api/tasks",authRequired,async(req,res,next)=>{try{const title=clampText(req.body.title,200);if(!title)return res.status(400).json({error:"Task title required."});const r=await pool.query("INSERT INTO study_tasks(user_id,title,subject,task_type,due_date,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[ownerId(req),title,clampText(req.body.subject,100),clampText(req.body.taskType||"study",60),req.body.dueDate||null,clampText(req.body.notes,10000)]);res.status(201).json({item:r.rows[0]});}catch(e){next(e);}});
app.patch("/api/tasks/:id",authRequired,async(req,res,next)=>{try{const r=await pool.query("UPDATE study_tasks SET completed=$1 WHERE id=$2 AND user_id=$3 RETURNING *",[Boolean(req.body.completed),req.params.id,ownerId(req)]);if(!r.rowCount)return res.status(404).json({error:"Task not found."});res.json({item:r.rows[0]});}catch(e){next(e);}});
app.delete("/api/tasks/:id",authRequired,async(req,res,next)=>{try{const r=await pool.query("DELETE FROM study_tasks WHERE id=$1 AND user_id=$2",[req.params.id,ownerId(req)]);if(!r.rowCount)return res.status(404).json({error:"Task not found."});res.json({ok:true});}catch(e){next(e);}});

app.get("/api/knowledge",authRequired,(req,res,next)=>listRoute("knowledge_concepts","id,concept,prerequisite,related,notes,created_at","created_at DESC",req,res,next));
app.post("/api/knowledge",authRequired,async(req,res,next)=>{try{const concept=clampText(req.body.concept,200);if(!concept)return res.status(400).json({error:"Concept required."});const r=await pool.query("INSERT INTO knowledge_concepts(user_id,concept,prerequisite,related,notes) VALUES($1,$2,$3,$4,$5) RETURNING *",[ownerId(req),concept,clampText(req.body.prerequisite,2000),clampText(req.body.related,2000),clampText(req.body.notes,10000)]);res.status(201).json({item:r.rows[0]});}catch(e){next(e);}});
app.delete("/api/knowledge/:id",authRequired,async(req,res,next)=>{try{const r=await pool.query("DELETE FROM knowledge_concepts WHERE id=$1 AND user_id=$2",[req.params.id,ownerId(req)]);if(!r.rowCount)return res.status(404).json({error:"Concept not found."});res.json({ok:true});}catch(e){next(e);}});

app.get("/api/exam-logs",authRequired,(req,res,next)=>listRoute("exam_logs","id,subject,exam_name,score,total,mistake,correction,created_at","created_at DESC",req,res,next));
app.post("/api/exam-logs",authRequired,async(req,res,next)=>{try{const r=await pool.query("INSERT INTO exam_logs(user_id,subject,exam_name,score,total,mistake,correction) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",[ownerId(req),clampText(req.body.subject,100),clampText(req.body.examName,160),req.body.score===undefined||req.body.score===""?null:Number(req.body.score),req.body.total===undefined||req.body.total===""?null:Number(req.body.total),clampText(req.body.mistake,10000),clampText(req.body.correction,10000)]);res.status(201).json({item:r.rows[0]});}catch(e){next(e);}});

app.get("/api/settings",authRequired,async(req,res,next)=>{try{const r=await pool.query("SELECT settings FROM app_settings WHERE user_id=$1",[ownerId(req)]);res.json({settings:r.rows[0]?.settings||{}});}catch(e){next(e);}});
app.put("/api/settings",authRequired,async(req,res,next)=>{try{const settings=req.body&&typeof req.body==="object"&&!Array.isArray(req.body)?req.body:{};const r=await pool.query("INSERT INTO app_settings(user_id,settings) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET settings=EXCLUDED.settings,updated_at=NOW() RETURNING settings",[ownerId(req),JSON.stringify(settings)]);res.json({settings:r.rows[0].settings});}catch(e){next(e);}});

app.get("/api/dashboard",authRequired,async(req,res,next)=>{try{
  const id=ownerId(req);
  const [notes,cards,library,tasks,exams,concepts]=await Promise.all([
    pool.query("SELECT COUNT(*)::int n FROM notes WHERE user_id=$1",[id]),
    pool.query("SELECT COUNT(*)::int n FROM flashcards WHERE user_id=$1",[id]),
    pool.query("SELECT COUNT(*)::int n FROM library_items WHERE user_id=$1",[id]),
    pool.query("SELECT COUNT(*)::int n, COUNT(*) FILTER (WHERE completed)::int done FROM study_tasks WHERE user_id=$1",[id]),
    pool.query("SELECT COUNT(*)::int n, AVG(CASE WHEN total>0 THEN score/total*100 END) avg FROM exam_logs WHERE user_id=$1",[id]),
    pool.query("SELECT COUNT(*)::int n FROM knowledge_concepts WHERE user_id=$1",[id])
  ]);
  res.json({notes:notes.rows[0].n,flashcards:cards.rows[0].n,library:library.rows[0].n,tasks:tasks.rows[0],exams:exams.rows[0],concepts:concepts.rows[0].n});
}catch(e){next(e);}});

// Live book discovery via Google Books public Volumes API. It returns catalog metadata and official preview/info links, not unrestricted copies of copyrighted books.
app.get("/api/books/search",async(req,res,next)=>{
  try {
    const q=clampText(req.query.q,300);
    if(!q)return res.status(400).json({error:"Enter a book title, author, subject, or ISBN."});
    const maxResults=Math.min(40,Math.max(1,Number.parseInt(req.query.maxResults,10)||10));
    const startIndex=Math.min(1000,Math.max(0,Number.parseInt(req.query.startIndex,10)||0));
    const lang=clampText(req.query.lang,8);
    const url=new URL("https://www.googleapis.com/books/v1/volumes");
    url.searchParams.set("q",q);url.searchParams.set("maxResults",String(maxResults));url.searchParams.set("startIndex",String(startIndex));url.searchParams.set("printType","books");url.searchParams.set("orderBy","relevance");
    if(lang)url.searchParams.set("langRestrict",lang);
    const response=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(15000)});
    const raw=await response.text();let data={};try{data=JSON.parse(raw)}catch{}
    if(!response.ok){const e=new Error(`Google Books returned HTTP ${response.status}. Try again later.`);e.status=502;throw e;}
    const items=(Array.isArray(data.items)?data.items:[]).map(v=>{const x=v.volumeInfo||{};const a=v.accessInfo||{};return {id:clampText(v.id,100),title:clampText(x.title,500),authors:Array.isArray(x.authors)?x.authors.slice(0,12).map(n=>clampText(n,200)):[],publisher:clampText(x.publisher,200),publishedDate:clampText(x.publishedDate,40),description:clampText(x.description,2500),language:clampText(x.language,20),infoLink:clampText(x.infoLink,2000),previewLink:clampText(x.previewLink,2000),accessViewStatus:clampText(a.viewability,80)}}).filter(x=>x.title);
    res.set("Cache-Control","public, max-age=300");
    res.json({query:q,totalItems:Number(data.totalItems)||0,startIndex,maxResults,items,provider:"Google Books API",checkedAt:new Date().toISOString(),notice:"Availability and preview access are determined by Google Books and the rights holder."});
  }catch(e){next(e);}
});

// Live web research: prefer Google Custom Search when configured; otherwise use a Tavily-compatible provider.
app.post("/api/research",authRequired,async(req,res,next)=>{
  try {
    const query=clampText(req.body.query,1000);
    if(!query)return res.status(400).json({error:"Enter a research question."});
    const timeout=Math.max(5000,Number(process.env.WEB_SEARCH_TIMEOUT_MS)||20000);
    const googleKey=process.env.GOOGLE_CSE_API_KEY, googleCx=process.env.GOOGLE_CSE_CX;
    if(googleKey&&googleCx){
      const url=new URL("https://www.googleapis.com/customsearch/v1");
      url.searchParams.set("key",googleKey);url.searchParams.set("cx",googleCx);url.searchParams.set("q",query);
      url.searchParams.set("num",String(Math.min(10,Math.max(1,Number(req.body.maxResults)||5))));
      const response=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(timeout)});
      const raw=await response.text();let data={};try{data=JSON.parse(raw)}catch{}
      if(!response.ok){const e=new Error(data?.error?.message||`Google Custom Search returned HTTP ${response.status}. Check API key, Search Engine ID, quota, and API access.`);e.status=502;throw e;}
      const results=(Array.isArray(data.items)?data.items:[]).map(x=>({title:clampText(x.title,500),url:clampText(x.link,2000),content:clampText(x.snippet,4000),score:null})).filter(x=>/^https:\/\//i.test(x.url));
      return res.json({query,answer:"Google search results are shown below. Verify facts against the original source.",results,provider:"Google Custom Search JSON API",checkedAt:new Date().toISOString()});
    }
    const key=process.env.WEB_SEARCH_API_KEY;
    if(!key){const e=new Error("Live Web Research needs either GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX, or WEB_SEARCH_API_KEY for a Tavily-compatible provider. Set credentials in Render Environment Variables.");e.status=503;throw e;}
    const base=(process.env.WEB_SEARCH_BASE_URL||"https://api.tavily.com").replace(/\/+$/ ,"");
    const endpoint=process.env.WEB_SEARCH_ENDPOINT||"/search";
    const url=base+(endpoint.startsWith("/")?endpoint:"/"+endpoint);
    const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({api_key:key,query,search_depth:process.env.WEB_SEARCH_DEPTH||"basic",max_results:Math.min(10,Math.max(1,Number(req.body.maxResults)||5)),include_answer:true,include_raw_content:false}),signal:AbortSignal.timeout(timeout)});
    const raw=await response.text();let data={};try{data=JSON.parse(raw)}catch{}
    if(!response.ok){const e=new Error(data?.message||data?.detail||`Search provider returned HTTP ${response.status}. Check WEB_SEARCH_BASE_URL/ENDPOINT and provider API format.`);e.status=502;throw e;}
    const results=(Array.isArray(data.results)?data.results:[]).map(x=>({title:clampText(x.title,500),url:clampText(x.url,2000),content:clampText(x.content||x.snippet,4000),score:Number(x.score)||null})).filter(x=>/^https:\/\//i.test(x.url));
    res.json({query,answer:clampText(data.answer,6000),results,provider:"configured web search",checkedAt:new Date().toISOString()});
  }catch(e){next(e);}
});

app.use(express.static(path.join(__dirname),{index:"index.html",etag:true,maxAge:process.env.NODE_ENV==="production"?"1h":0}));
app.get("*",(_req,res)=>res.sendFile(path.join(__dirname,"index.html")));
app.use((err,_req,res,_next)=>{console.error(err.message||err);const status=Number.isInteger(err.status)?err.status:500;res.status(status).json({error:status===500?"Server error. Check Render logs.":err.message});});

initDb().then(()=>app.listen(PORT,"0.0.0.0",()=>console.log(`USBKStudies 26.7.1 listening on ${PORT}`))).catch(e=>{console.error("Database initialization failed:",e.message);process.exit(1);});