/* Home hero: rotating headline word, photo tilt toward the mouse, embers canvas */
(function () {
  'use strict';
  var hero = document.getElementById('hero');
  if (!hero) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Headline: the static HTML carries one word (for SEO / no-JS); add the rest
  // and end on the first word again so the loop restarts without a jump.
  var swap = hero.querySelector('.hx-swap');
  if (swap) {
    var list = swap.firstElementChild;
    ['business', 'e-rickshaw', 'shop', 'home'].forEach(function (w) {
      var i = document.createElement('i');
      i.textContent = w;
      i.setAttribute('aria-hidden', 'true');
      list.appendChild(i);
    });
    swap.classList.add('on');
  }

  // Photo tilts toward the mouse (desktop pointers only)
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    hero.addEventListener('mousemove', function (e) {
      var r = hero.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      hero.style.setProperty('--ry', (x * 10).toFixed(2) + 'deg');
      hero.style.setProperty('--rx', (-y * 7).toFixed(2) + 'deg');
      hero.style.setProperty('--px', (x * 14).toFixed(1) + 'px');
      hero.style.setProperty('--py', (y * 10).toFixed(1) + 'px');
    });
    hero.addEventListener('mouseleave', function () {
      ['--rx', '--ry', '--px', '--py'].forEach(function (k) { hero.style.removeProperty(k); });
    });
  }

  // Embers rising from the stand; only drawn while the hero is on screen
  var cv = document.createElement('canvas');
  cv.className = 'hx-embers';
  cv.setAttribute('aria-hidden', 'true');
  hero.appendChild(cv);
  var ctx = cv.getContext('2d');
  if (!ctx) return;
  var dpr = Math.min(2, window.devicePixelRatio || 1), W = 0, H = 0, parts = [], visible = true, running = false;
  var count = window.innerWidth < 900 ? 24 : 46;

  function size() {
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function spawn(p) {
    p = p || {};
    var wide = W >= 900;
    p.x = W * (wide ? 0.45 + Math.random() * 0.5 : 0.1 + Math.random() * 0.8);
    p.y = H * (wide ? 0.75 + Math.random() * 0.3 : 0.35 + Math.random() * 0.2);
    p.r = 0.8 + Math.random() * 2.2; p.vy = 0.3 + Math.random() * 0.9; p.vx = (Math.random() - 0.5) * 0.3;
    p.life = 0; p.max = 180 + Math.random() * 220;
    return p;
  }
  function frame() {
    if (!visible || document.hidden) { running = false; return; }
    ctx.clearRect(0, 0, W, H);
    ctx.shadowColor = '#ff5a00'; ctx.shadowBlur = 10;
    parts.forEach(function (p) {
      p.life++; p.y -= p.vy; p.x += p.vx + Math.sin((p.life + p.r * 40) / 30) * 0.25;
      var a = Math.sin(Math.PI * Math.min(1, p.life / p.max));
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283);
      ctx.fillStyle = 'rgba(255,' + (140 + (p.r * 30 | 0)) + ',60,' + (a * 0.9).toFixed(3) + ')';
      ctx.fill();
      if (p.life > p.max) spawn(p);
    });
    requestAnimationFrame(frame);
  }
  function start() { if (!running && visible && !document.hidden) { running = true; requestAnimationFrame(frame); } }

  size();
  for (var k = 0; k < count; k++) { var p = spawn(); p.life = Math.random() * p.max; parts.push(p); }
  window.addEventListener('resize', size);
  document.addEventListener('visibilitychange', start);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; start(); }).observe(hero);
  }
  start();
})();
