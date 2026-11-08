/**
 * NyumbHUTni — M-Pesa STK Push backend (Google Apps Script)
 * ----------------------------------------------------------
 * This script is the "middleman" between the website and KCB BUNI.
 * It keeps the secret API keys hidden, looks up prices, starts the
 * STK push, receives KCB's payment result, and records every order
 * in the Google Sheet it is attached to.
 *
 * HOW IT IS SWITCHED ON
 *   Settings live in Project Settings → Script Properties (not in this file):
 *     MODE              mock  = practice mode, no real money (default)
 *                       live  = real STK push through KCB BUNI
 *     BUNI_BASE_URL     e.g. https://uat.buni.kcbgroup.com  (test)  — KCB gives the live one
 *     CONSUMER_KEY      from the BUNI portal
 *     CONSUMER_SECRET   from the BUNI portal
 *     ORG_SHORTCODE     522533
 *     ACCOUNT_REF       your KCB account number used with paybill 522533
 *     ORG_PASSKEY       only if KCB gives you one (otherwise leave empty)
 *     CALLBACK_SECRET   any long random word — protects the callback link
 *     WEB_APP_URL       this script's own /exec link (after you deploy)
 *
 *   Nothing in this file needs editing when the credentials arrive.
 */

// ---------- Sheet names ----------
var PRODUCTS_SHEET = 'Products';
var ORDERS_SHEET = 'Orders';
var ORDER_HEADERS = ['Time', 'Order ID', 'Product ID', 'Product', 'Qty', 'Amount (KES)',
  'Customer name', 'Phone', 'Status', 'M-Pesa receipt', 'Result message', 'CheckoutRequestID', 'Mode'];

// ---------- Entry points ----------

/** GET requests: product list and payment status checks from the website. */
function doGet(e) {
  var action = (e.parameter.action || '').toLowerCase();
  try {
    if (action === 'products') return json_({ ok: true, products: getProducts_() });
    if (action === 'status') return json_(getStatus_(e.parameter.order));
    return json_({ ok: true, service: 'NyumbHUTni payments', mode: prop_('MODE', 'mock') });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

/** POST requests: new payment from the website, or the payment result from KCB. */
function doPost(e) {
  var action = (e.parameter.action || '').toLowerCase();
  try {
    if (action === 'callback') return handleCallback_(e);
    var body = JSON.parse(e.postData.contents || '{}');
    return json_(startPayment_(body));
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

// ---------- Starting a payment ----------

function startPayment_(body) {
  var phone = normalisePhone_(body.phone);
  if (!phone) return { ok: false, error: 'Please enter a valid Safaricom number, e.g. 0712 345 678.' };

  var name = String(body.name || '').trim().slice(0, 80);
  if (!name) return { ok: false, error: 'Please enter your name.' };

  var qty = Math.floor(Number(body.qty) || 1);
  if (qty < 1 || qty > 50) return { ok: false, error: 'Quantity must be between 1 and 50.' };

  // The price always comes from the sheet — never from the website.
  var product = getProducts_().filter(function (p) { return p.id === body.productId; })[0];
  if (!product) return { ok: false, error: 'This product is not available for online payment.' };
  var amount = product.price * qty;

  // Stop the same number being sent repeated prompts.
  var cache = CacheService.getScriptCache();
  if (cache.get('recent_' + phone)) {
    return { ok: false, error: 'A payment request was just sent to this number. Please wait a minute and try again.' };
  }
  cache.put('recent_' + phone, '1', 60);

  var orderId = 'NH' + Utilities.formatDate(new Date(), 'Africa/Nairobi', 'yyMMddHHmmss') +
    Math.floor(Math.random() * 90 + 10);
  var mode = prop_('MODE', 'mock');

  var result = (mode === 'live')
    ? sendStkPush_(phone, amount, orderId, product.name)
    : { ok: true, checkoutId: 'MOCK_' + orderId };

  appendOrder_([new Date(), orderId, product.id, product.name, qty, amount, name, phone,
    result.ok ? 'PENDING' : 'FAILED', '', result.ok ? 'Waiting for customer PIN' : result.error,
    result.checkoutId || '', mode]);

  if (!result.ok) return { ok: false, error: 'We could not send the M-Pesa prompt. Please try again shortly.' };
  return { ok: true, orderId: orderId, amount: amount, mode: mode };
}

/** Calls KCB BUNI. Field names follow the BUNI "Mpesa STK Push" API. */
function sendStkPush_(phone, amount, orderId, productName) {
  var base = prop_('BUNI_BASE_URL', '').replace(/\/$/, '');
  var callback = prop_('WEB_APP_URL', '') + '?action=callback&key=' + encodeURIComponent(prop_('CALLBACK_SECRET', ''));
  var payload = {
    phoneNumber: phone,
    amount: String(amount),
    invoiceNumber: invoiceNumber_(orderId),
    sharedShortCode: true,
    orgShortCode: prop_('ORG_SHORTCODE', '522533'),
    orgPassKey: prop_('ORG_PASSKEY', ''),
    callbackUrl: callback,
    transactionDescription: ('NyumbHUTni ' + productName).slice(0, 40)
  };
  var res = UrlFetchApp.fetch(base + '/mm/api/request/1.0.0/stkpush', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + getToken_() },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var data = {};
  try { data = JSON.parse(res.getContentText()); } catch (e) {}
  var r = data.response || {};
  if (res.getResponseCode() === 200 && String(r.ResponseCode) === '0') {
    return { ok: true, checkoutId: r.CheckoutRequestID };
  }
  console.error('STK push failed', res.getResponseCode(), res.getContentText());
  return { ok: false, error: 'BUNI error ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200) };
}

/**
 * The reference that tells KCB which account the money belongs to.
 * CONFIRM THIS FORMAT WITH KCB BUNI when you get credentials — it is the
 * one setting most likely to need adjusting. Default: "ACCOUNT_REF-ORDERID".
 * To change it, set INVOICE_FORMAT in Script Properties, using
 * {account} and {order} as placeholders (e.g. "{account}" or "{account}#{order}").
 */
function invoiceNumber_(orderId) {
  var format = prop_('INVOICE_FORMAT', '{account}-{order}');
  return format.replace('{account}', prop_('ACCOUNT_REF', '')).replace('{order}', orderId);
}

/** Gets (and caches for ~55 min) a BUNI access token. */
function getToken_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('buni_token');
  if (cached) return cached;
  var base = prop_('BUNI_BASE_URL', '').replace(/\/$/, '');
  var basic = Utilities.base64Encode(prop_('CONSUMER_KEY', '') + ':' + prop_('CONSUMER_SECRET', ''));
  var res = UrlFetchApp.fetch(base + '/token?grant_type=client_credentials', {
    method: 'post',
    headers: { Authorization: 'Basic ' + basic },
    muteHttpExceptions: true
  });
  var data = JSON.parse(res.getContentText());
  if (!data.access_token) throw new Error('Could not get BUNI token: ' + res.getContentText().slice(0, 200));
  cache.put('buni_token', data.access_token, 3300);
  return data.access_token;
}

// ---------- Receiving KCB's result ----------

function handleCallback_(e) {
  if (e.parameter.key !== prop_('CALLBACK_SECRET', '__unset__')) return json_({ ok: false });
  var data = JSON.parse(e.postData.contents || '{}');
  var cb = (data.Body && data.Body.stkCallback) || {};
  var items = (cb.CallbackMetadata && cb.CallbackMetadata.Item) || [];
  var meta = {};
  items.forEach(function (i) { meta[i.Name] = i.Value; });

  var paid = Number(cb.ResultCode) === 0;
  updateOrderByCheckout_(cb.CheckoutRequestID, {
    status: paid ? 'PAID' : 'FAILED',
    receipt: meta.MpesaReceiptNumber || '',
    message: cb.ResultDesc || ''
  });
  return json_({ ResultCode: 0, ResultDesc: 'Accepted' });
}

// ---------- Status for the website ----------

function getStatus_(orderId) {
  var sheet = ordersSheet_();
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if (rows[i][1] !== orderId) continue;
    var status = rows[i][8];
    // Practice mode: pretend the customer paid ~8 seconds after the request.
    if (rows[i][12] === 'mock' && status === 'PENDING' &&
        (new Date() - new Date(rows[i][0])) > 8000) {
      status = 'PAID';
      sheet.getRange(i + 1, 9, 1, 3).setValues([[status, 'MOCK' + orderId.slice(-6), 'Practice payment (no real money)']]);
      rows[i][9] = 'MOCK' + orderId.slice(-6);
    }
    return { ok: true, status: status, receipt: status === 'PAID' ? rows[i][9] : '', message: rows[i][10] };
  }
  return { ok: false, error: 'Order not found' };
}

// ---------- Sheet helpers ----------

/** Reads the Products tab: columns ID | Name | Price (KES) | Online payment (YES/NO). */
function getProducts_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(PRODUCTS_SHEET);
  if (!sheet) return [];
  return sheet.getDataRange().getValues().slice(1)
    .filter(function (r) { return r[0] && Number(r[2]) > 0 && String(r[3]).toUpperCase() === 'YES'; })
    .map(function (r) { return { id: String(r[0]).trim(), name: String(r[1]).trim(), price: Number(r[2]) }; });
}

function ordersSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(ORDERS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ORDERS_SHEET);
    sheet.appendRow(ORDER_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendOrder_(row) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { ordersSheet_().appendRow(row); } finally { lock.releaseLock(); }
}

function updateOrderByCheckout_(checkoutId, upd) {
  if (!checkoutId) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = ordersSheet_();
    var rows = sheet.getDataRange().getValues();
    for (var i = rows.length - 1; i >= 1; i--) {
      if (rows[i][11] === checkoutId) {
        sheet.getRange(i + 1, 9, 1, 3).setValues([[upd.status, upd.receipt, upd.message]]);
        return;
      }
    }
  } finally { lock.releaseLock(); }
}

// ---------- Small helpers ----------

/** Accepts 07.., 01.., 7.., +2547.., 2547.. and returns 2547XXXXXXXX / 2541XXXXXXXX. */
function normalisePhone_(raw) {
  var d = String(raw || '').replace(/\D/g, '');
  if (/^0[17]\d{8}$/.test(d)) d = '254' + d.slice(1);
  else if (/^[17]\d{8}$/.test(d)) d = '254' + d;
  return /^254[17]\d{8}$/.test(d) ? d : '';
}

function prop_(key, fallback) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  return (v === null || v === '') ? fallback : v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor: creates the Products and Orders tabs with example rows. */
function setup() {
  var ss = SpreadsheetApp.getActive();
  var p = ss.getSheetByName(PRODUCTS_SHEET) || ss.insertSheet(PRODUCTS_SHEET);
  if (p.getLastRow() === 0) {
    p.appendRow(['ID', 'Name', 'Price (KES)', 'Online payment (YES/NO)']);
    [['water-filter', 'NyumbHUTni Water Filter', 0, 'NO'],
     ['ro-purifier', 'RO Water Purifier', 0, 'NO'],
     ['sato-pan', 'SATO Pan', 0, 'NO'],
     ['sato-flex', 'SATO Flex', 0, 'NO'],
     ['sato-stool', 'SATO Stool', 0, 'NO']].forEach(function (r) { p.appendRow(r); });
    p.setFrozenRows(1);
  }
  ordersSheet_();
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('MODE')) props.setProperty('MODE', 'mock');
  if (!props.getProperty('CALLBACK_SECRET')) props.setProperty('CALLBACK_SECRET', Utilities.getUuid());
  if (!props.getProperty('ORG_SHORTCODE')) props.setProperty('ORG_SHORTCODE', '522533');
}
