/* ============================================================
   Personal Assistant — shared behaviour
   Progressive enhancement only: every page works without JS,
   links are real <a> elements, this layer adds interaction.
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;
  var STORE = 'pa-theme';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- Theme ---------------------------------------- */

  function currentTheme() {
    var saved = null;
    try { saved = localStorage.getItem(STORE); } catch (e) { /* private mode */ }
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function paintThemeButton(theme) {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      var next = theme === 'dark' ? 'light' : 'dark';
      btn.setAttribute('aria-label', 'Switch to ' + next + ' theme');
      btn.setAttribute('title', 'Switch to ' + next + ' theme');
      btn.querySelectorAll('[data-icon]').forEach(function (icon) {
        icon.hidden = icon.getAttribute('data-icon') !== theme;
      });
    });
  }

  function setTheme(theme) {
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem(STORE, theme); } catch (e) { /* ignore */ }
    paintThemeButton(theme);
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  });

  paintThemeButton(currentTheme());

  /* ---------- Mobile navigation drawer ---------------------- */

  var sidebar = document.getElementById('sidebar');
  var scrim = document.getElementById('scrim');
  var navToggle = document.querySelector('[data-nav-toggle]');
  var lastFocus = null;

  function openNav() {
    if (!sidebar) return;
    lastFocus = document.activeElement;
    sidebar.classList.add('is-open');
    if (scrim) scrim.classList.add('is-open');
    if (navToggle) navToggle.setAttribute('aria-expanded', 'true');
    var first = sidebar.querySelector('a, button');
    if (first) first.focus();
  }

  function closeNav() {
    if (!sidebar) return;
    sidebar.classList.remove('is-open');
    if (scrim) scrim.classList.remove('is-open');
    if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  if (navToggle) navToggle.addEventListener('click', openNav);
  if (scrim) scrim.addEventListener('click', closeNav);
  document.querySelectorAll('[data-nav-close]').forEach(function (el) {
    el.addEventListener('click', closeNav);
  });

  /* Keep the drawer state sane across breakpoints */
  var desktop = window.matchMedia('(min-width: 1024px)');
  function syncBreakpoint() { if (desktop.matches) closeNav(); }
  if (desktop.addEventListener) desktop.addEventListener('change', syncBreakpoint);

  /* ---------- Toasts ---------------------------------------- */

  var toastHost = document.getElementById('toasts');

  function toast(message, tone) {
    if (!toastHost) return;
    var el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    var mark = tone === 'undo' ? '' :
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
    el.innerHTML = mark + '<span></span>';
    el.querySelector('span').textContent = message;
    toastHost.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity 200ms, transform 200ms';
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(function () { el.remove(); }, 220);
    }, 2600);
  }
  window.paToast = toast;

  /* ---------- Task checkboxes ------------------------------- */

  document.querySelectorAll('.task-item input[type="checkbox"]').forEach(function (box) {
    box.addEventListener('change', function () {
      var item = box.closest('.task-item');
      item.classList.toggle('is-done', box.checked);
      recountTasks();
      if (box.checked) toast('Completed — ' + item.querySelector('.row__title').textContent.trim());
    });
  });

  function recountTasks() {
    var scope = document.querySelector('[data-task-scope]');
    if (!scope) return;
    var boxes = scope.querySelectorAll('.task-item input[type="checkbox"]');
    var done = scope.querySelectorAll('.task-item input[type="checkbox"]:checked').length;
    var out = document.querySelector('[data-task-progress]');
    if (out) out.textContent = done + '/' + boxes.length;
    var bar = document.querySelector('[data-task-bar]');
    if (bar && boxes.length) {
      var pct = Math.round((done / boxes.length) * 100);
      bar.style.width = pct + '%';
      var meter = bar.closest('[role="progressbar"]');
      if (meter) {
        meter.setAttribute('aria-valuenow', String(pct));
        meter.setAttribute('aria-valuetext', done + ' of ' + boxes.length + ' tasks complete');
      }
    }
  }
  recountTasks();

  /* ---------- Chart tooltips -------------------------------- */

  var tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.setAttribute('role', 'presentation');
  document.body.appendChild(tip);

  function showTip(el) {
    var text = el.getAttribute('data-tip');
    if (!text) return;
    tip.innerHTML = text;
    var r = el.getBoundingClientRect();
    tip.style.left = (r.left + r.width / 2) + 'px';
    tip.style.top = r.top + 'px';
    tip.classList.add('is-on');
  }
  function hideTip() { tip.classList.remove('is-on'); }

  ['mouseenter', 'focusin'].forEach(function (evt) {
    document.addEventListener(evt, function (e) {
      var el = e.target.closest && e.target.closest('[data-tip]');
      if (el) showTip(el);
    }, true);
  });
  ['mouseleave', 'focusout', 'scroll'].forEach(function (evt) {
    document.addEventListener(evt, function (e) {
      if (evt === 'scroll' || (e.target.closest && e.target.closest('[data-tip]'))) hideTip();
    }, true);
  });

  /* ---------- Chart legend series toggle -------------------- */

  document.querySelectorAll('[data-series-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-series-toggle');
      var on = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(on));
      document.querySelectorAll('[data-series="' + key + '"]').forEach(function (node) {
        node.style.display = on ? '' : 'none';
      });
    });
  });

  /* ---------- Filter chips + tabs --------------------------- */

  document.querySelectorAll('[data-chip-group]').forEach(function (group) {
    group.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip || !group.contains(chip)) return;
      group.querySelectorAll('.chip').forEach(function (c) {
        c.setAttribute('aria-pressed', String(c === chip));
      });
      var label = chip.getAttribute('data-filter-label') || chip.textContent.trim();
      toast('Filtered by ' + label);
    });
  });

  document.querySelectorAll('[role="tablist"]').forEach(function (list) {
    var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));

    function select(tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      tab.focus();
    }

    list.addEventListener('click', function (e) {
      var tab = e.target.closest('[role="tab"]');
      if (tab) select(tab);
    });

    list.addEventListener('keydown', function (e) {
      var i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); select(tabs[(i + 1) % tabs.length]); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); select(tabs[(i - 1 + tabs.length) % tabs.length]); }
      if (e.key === 'Home') { e.preventDefault(); select(tabs[0]); }
      if (e.key === 'End') { e.preventDefault(); select(tabs[tabs.length - 1]); }
    });
  });

  /* ---------- Async button demo (loading state) ------------- */

  document.querySelectorAll('[data-async]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      var original = btn.innerHTML;
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.innerHTML = '<span class="btn__spinner" aria-hidden="true"></span><span>' +
        (btn.getAttribute('data-async-label') || 'Working…') + '</span>';
      setTimeout(function () {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.innerHTML = original;
        toast(btn.getAttribute('data-async-done') || 'Done');
      }, 1200);
    });
  });

  /* ---------- Progress bars animate into place -------------- */

  function fillMeters() {
    document.querySelectorAll('.progress__bar[data-value]').forEach(function (bar) {
      var pct = bar.getAttribute('data-value');
      if (reduceMotion.matches) { bar.style.width = pct + '%'; return; }
      requestAnimationFrame(function () { bar.style.width = pct + '%'; });
    });
    document.querySelectorAll('.ring circle[data-value]').forEach(function (c) {
      var pct = Number(c.getAttribute('data-value'));
      var len = Number(c.getAttribute('data-len'));
      var offset = len - (len * pct) / 100;
      if (!reduceMotion.matches) {
        c.style.transition = 'stroke-dashoffset 800ms cubic-bezier(.4,0,.2,1)';
      }
      requestAnimationFrame(function () { c.style.strokeDashoffset = String(offset); });
    });
  }
  fillMeters();

  /* ---------- Keyboard shortcuts ---------------------------- */

  var search = document.getElementById('global-search');

  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) ||
      document.activeElement.isContentEditable;

    if (e.key === 'Escape') {
      if (sidebar && sidebar.classList.contains('is-open')) { closeNav(); return; }
      if (document.activeElement === search) { search.blur(); }
      hideTip();
      return;
    }
    if (typing) return;

    if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
      if (search) { e.preventDefault(); search.focus(); search.select(); }
    }
  });

  if (search) {
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && search.value.trim()) {
        e.preventDefault();
        toast('Searching for "' + search.value.trim() + '"');
      }
    });
  }

  /* ---------- Live clock in the greeting -------------------- */

  var clock = document.querySelector('[data-clock]');
  if (clock) {
    var tick = function () {
      clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };
    tick();
    setInterval(tick, 30000);
  }

  var greet = document.querySelector('[data-greeting]');
  if (greet) {
    var h = new Date().getHours();
    greet.textContent = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }

  var today = document.querySelector('[data-today]');
  if (today) {
    today.textContent = new Date().toLocaleDateString([], {
      weekday: 'long', month: 'long', day: 'numeric'
    });
  }
})();
