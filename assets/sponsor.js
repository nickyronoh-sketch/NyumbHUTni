/* NyumbHUTni — "Sponsor a Stool / Filter" page.
 *
 * Prices, goals and the number already sponsored come from the Google Sheet
 * (Products tab + Sponsor tab), through the same Apps Script used for payments.
 *
 * While online payments are switched off (or the sheet has no price yet),
 * the Sponsor buttons open WhatsApp instead, so the page always works.
 */
(function () {
  var WHATSAPP = '254702468500';
  var cards = document.querySelectorAll('[data-sponsor-id]');
  if (!cards.length) return;
  var items = {};

  function fmt(n) { return 'KES ' + Number(n).toLocaleString('en-KE'); }
  function endpoint() { return (typeof NH_PAYMENTS !== 'undefined' && NH_PAYMENTS.endpoint) || ''; }

  function render() {
    cards.forEach(function (card) {
      var id = card.getAttribute('data-sponsor-id');
      var label = card.getAttribute('data-label');
      var it = items[id];
      var price = card.querySelector('.sp-price');
      var prog = card.querySelector('.sp-progress');
      var btn = card.querySelector('.sp-btn');

      if (false) { price.hidden = false; }
      else price.hidden = true;

      if (it && it.goal > 0) {
        var pct = Math.min(100, Math.round(it.funded / it.goal * 100));
        prog.querySelector('.sp-fill').style.width = pct + '%';
        prog.querySelector('.sp-count').textContent = it.funded + ' of ' + it.goal + ' sponsored';
        prog.querySelector('.sp-bar').setAttribute('aria-valuenow', pct);
        prog.hidden = false;
      } else prog.hidden = true;

      var canPay = it && it.available && window.NHPay;
      btn.onclick = function (e) {
        if (canPay) {
          e.preventDefault();
          window.NHPay.open({ id: it.id, name: it.name, price: it.price }, { sponsor: true });
        }
      };
      btn.href = canPay ? '#' : 'https://wa.me/' + WHATSAPP + '?text=' +
        encodeURIComponent('Hi NyumbHUTni, I would like to sponsor ' + label + ' for someone in need.');
      btn.target = canPay ? '' : '_blank';
      btn.textContent = canPay ? 'Sponsor with M-Pesa' : 'Sponsor via WhatsApp';
    });
  }

  function load() {
    if (!endpoint()) { render(); return; }
    fetch(endpoint() + '?action=sponsor')
      .then(function (r) { return r.json(); })
      .then(function (res) {
        items = {};
        (res.items || []).forEach(function (it) { items[it.id] = it; });
        render();
      })
      .catch(render);
  }

  render();
  load();
  document.addEventListener('nh:payready', render);
  document.addEventListener('nh:paid', function () { setTimeout(load, 1500); });
})();
