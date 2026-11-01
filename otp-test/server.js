// OTP test client backed by EthioSMS native OTP API.
const express = require("express");
const path = require("path");
const crypto = require("crypto");

const {
  ETHIOSMS_BASE_URL = "https://ethiosms.onrender.co",
  ETHIOSMS_API_KEY,
  OTP_PURPOSE = "login",
  PORT = 3000,
} = process.env;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// This mapping is only needed to associate the browser's phone with its challenge.
// EthioSMS remains authoritative for OTP generation, expiry, attempts and verification.
const challenges = new Map();
const normalize = (p) => String(p || "").replace(/[\s()-]/g, "");
const validPhone = (p) => /^\+\d{8,15}$/.test(p);

async function ethioRequest(route, body, idempotencyKey) {
  if (!ETHIOSMS_API_KEY) throw new Error("ETHIOSMS_API_KEY is not configured");
  const base = ETHIOSMS_BASE_URL.replace(/\/$/, "");
  const response = await fetch(base + route, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ETHIOSMS_API_KEY}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) {
    const error = new Error(data.error || data.message || `EthioSMS API returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

app.post("/api/send-otp", async (req, res) => {
  const phone = normalize(req.body.phone);
  if (!validPhone(phone))
    return res.status(400).json({ error: "Use international format, e.g. +251911234567" });

  try {
    const result = await ethioRequest(
      "/api/v1/otp/request",
      { to: phone, purpose: OTP_PURPOSE },
      `otp-test:${crypto.randomUUID()}`
    );
    if (!result.challengeId) {
      console.error("EthioSMS OTP response did not contain challengeId");
      return res.status(502).json({ error: "EthioSMS did not return an OTP challenge. Check the API response and key scopes." });
    }
    challenges.set(phone, { challengeId: result.challengeId, purpose: OTP_PURPOSE });
    res.json({ ok: true });
  } catch (e) {
    console.error("EthioSMS OTP request failed:", e.status || "", e.message);
    res.status(e.status === 429 ? 429 : e.status === 401 || e.status === 403 ? e.status : 502)
      .json({ error: e.message });
  }
});

app.post("/api/verify-otp", async (req, res) => {
  const phone = normalize(req.body.phone);
  const code = String(req.body.code || "").trim();
  if (!validPhone(phone) || !/^\d{4,8}$/.test(code))
    return res.status(400).json({ error: "Enter a valid phone number and verification code" });

  const challenge = challenges.get(phone);
  if (!challenge)
    return res.status(400).json({ error: "Code not requested. Request a new code." });

  try {
    const result = await ethioRequest("/api/v1/otp/verify", {
      challengeId: challenge.challengeId,
      purpose: challenge.purpose,
      code,
    });
    if (result.verified === true) {
      challenges.delete(phone);
      return res.json({ ok: true, verified: true });
    }
    return res.status(400).json({ error: "Incorrect or expired code" });
  } catch (e) {
    console.error("EthioSMS OTP verification failed:", e.status || "", e.message);
    if ([400, 401, 403, 404, 429].includes(e.status))
      return res.status(e.status).json({ error: e.message });
    res.status(502).json({ error: e.message });
  }
});

app.get("/health", (_, res) => res.send("ok"));
app.listen(PORT, () => console.log(`OTP test client running on :${PORT}`));
