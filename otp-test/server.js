// Minimal third-party OTP app: calls YOUR SMS infrastructure's API to deliver codes, then verifies them.
const express = require("express");
const crypto = require("crypto");
const path = require("path");

const {
  SMS_API_URL,                       // full URL of your infrastructure's "send SMS" endpoint
  SMS_API_KEY,                       // API key/token issued to this app by your infrastructure
  SMS_AUTH_HEADER = "Authorization", // e.g. "Authorization" or "X-API-Key"
  SMS_AUTH_SCHEME = "Bearer",        // "Bearer", "Basic", or "" (raw key)
  SMS_BODY_TEMPLATE = '{"to":"{{phone}}","message":"{{message}}"}',
  OTP_TTL_SECONDS = "300",
  OTP_LENGTH = "6",
  MAX_ATTEMPTS = "5",
  RESEND_COOLDOWN_SECONDS = "30",
  PORT = 3000,
} = process.env;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// In-memory store: phone -> { hash, expires, attempts, lastSent }
const store = new Map();
const hash = (code, phone) =>
  crypto.createHash("sha256").update(`${phone}:${code}`).digest("hex");
const normalize = (p) => String(p || "").replace(/[\\s()-]/g, "");
const validPhone = (p) => /^\\+\\d{8,15}$/.test(p);

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) if (v.expires < now) store.delete(k);
}, 60_000).unref();

// Replace {{phone}} / {{message}} in every string of the template (keeps JSON escaping safe).
const fill = (node, vars) =>
  typeof node === "string"
    ? node.replace(/\\{\\{(\\w+)\\}\\}/g, (_, k) => vars[k] ?? "")
    : Array.isArray(node)
    ? node.map((n) => fill(n, vars))
    : node && typeof node === "object"
    ? Object.fromEntries(Object.entries(node).map(([k, v]) => [k, fill(v, vars)]))
    : node;

async function sendSms(phone, text) {
  const body = fill(JSON.parse(SMS_BODY_TEMPLATE), { phone, message: text });
  const headers = { "Content-Type": "application/json" };
  if (SMS_API_KEY) headers[SMS_AUTH_HEADER] = `${SMS_AUTH_SCHEME} ${SMS_API_KEY}`.trim();
  const res = await fetch(SMS_API_URL, { method: "POST", headers, body: JSON.stringify(body) });
  const raw = await res.text();
  if (!res.ok) throw new Error(`SMS API responded ${res.status}: ${raw.slice(0, 300)}`);
  return raw;
}

app.post("/api/send-otp", async (req, res) => {
  const phone = normalize(req.body.phone);
  if (!validPhone(phone))
    return res.status(400).json({ error: "Use international format, e.g. +251911234567" });
  if (!SMS_API_URL) return res.status(500).json({ error: "SMS_API_URL not set" });

  const existing = store.get(phone);
  const wait = existing
    ? Number(RESEND_COOLDOWN_SECONDS) - Math.floor((Date.now() - existing.lastSent) / 1000)
    : 0;
  if (wait > 0) return res.status(429).json({ error: `Wait ${wait}s before requesting another code` });

  const len = Number(OTP_LENGTH);
  const code = String(crypto.randomInt(0, 10 ** len)).padStart(len, "0");
  try {
    const out = await sendSms(
      phone,
      `Your verification code is ${code}. It expires in ${Math.round(Number(OTP_TTL_SECONDS) / 60)} min.`
    );
    store.set(phone, {
      hash: hash(code, phone),
      expires: Date.now() + Number(OTP_TTL_SECONDS) * 1000,
      attempts: 0,
      lastSent: Date.now(),
    });
    console.log("SMS API accepted:", out);
    res.json({ ok: true });
  } catch (e) {
    console.error(e.message);
    res.status(502).json({ error: e.message });
  }
});

app.post("/api/verify-otp", (req, res) => {
  const phone = normalize(req.body.phone);
  const code = String(req.body.code || "").trim();
  const rec = store.get(phone);
  if (!rec || rec.expires < Date.now())
    return res.status(400).json({ error: "Code expired or not requested" });
  if (rec.attempts >= Number(MAX_ATTEMPTS)) {
    store.delete(phone);
    return res.status(429).json({ error: "Too many attempts. Request a new code." });
  }
  rec.attempts++;
  const a = Buffer.from(hash(code, phone));
  const b = Buffer.from(rec.hash);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
    store.delete(phone);
    return res.json({ ok: true, verified: true });
  }
  res.status(400).json({ error: "Incorrect code" });
});

app.get("/health", (_, res) => res.send("ok"));
app.listen(PORT, () => console.log(`OTP test client running on :${PORT}`));
