const axios = require("axios");
const crypto = require("crypto");

/**
 * Supports BOTH env naming styles:
 * - Demo: API_KEY, PROJECT_ID
 * - Supermarket: NETS_API_KEY, NETS_PROJECT_ID, NETS_BASE_URL, NETS_QR_REQUEST_PATH, NETS_QR_QUERY_PATH
 */
function getHeaders() {
  const apiKey = (process.env.NETS_API_KEY || process.env.API_KEY || "").trim();
  const projectId = (process.env.NETS_PROJECT_ID || process.env.PROJECT_ID || "").trim();
  return {
    "api-key": apiKey,
    "project-id": projectId,
    "Content-Type": "application/json",
  };
}

function getBaseUrl() {
  // If you configured NETS_BASE_URL use it; else fall back to demo hardcoded sandbox host
  return (process.env.NETS_BASE_URL || "https://sandbox.nets.openapipaas.com").replace(/\/+$/, "");
}

function getPaths() {
  return {
    requestPath: process.env.NETS_QR_REQUEST_PATH || "/api/v1/common/payments/nets-qr/request",
    queryPath: process.env.NETS_QR_QUERY_PATH || "/api/v1/common/payments/nets-qr/query",
  };
}

function getCourseInitIdSafe() {
  try {
    // Optional for the simulator UI (from demo)
    require.resolve("./../course_init_id");
    const { courseInitId } = require("../course_init_id");
    return courseInitId || "";
  } catch (_) {
    return "";
  }
}

/**
 * Request NETS QR (returns data for rendering QR page)
 * @returns {Promise<{qrCodeDataUrl:string, txnRetrievalRef:string, raw:any}>}
 */
async function requestQr({ amount, txnId, notifyMobile = 0 }) {
  const baseUrl = getBaseUrl();
  const { requestPath } = getPaths();
  const url = `${baseUrl}${requestPath}`;

  const fallbackTxnId =
    (process.env.NETS_TXN_ID || "").trim() || "sandbox_nets|m|8ff8e5b6-d43e-4786-8ac5-7accf8c5bd9b";

  const requestBody = {
    txn_id: txnId || fallbackTxnId,
    // NETS expects a numeric amount (Postman sends a number, not a string).
    amt_in_dollars: (() => {
      const parsed = Number.parseFloat(amount);
      return Number.isFinite(parsed) ? parsed : amount;
    })(),
    notify_mobile: notifyMobile,
  };

  const headers = getHeaders();
  console.log("NETS requestQr ->", { url, headers, requestBody });

  let response;
  try {
    response = await axios.post(url, requestBody, { headers });
  } catch (err) {
    const status = err?.response?.status;
    const data = err?.response?.data;
    const respHeaders = err?.response?.headers;
    console.error("NETS requestQr error ->", { url, status, data, respHeaders });
    throw err;
  }

  // Demo returns: { status, result: { data: { qr_code, txn_retrieval_ref, ... } } }
  const data = response.data?.result?.data || response.data?.result?.data?.data || response.data?.result?.data || {};
  const qrCodeBase64 = data.qr_code;
  const txnRetrievalRef = data.txn_retrieval_ref;

  const qrCodeDataUrl = qrCodeBase64 ? `data:image/png;base64,${qrCodeBase64}` : "";

  return { qrCodeDataUrl, txnRetrievalRef, raw: response.data };
}

/**
 * Query NETS transaction status.
 * Returns a simplified view used by SSE polling.
 * @returns {Promise<{responseCode:string, txnStatus:number, raw:any}>}
 */
async function queryTxn({ txnRetrievalRef, frontendTimeoutStatus = 0 }) {
  const baseUrl = getBaseUrl();
  const { queryPath } = getPaths();

  const body = {
    txn_retrieval_ref: txnRetrievalRef,
    frontend_timeout_status: frontendTimeoutStatus,
  };

  const response = await axios.post(`${baseUrl}${queryPath}`, body, { headers: getHeaders() });

  const d = response.data?.result?.data || {};
  return {
    responseCode: String(d.response_code ?? ""),
    txnStatus: Number(d.txn_status ?? 0),
    raw: response.data,
  };
}

/**
 * DEMO-compatible handler: expects req.body.cartTotal and renders netsQr page.
 * This is kept so you can reuse the demo flow if needed.
 */
exports.generateQrCode = async (req, res) => {
  const { cartTotal, invoiceId } = req.body;
  const user = req.session?.user;

  try {
    const staticTxnId = (process.env.NETS_TXN_ID || "").trim();
    const txnId = staticTxnId || `sandbox_nets|m|${crypto.randomUUID()}`;
    const { qrCodeDataUrl, txnRetrievalRef } = await requestQr({
      amount: String(cartTotal),
      txnId,
      notifyMobile: 0,
    });

    if (!qrCodeDataUrl || !txnRetrievalRef) {
      return res.redirect("/nets-qr/fail");
    }

    // If we're in SupermarketAppMVC and have an invoiceId, store providerRef for SSE reconciliation.
    if (invoiceId && user) {
      try {
        const Invoice = require("../models/Invoice");
        Invoice.updateProviderMeta(
          { invoiceId: parseInt(invoiceId, 10), userId: user.id, provider: "NETSQR", providerRef: txnRetrievalRef },
          () => {}
        );
      } catch (_) {}
    }

    return res.render("netsQr", {
      title: "NETS QR Payment",
      qrCodeUrl: qrCodeDataUrl,
      txnRetrievalRef,
      apiKey: process.env.NETS_API_KEY || process.env.API_KEY || "",
      projectId: process.env.NETS_PROJECT_ID || process.env.PROJECT_ID || "",
      courseInitId: getCourseInitIdSafe(),
    });
  } catch (error) {
    console.error("Error in generateQrCode:", error.message);
    return res.redirect("/nets-qr/fail");
  }
};

exports.requestQr = requestQr;
exports.queryTxn = queryTxn;
