// In-page panel on endstep.cc. While a game is played: a small pill (recording, session record). Between games:
// the matchup, i.e. the opponent's archetype and my record against it with this deck. After the match:
// the result and the recognized archetype to confirm in one click. Anywhere, the archetype can be corrected by hand.
// On the history page, while I import it from the dashboard: how many matches were read and added.
// Passive by design: it never acts on the game, never takes the keyboard focus except in the archetype field I open
// (the game's own keys, like Space to pass priority, keep working), and lives in a closed shadow root: the page
// cannot read what it shows.
(() => {
  const S = self.EndstepShared;
  const T = self.EndstepTracker;
  const Meta = self.EndstepMeta;
  const HOST = 'endstep-tracker-panel';
  const AFTER_MS = 10 * 60e3; // how long the end-of-match card stays up
  const orphaned = () => !(chrome.runtime && chrome.runtime.id);
  const { esc, wl, pct } = S;
  const I = S.browserI18n(); // content scripts cannot read the dashboard's language choice: the browser's language
  const t = I.t;

  const prev = document.getElementById(HOST);
  if (prev) prev.remove(); // a copy left behind by an extension reload

  const data = { matches: new Map(), notes: {}, decks: {}, meta: null, settings: {}, historyImport: null };
  let shown = null; // { id, phase, open } as last rendered
  let choice = null; // { phase key, open }: the user's toggle, kept until the phase changes
  let dismissed = null; // id of the match whose end card the user closed
  let edit = null; // { id, value }: the archetype being typed for that match
  const typing = () => document.activeElement === host; // then the updates wait: a redraw would drop the field

  const host = document.createElement('div');
  host.id = HOST;
  host.hidden = true;
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>
    :host { all: initial; position: fixed; z-index: 2147483000; color-scheme: dark; }
    :host([hidden]) { display: none; }
    * { box-sizing: border-box; }
    .box {
      --ink: #efe7d7; --ink-2: #bfb29a; --ink-3: #8f846f; --gold: #d4ae62; --gold-hi: #ecca86; --line: #43392c;
      --win: #1a9f86; --loss: #e5664b; --surface: #14110d; --surface-2: #1b1712;
      width: max-content; max-width: 300px; border: 1px solid var(--line); border-radius: 10px; background: rgb(20 17 13 / .96);
      box-shadow: 0 14px 34px -10px rgb(0 0 0 / .7), 0 2px 8px rgb(0 0 0 / .45);
      color: var(--ink); font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased;
    }
    .box.open { width: 300px; }
    .bar { display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 8px; cursor: grab; user-select: none; touch-action: none; }
    .bar:active { cursor: grabbing; }
    .grip { width: 10px; height: 14px; color: var(--ink-3); flex: none; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #e5664b; flex: none; }
    .dot.off { background: var(--ink-3); }
    .dot.import { background: var(--gold); }
    .sum { white-space: nowrap; color: var(--ink-2); font-variant-numeric: tabular-nums; }
    .sum b { color: var(--ink); font-weight: 600; }
    button { font: inherit; color: inherit; cursor: pointer; }
    .icon { display: inline-grid; place-items: center; width: 24px; height: 24px; margin-left: auto; border: 0; border-radius: 6px; background: none; color: var(--ink-2); }
    .icon:hover { background: var(--surface-2); color: var(--ink); }
    .icon svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .body { display: grid; gap: 10px; padding: 2px 12px 12px; border-top: 1px solid var(--line); padding-top: 10px; }
    h2 { margin: 0; font-size: 14px; font-weight: 650; }
    h3 { margin: 0 0 4px; font-size: 11px; font-weight: 500; color: var(--ink-3); }
    p { margin: 0; }
    .muted { color: var(--ink-3); }
    .tag { display: inline-block; padding: 1px 8px; border-radius: 999px; background: rgb(212 174 98 / .12); color: var(--gold-hi); font-size: 12px; }
    .tag.guess { background: none; border: 1px dashed rgb(212 174 98 / .55); color: var(--ink-2); }
    .stats { display: flex; flex-wrap: wrap; gap: 4px 14px; font-variant-numeric: tabular-nums; color: var(--ink-2); }
    .stats b { color: var(--ink); font-weight: 600; }
    .W { color: var(--win); } .L { color: var(--loss); }
    .row { display: flex; flex-wrap: wrap; gap: 8px; }
    .btn { padding: 5px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface-2); font-size: 12px; }
    .btn:hover { border-color: var(--gold); }
    .btn.primary { background: var(--gold); border-color: var(--gold); color: #0c0a08; font-weight: 600; }
    .side { display: grid; gap: 2px; }
    .side .in { color: var(--win); } .side .out { color: var(--loss); }
    .arch { display: flex; align-items: center; gap: 6px; }
    .edit { display: flex; align-items: center; gap: 6px; }
    input { flex: 1; min-width: 0; padding: 4px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); font: inherit; font-size: 12px; }
    input:focus { outline: none; border-color: var(--gold); }
    .edit .icon { margin-left: 0; }
    @media (prefers-reduced-motion: no-preference) { .box { transition: width .15s cubic-bezier(.16, 1, .3, 1); } }
  </style><div class="box"></div>`;
  const box = root.querySelector('.box');
  document.documentElement.appendChild(host);

  // Where it sits: above the hand, left of the phase column by default; dragged elsewhere, it stays there. pos is the
  // place asked for, at: where it shows. Kept inside the window (unfolded between games, a smaller window), it moves
  // only for as long as it must, then goes back to pos.
  const pos = { right: 168, bottom: 172 };
  const at = { right: 168, bottom: 172 };
  const place = () => {
    const r = box.getBoundingClientRect();
    at.right = Math.max(8, Math.min(pos.right, innerWidth - r.width - 8));
    at.bottom = Math.max(8, Math.min(pos.bottom, innerHeight - r.height - 8));
    host.style.right = at.right + 'px';
    host.style.bottom = at.bottom + 'px';
  };
  addEventListener('resize', place);

  const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const CHEVRON_UP = '<path d="m6 15 6-6 6 6"/>';
  const CHEVRON_DOWN = '<path d="m6 9 6 6 6-6"/>';
  const CROSS = '<path d="M7 7l10 10M17 7 7 17"/>';
  const PENCIL = '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>';
  const GRIP = '<svg class="grip" viewBox="0 0 10 14" aria-hidden="true"><g fill="currentColor"><circle cx="2.5" cy="2.5" r="1.3"/><circle cx="7.5" cy="2.5" r="1.3"/><circle cx="2.5" cy="7" r="1.3"/><circle cx="7.5" cy="7" r="1.3"/><circle cx="2.5" cy="11.5" r="1.3"/><circle cx="7.5" cy="11.5" r="1.3"/></g></svg>';

  function render() {
    if (orphaned()) { host.remove(); return; }
    const now = Date.now();
    // Importing my history, which I asked for: its count, whether the panel is on or off.
    const imp = data.historyImport;
    if (S.importing(imp, now) && location.pathname.startsWith('/history')) {
      box.classList.add('open');
      box.innerHTML = `<div class="bar" title="${esc(t('ov_move'))}">${GRIP}<span class="dot import"></span><span class="sum"><b>${esc(t('ov_import_title'))}</b></span></div>`
        + `<div class="body"><p class="stats"><span>${esc(t('ov_import_read'))} <b>${imp.read || 0}</b></span><span>${esc(t('ov_import_added'))} <b>${imp.added || 0}</b></span></p>`
        + `<p class="muted">${esc(t(imp.failed ? 'ov_import_failed' : imp.done ? 'ov_import_all' : 'ov_import_hint'))}</p><div class="row"><button class="btn primary" tabindex="-1" data-import-done>${esc(t('ov_import_done'))}</button></div></div>`;
      host.hidden = false;
      shown = { id: null, phaseKey: 'import', open: true, current: '' };
      place();
      return;
    }
    const list = [...data.matches.values()].sort((a, b) => b.startedAt - a.startedAt);
    const live = list.find((m) => S.isLive(m, now));
    const done = !live && list.find((m) => m.status === 'complete' && now - (m.endedAt || m.updatedAt) < AFTER_MS);
    const m = live || (done && done.id !== dismissed ? done : null);
    if (data.settings.overlay === false || !m) { host.hidden = true; shown = null; return; }
    if (edit && edit.id !== m.id) edit = null;
    const last = m.games[m.games.length - 1];
    const phase = live ? (last && (last.outcome || last.winnerSeat !== undefined) ? 'between' : 'game') : 'after';
    const phaseKey = `${m.id}|${phase}|${last ? last.n : 0}`;
    if (choice && choice.key !== phaseKey) choice = null;
    const open = choice ? choice.open : phase !== 'game'; // folded while a game is played, unfolded around it

    const C = { notes: data.notes, decks: data.decks, t };
    const guess = (x) => (S.archetype(x, C) ? null : S.recognize(x, C, data.meta, Meta, T));
    const keyOf = (x) => S.oppKey(x, C, (guess(x) || {}).name);
    const session = S.records(S.lastSession(list), now).m;
    const opp = S.opps(m).map((p) => p.name).join(', ') || '?';
    const summary = phase === 'after'
      ? `<span class="dot off"></span><span class="sum"><b class="${m.result}">${esc(t({ W: 'win', L: 'loss', D: 'draw' }[m.result] || 'unfinished'))}</b> ${esc(S.scoreText(m))}</span>`
      : `<span class="dot"></span><span class="sum"><b>REC</b> · ${esc(t('ov_session', { wl: wl(session) }))}</span>`;
    const toggle = phase === 'after'
      ? `<button class="icon" tabindex="-1" data-close title="${esc(t('drawer_close'))}" aria-label="${esc(t('drawer_close'))}">${icon(CROSS)}</button>`
      : `<button class="icon" tabindex="-1" data-toggle aria-expanded="${open}" title="${esc(t(open ? 'ov_collapse' : 'ov_expand'))}" aria-label="${esc(t(open ? 'ov_collapse' : 'ov_expand'))}">${icon(open ? CHEVRON_DOWN : CHEVRON_UP)}</button>`;
    let body = '';
    let current = '';
    if (open) {
      const a = S.archetype(m, C);
      const g = guess(m);
      const format = S.formatOf(m, C);
      const deck = S.deckName(m, C);
      const key = keyOf(m);
      current = a || (g ? g.name : '');
      // The same suggestions as the dashboard: the archetypes I already typed, then the site's own names.
      const names = new Set(Object.values(data.notes).map((n) => n.archetype).filter(Boolean));
      if (data.meta) for (const f of Object.values(data.meta.byFormat)) for (const d of f.decks || []) names.add(d.name);
      const button = (attr, label, d) => `<button class="icon" tabindex="-1" ${attr} title="${esc(label)}" aria-label="${esc(label)}">${icon(d)}</button>`;
      const arch = edit ? `<div class="edit"><input list="archetypes" value="${esc(edit.value)}" placeholder="${esc(S.commanderOf(m) || t('archetype_placeholder'))}" aria-label="${esc(t('opp_archetype'))}">`
          + `<button class="btn primary" tabindex="-1" data-save>${esc(t('ov_save'))}</button>${button('data-cancel', t('ov_cancel'), CROSS)}</div>`
          + `<datalist id="archetypes">${[...names].sort((x, y) => x.localeCompare(y)).map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`
        : `<p class="arch"><span>${a ? `<span class="tag">${esc(a)}</span>`
          : g ? `<span class="tag guess">${esc(g.name)}</span> <span class="muted">${esc(t('recognized_pct', { p: Math.round(g.p * 100) }))}</span>`
            : `<span class="muted">${esc(t('popup_unknown_opp'))}</span>`}</span>${button('data-edit', t('ov_edit_archetype'), PENCIL)}</p>`;
      const head = phase === 'after'
        ? `<h2>${esc(t('ov_result_' + (m.result || 'D'), { score: S.scoreText(m), opp }))}</h2>`
        : `<h2>${esc(t('ov_against', { opp }))}</h2>`;
      const vs = list.filter((x) => x !== m && !S.vsAI(x) && S.formatOf(x, C) === format && S.deckName(x, C) === deck && keyOf(x) === key);
      const r = S.records(vs, now);
      const stat = (label, x) => `<span>${esc(label)} <b>${wl(x)}</b>${x.W + x.L + x.D >= 5 ? ` · ${pct(x)}` : ''}</span>`;
      const record = key === '?' ? '' : `<div><h3>${esc(t('popup_vs_record', { deck }))}</h3>${vs.some((x) => x.result)
        ? `<p class="stats">${stat(t('matches'), r.m)}</p>` : `<p class="muted">${esc(t('popup_first_time'))}</p>`}</div>`;
      // Between two games of a Bo3: what I usually bring in and take out against this deck.
      const plan = phase === 'between' && key !== '?' ? S.sidePlan(vs, C) : null;
      const side = plan && plan.matches ? `<div><h3>${esc(t('ov_side'))}</h3><p class="side">${plan.in.length || plan.out.length
        ? `${plan.in.length ? `<span class="in">${esc(S.sideLine(plan.in, 1))}</span>` : ''}${plan.out.length ? `<span class="out">${esc(S.sideLine(plan.out, -1))}</span>` : ''}`
        : `<span>${esc(t('side_no_change'))}</span>`}<span class="muted">${esc(I.tn('side_over', plan.matches))}</span></p></div>` : '';
      const confirm = phase === 'after' && !a && g && !edit
        ? `<button class="btn primary" tabindex="-1" data-confirm="${esc(g.name)}">${esc(t('confirm_guess', { name: g.name }))}</button>` : '';
      body = `<div class="body">${head}${arch}${record}${side}<div class="row">${confirm}<button class="btn" tabindex="-1" data-dashboard>${esc(t('open_dashboard'))}</button></div></div>`;
    }
    box.classList.toggle('open', open);
    box.innerHTML = `<div class="bar" title="${esc(t('ov_move'))}">${GRIP}${summary}${toggle}</div>${body}`;
    host.hidden = false;
    shown = { id: m.id, phaseKey, open, current };
    place();
  }

  // An empty field gives the match back to the automatic recognition, as in the dashboard.
  function save() {
    if (!edit || orphaned()) return;
    const value = edit.value.trim();
    const note = Object.assign({}, data.notes[edit.id], { archetype: value });
    if (!value) delete note.archetype;
    chrome.storage.local.set({ ['note:' + edit.id]: note });
    stopEdit();
  }
  function stopEdit() {
    edit = null;
    if (root.activeElement) root.activeElement.blur(); // the keys go back to the game
    render();
  }

  // While I type in the field, the game must not get the keys: its shortcuts (Space passes priority, digits and
  // letters pick options) listen on window, several in the capture phase, and their "typing in a field?" check sees
  // this host, not my input. Added at document_start, these listeners run before any of the page's; stopping the
  // event leaves its default, the letter typed in the field.
  for (const type of ['keydown', 'keypress', 'keyup']) {
    addEventListener(type, (e) => {
      if (!typing()) return;
      e.stopImmediatePropagation();
      if (type !== 'keydown' || e.isComposing) return;
      if (e.key === 'Enter') setTimeout(save); // after a suggestion picked with Enter has filled the field
      else if (e.key === 'Escape') stopEdit();
    }, true);
  }
  // The site's dialogs keep the focus inside them (Radix FocusScope: a focusin outside the dialog, or a focusout
  // towards outside, and they take it back). Seen from the page, my field is this host: these moves stay hidden.
  for (const type of ['focusin', 'focusout']) {
    addEventListener(type, (e) => {
      if (e.target !== host && !(type === 'focusout' && e.relatedTarget === host)) return;
      e.stopImmediatePropagation();
      if (type === 'focusout' && e.target === host) setTimeout(() => { if (!typing()) render(); }); // the updates that waited
    }, true);
  }
  root.addEventListener('input', (e) => { if (edit) edit.value = e.target.value; });

  // Never take the focus: a click must leave the keyboard to the game.
  root.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  root.addEventListener('click', (e) => {
    if (!shown || orphaned()) return;
    if (e.target.closest('[data-import-done]')) { chrome.storage.local.remove('historyImport'); return; }
    if (e.target.closest('[data-toggle]')) { choice = { key: shown.phaseKey, open: !shown.open }; render(); return; }
    if (e.target.closest('[data-close]')) { dismissed = shown.id; render(); return; }
    if (e.target.closest('[data-dashboard]')) { chrome.runtime.sendMessage({ openDashboard: true }).catch(() => {}); return; }
    if (e.target.closest('[data-save]')) { save(); return; }
    if (e.target.closest('[data-cancel]')) { stopEdit(); return; }
    if (e.target.closest('[data-edit]')) {
      edit = { id: shown.id, value: shown.current };
      render();
      const input = root.querySelector('input');
      input.focus();
      input.select();
      return;
    }
    const c = e.target.closest('[data-confirm]');
    if (c) {
      const note = Object.assign({}, data.notes[shown.id], { archetype: c.dataset.confirm });
      chrome.storage.local.set({ ['note:' + shown.id]: note });
    }
  });

  // Drag by the bar; the place is kept for the next pages.
  root.addEventListener('pointerdown', (e) => {
    const bar = e.target.closest('.bar');
    if (!bar || e.target.closest('button') || e.button !== 0) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, right: at.right, bottom: at.bottom };
    bar.setPointerCapture(e.pointerId);
    const move = (ev) => { pos.right = start.right - (ev.clientX - start.x); pos.bottom = start.bottom - (ev.clientY - start.y); place(); };
    const up = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      Object.assign(pos, at); // where it was dropped, as shown
      if (!orphaned()) chrome.storage.local.set({ settings: { ...data.settings, overlayPos: { right: pos.right, bottom: pos.bottom } } });
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
  });

  function apply(k, v) {
    if (k.startsWith('match:')) { const m = v === undefined ? null : S.normalizeMatch(v); if (m) data.matches.set(m.id, m); else data.matches.delete(k.slice(6)); }
    else if (k.startsWith('note:')) { if (v === undefined) delete data.notes[k.slice(5)]; else data.notes[k.slice(5)] = S.obj(v); }
    else if (k === 'decks') data.decks = S.obj(v);
    else if (k === 'historyImport') data.historyImport = v || null;
    else if (k === 'meta') data.meta = v ? { formats: v.formats, byFormat: S.obj(v.byFormat) } : null;
    else if (k === 'settings') {
      data.settings = S.obj(v);
      const p = data.settings.overlayPos;
      if (p && Number.isFinite(p.right) && Number.isFinite(p.bottom)) Object.assign(pos, { right: p.right, bottom: p.bottom });
    }
  }
  S.loadStore().then((all) => {
    for (const [k, v] of Object.entries(all)) apply(k, v);
    render();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || orphaned()) return;
    let touched = false;
    for (const [k, c] of Object.entries(changes)) if (/^(match|note):|^(decks|meta|settings|historyImport)$/.test(k)) { apply(k, c.newValue); touched = true; }
    if (touched && !typing()) render();
  });
  const tick = setInterval(() => { if (orphaned()) { clearInterval(tick); host.remove(); } else if (shown && !typing()) render(); }, 30e3); // the end card expires
})();
