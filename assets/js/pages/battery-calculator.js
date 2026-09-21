/* Battery Backup Calculator - customer-facing sizing tool.
 * Two modes: "size" (load + hours -> required Ah + recommended product) and
 * "time" (voltage + Ah + load -> backup time). All live, no submit button.
 */
(function () {
  'use strict';
  var PR = window.PR;
  var mode = 'size';
  var batteries = []; // [{voltage, ah, product}]

  /* LiFePO4 usable depth-of-discharge (~90%) and a typical inverter
     efficiency (~90%) combine into one practical system-efficiency factor. */
  var SYSTEM_EFFICIENCY = 0.81;

  function parseBatteries(products) {
    var out = [];
    products.forEach(function (p) {
      var m = /LFP Battery\s+([\d.]+)V\s+(\d+)Ah/i.exec(p.name);
      if (m) out.push({ voltage: Number(m[1]), ah: Number(m[2]), product: p });
    });
    out.sort(function (a, b) { return a.voltage - b.voltage || a.ah - b.ah; });
    return out;
  }

  function recommend(voltage, requiredAh) {
    var candidates = batteries.filter(function (b) { return b.voltage === voltage; });
    var fit = candidates.filter(function (b) { return b.ah >= requiredAh; });
    if (fit.length) return { product: fit[0].product, count: 1 };
    // Requirement bigger than the largest single unit: suggest parallel units.
    var biggest = candidates[candidates.length - 1];
    if (!biggest) return null;
    return { product: biggest.product, count: Math.ceil(requiredAh / biggest.ah) };
  }

  function recommendCardHtml(rec) {
    if (!rec) return '';
    var p = rec.product;
    var img = p.images && p.images.length
      ? '<img src="' + PR.esc(p.images[0].url) + '" alt="' + PR.esc(p.name) + '">'
      : '<div class="ph small">' + PR.esc(PR.initials(p.name)) + '</div>';
    return '<div class="calc-recommend"><b>' + (rec.count > 1 ? 'Recommended (use ' + rec.count + ' in parallel)' : 'Recommended for you') + '</b>' +
      '<div class="calc-recommend-card">' + img +
        '<div class="info"><b>' + PR.esc(p.name) + '</b><span>' + PR.esc(p.sku || '') +
          (p.orderable ? ' · ' + PR.money(p.price) + (rec.count > 1 ? ' each' : '') : '') + '</span></div>' +
        (p.orderable
          ? '<button class="btn orange" type="button" data-add-to-cart="' + PR.esc(p.id) + '">ADD</button>'
          : '') +
        '<a class="outline" href="' + PR.productUrl(p) + '">VIEW</a>' +
      '</div></div>';
  }

  function ctaHtml(message) {
    return '<div class="calc-cta"><span>Not sure which one fits your setup?</span>' +
      '<a class="btn dark" href="' + PR.esc(PR.whatsapp(message)) + '" target="_blank" rel="noopener">💬 ASK AN EXPERT</a></div>';
  }

  function fmtHours(h) {
    if (!Number.isFinite(h) || h <= 0) return '0 min';
    if (h >= 1) {
      var whole = Math.floor(h);
      var mins = Math.round((h - whole) * 60);
      return whole + ' hr' + (whole === 1 ? '' : 's') + (mins ? ' ' + mins + ' min' : '');
    }
    return Math.round(h * 60) + ' min';
  }

  function computeSize() {
    var load = Number(document.getElementById('bc_load').value) || 0;
    var hours = Number(document.getElementById('bc_hours').value) || 0;
    var voltage = Number(document.getElementById('bc_voltage').value);
    var wh = load * hours;
    var requiredAh = load > 0 ? wh / (voltage * SYSTEM_EFFICIENCY) : 0;
    var rec = requiredAh > 0 ? recommend(voltage, requiredAh) : null;

    var host = document.getElementById('calcResult');
    host.innerHTML =
      '<div class="label">Required Battery Capacity</div>' +
      '<div class="value">' + Math.ceil(requiredAh) + '<small>Ah at ' + voltage + 'V</small></div>' +
      '<div class="calc-gauge"><span style="width:' + Math.min(100, requiredAh ? 100 : 0) + '%"></span></div>' +
      '<div class="sub-metrics">' +
        '<div class="sub-metric"><span>Energy needed</span><b>' + Math.round(wh) + ' Wh</b></div>' +
        '<div class="sub-metric"><span>Load</span><b>' + load + ' W</b></div>' +
        '<div class="sub-metric"><span>Backup time</span><b>' + fmtHours(hours) + '</b></div>' +
      '</div>' +
      '<div class="calc-note">Includes a real-world allowance for LiFePO4 usable capacity and inverter efficiency. Actual runtime varies with battery age, temperature and inverter used.</div>';

    var recHost = document.createElement('div');
    recHost.innerHTML = recommendCardHtml(rec) + ctaHtml(
      'Hello PowerRun Industries, I need a battery for ' + load + 'W load with ' + hours + ' hours backup (about ' +
      Math.ceil(requiredAh) + 'Ah at ' + voltage + 'V). Please help me choose.');
    host.appendChild(recHost);
  }

  function computeTime() {
    var voltage = Number(document.getElementById('bc_v2').value);
    var ah = Number(document.getElementById('bc_ah2').value) || 0;
    var load = Number(document.getElementById('bc_load2').value) || 0;
    var usableWh = voltage * ah * SYSTEM_EFFICIENCY;
    var hours = load > 0 ? usableWh / load : 0;

    var host = document.getElementById('calcResult');
    host.innerHTML =
      '<div class="label">Estimated Backup Time</div>' +
      '<div class="value">' + fmtHours(hours) + '</div>' +
      '<div class="calc-gauge"><span style="width:' + Math.min(100, hours ? (hours / 24) * 100 : 0) + '%"></span></div>' +
      '<div class="sub-metrics">' +
        '<div class="sub-metric"><span>Usable energy</span><b>' + Math.round(usableWh) + ' Wh</b></div>' +
        '<div class="sub-metric"><span>Battery</span><b>' + voltage + 'V ' + ah + 'Ah</b></div>' +
        '<div class="sub-metric"><span>Load</span><b>' + load + ' W</b></div>' +
      '</div>' +
      '<div class="calc-note">Includes a real-world allowance for LiFePO4 usable capacity and inverter efficiency. Actual runtime varies with battery age, temperature and inverter used.</div>' +
      ctaHtml('Hello PowerRun Industries, my ' + voltage + 'V ' + ah + 'Ah battery should run a ' + load +
        'W load for about ' + fmtHours(hours) + '. I would like advice on my setup.');
  }

  function compute() { mode === 'size' ? computeSize() : computeTime(); }

  function switchMode(next) {
    mode = next;
    document.querySelectorAll('#calcModeTabs .tab').forEach(function (btn) {
      var on = btn.getAttribute('data-mode') === mode;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', String(on));
    });
    document.getElementById('fields-size').hidden = mode !== 'size';
    document.getElementById('fields-time').hidden = mode !== 'time';
    compute();
  }

  document.addEventListener('DOMContentLoaded', async function () {
    PR.mountLayout('');
    document.getElementById('calcModeTabs').addEventListener('click', function (event) {
      var btn = event.target.closest('[data-mode]');
      if (btn) switchMode(btn.getAttribute('data-mode'));
    });
    document.getElementById('calcForm').addEventListener('input', compute);

    document.getElementById('calcResult').innerHTML = '<div class="label">Calculating…</div><div class="value">—</div>';
    try {
      var products = await PR.loadProducts();
      batteries = parseBatteries(products);
    } catch (err) {
      console.error('[PowerRun] battery calculator: could not load products:', err);
    }
    compute();
  });
})();
