# OTP test client (EthioSMS integration)

This app uses EthioSMS's native OTP API. EthioSMS generates, sends and verifies the OTP; this app does not generate or store OTP codes.

## Deploy on Render

Set the service's **Root Directory** to `otp-test`.

- Build Command: `npm install`
- Start Command: `npm start`
- Runtime: Node

Configure these environment variables in Render:

| Variable | Value |
|---|---|
| `ETHIOSMS_BASE_URL` | `https://ethiosms.onrender.co` |
| `ETHIOSMS_API_KEY` | Your private approved EthioSMS developer key (`esms_...`) |
| `OTP_PURPOSE` | `login` (default; must be the same for request and verify) |

The developer key must have both `otp:request` and `otp:verify` scopes. Keep it in Render environment variables; never put it in browser code, a public repository, or a URL.

## API flow

- Send: server calls `POST /api/v1/otp/request` with `{ "to": "+251...", "purpose": "login" }` and a unique `Idempotency-Key`.
- Verify: server calls `POST /api/v1/otp/verify` with the returned `challengeId`, the same purpose, and the code entered by the user.

EthioSMS controls OTP expiry, cooldown, attempt limits and verification. Its delivery mode still determines whether messages are simulated or physically sent. A successful API request in mock mode is not a real SMS delivery.

The browser talks only to this app's `/api/send-otp` and `/api/verify-otp` routes. The EthioSMS key remains server-side.
