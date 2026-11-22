/* NyumbHUTni — prices and "Buy on WhatsApp" on the Products page.
 *
 * Prices come from the Products tab of the Google Sheet (any product with a price).
 * Change a price there and the website updates. Products without a price show
 * "Ask for price". The WhatsApp message includes the product name and price.
 * If column E ("Old price") is higher than the price, the old price is shown crossed out.
 *
 * Online M-Pesa payment (pay.js) is separate: when it is switched on, a
 * "Pay with M-Pesa" button appears next to "Buy on WhatsApp".
 */
window.NHShop = true;
(function () {
  var WHATSAPP = '254702468500';
  var cards = document.querySelectorAll('.card[data-pay-id]');
  if (!cards.length) return;

  function fmt(n) { return 'KES ' + Number(n).toLocaleString('en-KE'); }

  function show(prices) {
    cards.forEach(function (card) {
      var p = prices[card.getAttribute('data-pay-id')];
      var btn = card.querySelector('.buy-wa');
      if (!btn) return;
      var name = (card.querySelector('h4') || {}).textContent || '';
      var tag = card.querySelector('.price-tag');
      if (!tag) {
        tag = document.createElement('span');
        tag.className = 'price-tag';
        btn.parentNode.parentNode.insertBefore(tag, btn.parentNode);
      }
      if (p) {
        if (p.oldPrice) {
          tag.innerHTML = '<s class="old-price">' + fmt(p.oldPrice) + '</s> ' + fmt(p.price) +
            ' <span class="save">Save ' + fmt(p.oldPrice - p.price) + '</span>';
        } else tag.textContent = fmt(p.price);
        btn.href = 'https://wa.me/' + WHATSAPP + '?text=' +
          encodeURIComponent('Hi NyumbHUTni, I would like to buy: ' + name + ' (' + fmt(p.price) + ')');
      } else {
        tag.innerHTML = '<span class="price-ask">Ask for price</span>';
      }
    });
  }

  function load() {
  var url = (typeof NH_PAYMENTS !== 'undefined' && NH_PAYMENTS.endpoint) || '';
  if (!url) return;
  fetch(url + '?action=prices')
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (!res.prices) return; // backend not updated yet: buttons still work, no prices shown
      var map = {};
      res.prices.forEach(function (p) { map[p.id] = p; });
      show(map);
    })
    .catch(function () {});
  }
  // pay.js (which holds the backend link) loads after this file, so wait for the page.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
