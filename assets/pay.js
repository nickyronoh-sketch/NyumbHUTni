/* NyumbHUTni — "Pay with M-Pesa" button and checkout window.
 *
 * SWITCH: payments stay hidden until both settings below are filled in.
 *   enabled  -> set to true when you are ready to show the button
 *   endpoint -> the Google Apps Script web app link (ends in /exec)
 *
 * Prices are NOT stored here. They come from the "Products" tab of the
 * Google Sheet, so you can change a price without touching the website.
 */
var NH_PAYMENTS = {
  enabled: false,
  endpoint: ''
};

(function () {
  if (!NH_PAYMENTS.enabled || !NH_PAYMENTS.endpoint) return;

  var cards = document.querySelectorAll('[data-pay-id]');
  if (!cards.length) return;

  var css = '' +
    '.pay-btn{background:#2e7d32;border-color:#2e7d32;margin-left:6px}' +
    '.pay-btn:hover{background:#25652a;border-color:#25652a}' +
    '.price-tag{display:block;font-weight:700;color:var(--brown);padding:0 16px;margin:0 0 10px}' +
    '.pay-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;z-index:100;padding:16px}' +
    '.pay-overlay.open{display:flex}' +
    '.pay-box{background:#fff;border-radius:12px;max-width:420px;width:100%;padding:24px;position:relative;max-height:90vh;overflow:auto}' +
    '.pay-box h3{margin:0 0 4px;color:var(--brown)}' +
    '.pay-box .pay-total{font-size:1.3rem;font-weight:700;margin:10px 0 16px}' +
    '.pay-box form{gap:10px}' +
    '.pay-close{position:absolute;top:8px;right:12px;background:none;border:0;font-size:1.6rem;cursor:pointer;color:#666;padding:4px}' +
    '.pay-msg{margin-top:12px;padding:12px;border-radius:8px;display:none}' +
    '.pay-msg.info{display:block;background:var(--blue-light)}' +
    '.pay-msg.ok{display:block;background:#e7f5e9;color:#1b5e20}' +
    '.pay-msg.err{display:block;background:#fdecea;color:#b71c1c}' +
    '.pay-note{font-size:.85rem;color:var(--muted)}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ---------- Checkout window ----------
  var overlay = document.createElement('div');
  overlay.className = 'pay-overlay';
  overlay.innerHTML =
    '<div class="pay-box" role="dialog" aria-modal="true" aria-labelledby="payTitle">' +
      '<button class="pay-close" type="button" aria-label="Close">&times;</button>' +
      '<h3 id="payTitle">Pay with M-Pesa</h3>' +
      '<div id="payProduct"></div>' +
      '<div class="pay-total" id="payTotal"></div>' +
      '<form id="payForm">' +
        '<label>Quantity<input id="payQty" type="number" min="1" max="50" value="1" required /></label>' +
        '<label>Your name<input id="payName" type="text" maxlength="80" required /></label>' +
        '<label>M-Pesa phone number<input id="payPhone" type="tel" placeholder="0712 345 678" required /></label>' +
        '<button type="submit" class="btn" id="paySubmit">Send M-Pesa prompt</button>' +
        '<p class="pay-note">You will receive a prompt on your phone. Enter your M-Pesa PIN to complete payment.</p>' +
      '</form>' +
      '<div class="pay-msg" id="payMsg"></div>' +
    '</div>';
  document.body.appendChild(overlay);

  var $ = function (id) { return document.getElementById(id); };
  var current = null, pollTimer = null, prices = {};

  function fmt(n) { return 'KES ' + Number(n).toLocaleString('en-KE'); }
  function msg(type, text) { var m = $('payMsg'); m.className = 'pay-msg ' + type; m.textContent = text; }
  function updateTotal() {
    var q = Math.max(1, parseInt($('payQty').value, 10) || 1);
    $('payTotal').textContent = 'Total: ' + fmt(current.price * q);
  }

  function open(product) {
    current = product;
    $('payProduct').textContent = product.name + ' — ' + fmt(product.price) + ' each';
    $('payQty').value = 1;
    $('payForm').style.display = '';
    $('payMsg').className = 'pay-msg';
    $('paySubmit').disabled = false;
    updateTotal();
    overlay.classList.add('open');
    $('payName').focus();
  }
  function close() { overlay.classList.remove('open'); clearInterval(pollTimer); }

  overlay.querySelector('.pay-close').addEventListener('click', close);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  $('payQty').addEventListener('input', updateTotal);

  $('payForm').addEventListener('submit', function (e) {
    e.preventDefault();
    $('paySubmit').disabled = true;
    msg('info', 'Sending the M-Pesa prompt to your phone…');
    fetch(NH_PAYMENTS.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids a browser pre-check Google doesn't support
      body: JSON.stringify({
        productId: current.id,
        qty: $('payQty').value,
        name: $('payName').value,
        phone: $('payPhone').value
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.ok) { msg('err', res.error || 'Something went wrong. Please try again.'); $('paySubmit').disabled = false; return; }
        $('payForm').style.display = 'none';
        msg('info', 'Check your phone and enter your M-Pesa PIN to pay ' + fmt(res.amount) + '. Waiting for confirmation…' +
          (res.mode === 'mock' ? ' (Practice mode: no real money.)' : ''));
        poll(res.orderId);
      })
      .catch(function () { msg('err', 'Could not connect. Please check your internet and try again.'); $('paySubmit').disabled = false; });
  });

  function poll(orderId) {
    var tries = 0;
    clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      tries++;
      fetch(NH_PAYMENTS.endpoint + '?action=status&order=' + encodeURIComponent(orderId))
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.status === 'PAID') {
            clearInterval(pollTimer);
            msg('ok', 'Payment received. Thank you! M-Pesa receipt: ' + res.receipt +
              '. Your order number is ' + orderId + '. We will call you to arrange delivery or collection.');
          } else if (res.status === 'FAILED') {
            clearInterval(pollTimer);
            msg('err', 'Payment was not completed (' + (res.message || 'cancelled') + '). You can close this and try again.');
          }
        })
        .catch(function () {});
      if (tries >= 30) { // about 90 seconds
        clearInterval(pollTimer);
        msg('err', 'We have not received confirmation yet. If you entered your PIN, please call +254 702 468 500 with order number ' + orderId + '.');
      }
    }, 3000);
  }

  // ---------- Add buttons for products that have an online price ----------
  fetch(NH_PAYMENTS.endpoint + '?action=products')
    .then(function (r) { return r.json(); })
    .then(function (res) {
      (res.products || []).forEach(function (p) { prices[p.id] = p; });
      cards.forEach(function (card) {
        var p = prices[card.getAttribute('data-pay-id')];
        if (!p) return; // no price set in the sheet: keep "Request a Quote" only
        var quoteBtn = card.querySelector('.btn');
        var tag = document.createElement('span');
        tag.className = 'price-tag';
        tag.textContent = fmt(p.price);
        quoteBtn.parentNode.parentNode.insertBefore(tag, quoteBtn.parentNode);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn small pay-btn';
        btn.textContent = 'Pay with M-Pesa';
        btn.addEventListener('click', function () { open(p); });
        quoteBtn.parentNode.appendChild(btn);
      });
    })
    .catch(function () { /* backend unreachable: page simply shows quote buttons */ });
})();
