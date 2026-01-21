# PayPal Sandbox + NETS QR (Developer Portal) Setup & Postman Testing

This project integrates **PayPal Sandbox** and **NETS QR (OpenAPI PaaS via NETS Developer Portal)** into the existing checkout flow.

---

## 1) Database migration (required)

Run this SQL on your MySQL database:

- `database/2026_payment_status_fields.sql`
- `database/2026_payment_history_refunds.sql`

---

## 2) Environment variables

Create/update `.env`:

### App
- `PORT=3000`
- `SESSION_SECRET=...`
- `APP_BASE_URL=http://localhost:3000`

### PayPal (Sandbox)
- `PAYPAL_API=https://api-m.sandbox.paypal.com`
- `PAYPAL_CLIENT_ID=...`
- `PAYPAL_CLIENT_SECRET=...`

### Stripe (Test)
- `STRIPE_SECRET_KEY=...`
- `STRIPE_PUBLISHABLE_KEY=...` (optional, only needed if you add a custom card form)

### NETS QR (Developer Portal / UAT)
- `NETS_BASE_URL=https://sandbox.nets.openapipaas.com`
- `NETS_QR_REQUEST_PATH=/api/v1/common/payments/nets-qr/request`
- `NETS_QR_QUERY_PATH=/api/v1/common/payments/nets-qr/query`

Headers (NETS portal):
- `NETS_API_KEY=...`  (or `API_KEY`)
- `NETS_PROJECT_ID=...` (or `PROJECT_ID`)

---

## 3) App flow (how checkout works)

### A) Offline methods (Card/PayNow/GrabPay/Cash)
- Invoice is created and immediately marked **PAID**.

### B) PayPal (slides / JS SDK flow)
1. User selects **PayPal** on `/payment`.
2. App creates an invoice with status **PENDING_PAYMENT**.
3. App renders `views/paypal_checkout.ejs` with PayPal JS SDK button.
4. PayPal SDK calls:
   - `POST /api/paypal/create-order` (server creates PayPal order, returns `id`)
   - `POST /api/paypal/capture-order` (server captures, marks invoice PAID)
5. Browser redirects to `/invoice/:id`.

### C) Stripe Checkout (hosted)
1. User selects **Stripe** on `/payment`.
2. App creates an invoice with status **PENDING_PAYMENT**.
3. App creates a Stripe Checkout Session and redirects the browser to Stripe.
4. Stripe redirects back to:
   - Success: `/stripe/success?session_id=...`
   - Cancel: `/stripe/cancel?invoiceId=...`

### D) NETS QR (slides / Request+Query+SSE)
1. User selects **NETSQR** on `/payment`.
2. App creates an invoice with status **PENDING_PAYMENT**.
3. App calls NETS **Request API** to get `qr_code` + `txn_retrieval_ref`.
4. App renders `views/netsQr.ejs` to show the QR.
5. The page opens a Server-Sent Events (SSE) stream:
   - `GET /sse/payment-status/:txnRetrievalRef`
6. Server polls NETS **Query API** every 5 seconds. When NETS returns success, the invoice is marked **PAID** and the browser redirects to `/invoice/:id`.

> Note: a webhook route (`POST /netsqr/webhook`) still exists for portal callbacks, but this implementation follows the slides’ **Query polling** pattern.

---

## 4) Postman: test PayPal (Sandbox)

### A) Get access token
- **Method**: `POST`
- **URL**: `{{PAYPAL_API}}/v1/oauth2/token`
- **Auth**: Basic Auth
  - Username: `{{PAYPAL_CLIENT_ID}}`
  - Password: `{{PAYPAL_CLIENT_SECRET}}`
- **Headers**:
  - `Content-Type: application/x-www-form-urlencoded`
- **Body** (x-www-form-urlencoded):
  - `grant_type=client_credentials`

Save `access_token` into a Postman environment variable (e.g. `PAYPAL_ACCESS_TOKEN`).

### B) Create order (direct PayPal API)
- **Method**: `POST`
- **URL**: `{{PAYPAL_API}}/v2/checkout/orders`
- **Headers**:
  - `Content-Type: application/json`
  - `Authorization: Bearer {{PAYPAL_ACCESS_TOKEN}}`
- **Body** (raw JSON):
```json
{
  "intent": "CAPTURE",
  "purchase_units": [
    {
      "amount": {
        "currency_code": "SGD",
        "value": "3.00"
      }
    }
  ]
}
```

### C) Capture order (direct PayPal API)
- **Method**: `POST`
- **URL**: `{{PAYPAL_API}}/v2/checkout/orders/{{PAYPAL_ORDER_ID}}/capture`
- **Headers**:
  - `Content-Type: application/json`
  - `Authorization: Bearer {{PAYPAL_ACCESS_TOKEN}}`

---

## 5) Postman: test NETS QR (Developer Portal)

### A) Request QR
- **Method**: `POST`
- **URL**: `{{NETS_BASE_URL}}{{NETS_QR_REQUEST_PATH}}`
- **Headers**:
  - `Content-Type: application/json`
  - `api-key: {{NETS_API_KEY}}`
  - `project-id: {{NETS_PROJECT_ID}}`
- **Body** (raw JSON):
```json
{
  "txn_id": "sandbox_nets|m|b0a5c0d0-0000-0000-0000-000000000000",
  "amt_in_dollars": 3,
  "notify_mobile": 0
}
```

Expected (on success):
- `response_code: "00"`
- `result.data.qr_code`
- `result.data.txn_retrieval_ref`

### B) Query payment status
- **Method**: `POST`
- **URL**: `{{NETS_BASE_URL}}{{NETS_QR_QUERY_PATH}}`
- **Headers**:
  - `Content-Type: application/json`
  - `api-key: {{NETS_API_KEY}}`
  - `project-id: {{NETS_PROJECT_ID}}`
- **Body** (raw JSON):
```json
{
  "txn_retrieval_ref": "{{TXN_RETRIEVAL_REF}}",
  "frontend_timeout_status": 0
}
```

Success condition used in the app:
- `response_code == "00"` and `txn_status == 1`

---

## 6) Postman: test your app endpoints

Because `/api/paypal/*` routes require a logged-in session cookie, the simplest test is via browser:
1. Login
2. Add items to cart
3. Go to `/payment` and pick PayPal

If you want to test via Postman:
- First do a login request to your app and keep cookies enabled.
- Then call:
  - `POST http://localhost:3000/api/paypal/create-order` with JSON `{ "invoiceId": 123 }`
  - `POST http://localhost:3000/api/paypal/capture-order` with JSON `{ "invoiceId": 123, "orderId": "..." }`

---

## 7) Troubleshooting

- PayPal button not showing:
  - Check `PAYPAL_CLIENT_ID` is set and you are using Sandbox client id.
  - Ensure the page can load `https://www.paypal.com/sdk/js`.

- NETS QR request fails:
  - Confirm `api-key` and `project-id` headers match your portal.
  - Confirm `NETS_BASE_URL` and endpoints match your NETS docs/portal.

- NETS SSE keeps pending:
  - Ensure you scanned and completed payment within 5 minutes.
  - Use Postman to call Query API with the `txn_retrieval_ref` and verify fields.
