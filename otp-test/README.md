# OTP test client (third-party app for your SMS infrastructure)

A tiny app that behaves like any external customer of your SMS API: it asks your infrastructure to send an OTP, then verifies what the user types. It has no SMS logic of its own and knows nothing about SMSGate.

## Deploy on Render
Build `npm install`, start `npm start`. Set env vars:

| Var | Meaning | Default |
|---|---|---|
| `SMS_API_URL` | Your infrastructure's send-SMS endpoint | (required) |
| `SMS_API_KEY` | API key/token your infrastructure issued to this app | (none) |
| `SMS_AUTH_HEADER` | Header carrying the key | `Authorization` |
| `SMS_AUTH_SCHEME` | `Bearer`, `Basic`, or empty for a raw key | `Bearer` |
| `SMS_BODY_TEMPLATE` | JSON body; `{{phone}}` and `{{message}}` are substituted | `{"to":"{{phone}}","message":"{{message}}"}` |
| `OTP_TTL_SECONDS` / `OTP_LENGTH` / `MAX_ATTEMPTS` / `RESEND_COOLDOWN_SECONDS` | OTP behaviour | 300 / 6 / 5 / 30 |

Examples:
- Header `X-API-Key: abc` -> `SMS_AUTH_HEADER=X-API-Key`, `SMS_AUTH_SCHEME=` (empty)
- Body `{"recipient":"+251...","text":"..."}` -> `SMS_BODY_TEMPLATE={"recipient":"{{phone}}","text":"{{message}}"}`

OTPs are kept in memory (fine for a test).
