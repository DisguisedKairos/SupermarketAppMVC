const axios = require('axios');
require('dotenv').config();

/**
 * NETS QR (Developer Portal) thin client.
 *
 * This project intentionally keeps NETS fields flexible because your Developer Portal config
 * (UAT/prod endpoints, required headers, and response shape) may vary by onboarding package.
 *
 * Required env (UAT recommended first):
 * - NETS_BASE_URL (e.g. https://sandbox.nets.openapipaas.com)
 * - NETS_QR_REQUEST_PATH (default: /api/v1/common/payments/nets-qr/request)
 * - NETS_API_KEY (or API_KEY)
 * - NETS_PROJECT_ID (or PROJECT_ID)
 */
function getConfig() {
  const baseUrl = process.env.NETS_BASE_URL || 'https://sandbox.nets.openapipaas.com';
  const requestPath = process.env.NETS_QR_REQUEST_PATH || '/api/v1/common/payments/nets-qr/request';

  // Backwards compatibility with existing env keys used in services/nets.js
  const apiKey = process.env.NETS_API_KEY || process.env.API_KEY;
  const projectId = process.env.NETS_PROJECT_ID || process.env.PROJECT_ID;

  return { baseUrl, requestPath, apiKey, projectId };
}

function buildHeaders() {
  const { apiKey, projectId } = getConfig();
  const headers = {};
  if (apiKey) headers['api-key'] = apiKey;
  if (projectId) headers['project-id'] = projectId;
  return headers;
}

/**
 * Request a Dynamic NETS QR code.
 * Returns: { qrCodeDataUrl, txnRetrievalRef, raw }
 */
async function requestQr({ amount, txnId, notifyMobile = 0 }) {
  const { baseUrl, requestPath } = getConfig();

  const requestBody = {
    txn_id: txnId,
    amt_in_dollars: amount,
    notify_mobile: notifyMobile,
  };

  const response = await axios.post(`${baseUrl}${requestPath}`, requestBody, {
    headers: buildHeaders(),
  });

  // Typical response shape seen in NETS OpenAPI PaaS:
  // response.data.result.data.qr_code (base64 PNG) and txn_retrieval_ref
  const data = response.data || {};
  const qrData = data?.result?.data || data?.data || data;

  const qrBase64 = qrData?.qr_code;
  const txnRetrievalRef = qrData?.txn_retrieval_ref || qrData?.txnRetrievalRef || null;

  return {
    qrCodeDataUrl: qrBase64 ? `data:image/png;base64,${qrBase64}` : null,
    txnRetrievalRef,
    raw: data,
  };
}

module.exports = { requestQr };
