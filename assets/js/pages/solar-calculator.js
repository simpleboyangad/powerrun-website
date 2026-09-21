/* Solar System Size Calculator - customer-facing sizing tool.
 * Daily units (kWh) -> solar panel kW, inverter kW, battery kWh/Ah, with
 * PowerRun product recommendations for each. All live, no submit button.
 */
(function () {
  'use strict';
  var PR = window.PR;
  var usageMode = 'units';
  var panels = [];    // [{watts, product}]
  var inverters = [];  // [{kw, product}]
  var batteries = [];  // [{voltage, ah, product}]

  var SUN_HOURS_YIELD = 4;      // ~ units generated per day per installed kW, Indian average
  var INVERTER_MARGIN = 1.25;   // inverter sized above the actual peak load
  var BATTERY_EFFICIENCY = 0.81; // usable DoD x inverter efficiency, same as the battery calculator

  function parseCatalog(products) {
    products.forEach(function (p) {
      var m1 = /Solar Panel\s+(\d+)W/i.exec(p.name);
      if (m1) { panels.push({ watts: Number(m1[1]), product: p }); return; }
      var m2 = /Hybrid Inverter\s+([\d.]+)kW/i.exec(p.name);
      if (m2) { inverters.push({ kw: Number(m2[1]), product: p }); return; }
      var m3 = /LFP Battery\s+([\d.]+)V\s+(\d+)Ah/i.exec(p.name);
      if (m3) batteries.push({ voltage: Number(m3[1]), ah: Number(m3[2]), product: p });
    });
    panels.sort(function (a, b) { return a.watts - b.watts; });
    inverters.sort(function (a, b) { return a.kw - b.kw; });
    batteries.sort(function (a, b) { return a.voltage - b.voltage || a.ah - b.ah; });
  }

  function recommendInverter(requiredKw) {
    var fit = inverters.filter(function (i) { return i.kw >= requiredKw; });
    return fit.length ? { product: fit[0].product, count: 1 } : (inverters.length
      ? { product: inverters[inverters.length - 1].product, count: 1, undersized: true } : null);
  }

  function recommendBattery(voltage, requiredAh) {
    var candidates = batteries.filter(function (b) { return b.voltage === voltage; });
    var fit = candidates.filter(function (b) { return b.ah >= requiredAh; });
    if (fit.length) return { product: fit[0].product, count: 1 };
    var biggest = candidates[candidates.length - 1];
    return biggest ? { product: biggest.product, count: Math.ceil(requiredAh / biggest.ah) } : null;
  }

  function recommendCardHtml(title, rec, priceSuffix) {
    if (!rec) return '';
    var p = rec.product;
    var img = p.images && p.images.length
      ? '<img src="' + PR.esc(p.images[0].url) + '" alt="' + PR.esc(p.name) + '">'
      : '<div class="ph small">' + PR.esc(PR.initials(p.name)) + '</div>';
    return '<div class="calc-recommend"><b>' + PR.esc(title) + (rec.count > 1 ? ' (× ' + rec.count + ')' : '') + '</b>' +
      '<div class="calc-recommend-card">' + img +
        '<div class="info"><b>' + PR.esc(p.name) + '</b><span>' + PR.esc(p.sku || '') +
          (p.orderable ? ' · ' + PR.money(p.price) + (priceSuffix || '') : '') + '</span></div>' +
        (p.orderable
          ? '<button class="btn orange" type="button" data-add-to-cart="' + PR.esc(p.id) + '">ADD</button>'
          : '') +
        '<a class="outline" href="' + PR.productUrl(p) + '">VIEW</a>' +
      '</div></div>';
  }

  function ctaHtml(message) {
    return '<div class="calc-cta"><span>Want a professional site survey before you buy?</span>' +
      '<a class="btn dark" href="' + PR.esc(PR.whatsapp(message)) + '" target="_blank" rel="noopener">💬 ASK AN EXPERT</a></div>';
  }

  function switchUsageMode(next) {
    usageMode = next;
    document.querySelectorAll('#usageModeTabs .tab').forEach(function (btn) {
      var on = btn.getAttribute('data-usage') === usageMode;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', String(on));
    });
    document.getElementById('usage-units').hidden = usageMode !== 'units';
    document.getElementById('usage-load').hidden = usageMode !== 'load';
    compute();
  }

  function dailyKwh() {
    if (usageMode === 'units') return Number(document.getElementById('sc_units').value) || 0;
    var load = Number(document.getElementById('sc_load').value) || 0;
    var hours = Number(document.getElementById('sc_hours').value) || 0;
    return (load * hours) / 1000;
  }

  function panelBreakdownHtml(requiredKw) {
    if (!panels.length || requiredKw <= 0) return '';
    var rows = panels.map(function (p) {
      var count = Math.ceil((requiredKw * 1000) / p.watts);
      return '<tr><td><b>' + p.watts + 'W</b> panels</td><td>' + count + ' panel' + (count === 1 ? '' : 's') +
        '</td><td>' + (count * p.watts / 1000).toFixed(2) + ' kW installed</td>' +
        '<td class="nowrap"><a class="outline" href="' + PR.productUrl(p.product) + '">View</a></td></tr>';
    }).join('');
    return '<div class="panel" style="margin-top:0"><h2>Panel Count by Wattage</h2>' +
      '<p class="section-sub">Choose whichever PowerRun panel wattage suits your roof space.</p>' +
      '<div class="table-scroll"><table class="spec-table" style="width:100%"><thead><tr>' +
        '<th style="padding:11px 14px;font-size:12px;color:#777">Panel</th>' +
        '<th style="padding:11px 14px;font-size:12px;color:#777">Quantity Needed</th>' +
        '<th style="padding:11px 14px;font-size:12px;color:#777">Installed Capacity</th><th></th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  function compute() {
    var kwhDay = dailyKwh();
    var days = Number(document.getElementById('sc_days').value) || 1;
    var voltage = Number(document.getElementById('sc_voltage').value);

    var solarKw = kwhDay / SUN_HOURS_YIELD;
    var peakLoadKw = usageMode === 'load' ? (Number(document.getElementById('sc_load').value) || 0) / 1000 : solarKw;
    var inverterKw = peakLoadKw * INVERTER_MARGIN;
    var batteryKwh = (kwhDay * days) / BATTERY_EFFICIENCY;
    var batteryAh = voltage > 0 ? (batteryKwh * 1000) / voltage : 0;

    var host = document.getElementById('calcResult');
    host.innerHTML =
      '<div class="label">Recommended Solar Panel Size</div>' +
      '<div class="value">' + solarKw.toFixed(1) + '<small>kW</small></div>' +
      '<div class="calc-gauge"><span style="width:' + Math.min(100, kwhDay ? 100 : 0) + '%"></span></div>' +
      '<div class="sub-metrics">' +
        '<div class="sub-metric"><span>Daily usage</span><b>' + kwhDay.toFixed(1) + ' units</b></div>' +
        '<div class="sub-metric"><span>Inverter Size</span><b>' + inverterKw.toFixed(1) + ' kW</b></div>' +
        '<div class="sub-metric"><span>Battery Needed</span><b>' + batteryKwh.toFixed(1) + ' kWh (' + Math.ceil(batteryAh) + ' Ah @ ' + voltage + 'V)</b></div>' +
      '</div>' +
      '<div class="calc-note">Based on ~' + SUN_HOURS_YIELD + ' effective sun-hours/day (Indian average) and ' + days + '-day battery autonomy. Actual generation varies by location, roof orientation and shading — a site survey gives an exact figure.</div>';

    var recHost = document.createElement('div');
    recHost.innerHTML =
      recommendCardHtml('Recommended Inverter', recommendInverter(inverterKw)) +
      recommendCardHtml('Recommended Battery', recommendBattery(voltage, batteryAh)) +
      ctaHtml('Hello PowerRun Industries, I use about ' + kwhDay.toFixed(1) + ' units/day and need a solar system ' +
        'sized around ' + solarKw.toFixed(1) + 'kW panels, ' + inverterKw.toFixed(1) + 'kW inverter and ' +
        batteryKwh.toFixed(1) + 'kWh battery. Please help me plan this.');
    host.appendChild(recHost);

    document.getElementById('panelBreakdownSection').innerHTML = panelBreakdownHtml(solarKw);
  }

  document.addEventListener('DOMContentLoaded', async function () {
    PR.mountLayout('');
    document.getElementById('usageModeTabs').addEventListener('click', function (event) {
      var btn = event.target.closest('[data-usage]');
      if (btn) switchUsageMode(btn.getAttribute('data-usage'));
    });
    document.getElementById('calcForm').addEventListener('input', compute);

    document.getElementById('calcResult').innerHTML = '<div class="label">Calculating…</div><div class="value">—</div>';
    try {
      var products = await PR.loadProducts();
      parseCatalog(products);
    } catch (err) {
      console.error('[PowerRun] solar calculator: could not load products:', err);
    }
    compute();
  });
})();
