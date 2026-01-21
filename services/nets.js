const axios = require('axios');
require('dotenv').config();

function getConfig() {
  const baseUrl = process.env.NETS_BASE_URL || 'https://sandbox.nets.openapipaas.com';
  const requestPath = process.env.NETS_QR_REQUEST_PATH || '/api/v1/common/payments/nets-qr/request';
  const queryPath = process.env.NETS_QR_QUERY_PATH || '/api/v1/common/payments/nets-qr/query';

  // Support both old and new env variable names
  const apiKey = process.env.NETS_API_KEY || process.env.API_KEY;
  const projectId = process.env.NETS_PROJECT_ID || process.env.PROJECT_ID;

  return { baseUrl, requestPath, queryPath, apiKey, projectId };
}

function buildHeaders() {
  const { apiKey, projectId } = getConfig();
  return {
    ...(apiKey ? { 'api-key': apiKey } : {}),
    ...(projectId ? { 'project-id': projectId } : {}),
  };
}

/**
 * Request a dynamic QR code.
 * Returns { qrCodeDataUrl, txnRetrievalRef, raw }
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

  const raw = response.data || {};
  const data = raw?.result?.data || raw?.data || raw;

  const qrBase64 = data?.qr_code;
  const txnRetrievalRef = data?.txn_retrieval_ref || null;

  return {
    qrCodeDataUrl: qrBase64 ? `data:image/png;base64,${qrBase64}` : null,
    txnRetrievalRef,
    raw,
  };
}

/**
 * Query a NETS transaction status.
 * Returns { responseCode, txnStatus, raw }
 */
async function queryTxn({ txnRetrievalRef, frontendTimeoutStatus = 0 }) {
  const { baseUrl, queryPath } = getConfig();

  const requestBody = {
    txn_retrieval_ref: txnRetrievalRef,
    frontend_timeout_status: frontendTimeoutStatus,
  };

  const response = await axios.post(`${baseUrl}${queryPath}`, requestBody, {
    headers: buildHeaders(),
  });

  const raw = response.data || {};
  const data = raw?.result?.data || raw?.data || raw;

  return {
    responseCode: data?.response_code,
    txnStatus: data?.txn_status,
    raw,
  };
}

module.exports = { requestQr, queryTxn };
