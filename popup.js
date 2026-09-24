// Toolbar popup: the match in progress (the opponent's archetype, my record against it, my side plan), otherwise the
// session; a way into the dashboard and the switch of the in-page panel.
const S = self.EndstepShared;
const T = self.EndstepTracker;
const Meta = self.EndstepMeta;
const $ = (s) => document.querySelector(s);
const { esc, wl, pct } = S;
let I18N;
const t = (k, v) => I18N.t(k, v);

// background.js brings back an open dashboard tab, or opens one.
async function openDashboard() {
  await chrome.runtime.sendMessage({ openDashboard: true });
  window.close();
}

async function load() {
  const all = await chrome.storage.local.get(null);
  const d = { matches: [], notes: {}, plans: {}, decks: S.obj(all.decks), settings: S.obj(all.settings) };
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith('match:')) { const m = S.normalizeMatch(v); if (m) d.matches.push(m); }
    else if (k.startsWith('note:')) d.notes[k.slice(5)] = S.obj(v);
    else if (k.startsWith('plan:')) d.plans[k] = String(v || '');
  }
  d.matches.sort((a, b) => b.startedAt - a.startedAt);
  d.meta = all.meta ? { formats: all.meta.formats, byFormat: S.obj(all.meta.byFormat) } : null;
  return d;
}

function render(d) {
  const C = { notes: d.notes, decks: d.decks, t };
  const guess = (m) => (S.archetype(m, C) ? null : S.recognize(m, d.meta, Meta, T));
  const keyOf = (m) => S.oppKey(m, C, (guess(m) || {}).name);
  const stat = (label, r) => `<div><dt>${esc(label)}</dt><dd><b>${wl(r)}</b>${r.W + r.L + r.D >= 5 ? ` · ${pct(r)}` : ''}</dd></div>`;
  const live = d.matches.find((m) => S.isLive(m));
  let html;
  if (live) {
    const a = S.archetype(live, C);
    const g = guess(live);
    const format = S.formatOf(live, C);
    const deck = S.deckName(live, C);
    const key = keyOf(live);
    const vs = d.matches.filter((m) => m !== live && S.formatOf(m, C) === format && S.deckName(m, C) === deck && keyOf(m) === key);
    const r = S.records(vs);
    const plan = key !== '?' && d.plans[S.planKey(format, deck, key, t)];
    const opp = S.opps(live).map((p) => p.name).join(', ') || '?';
    const game = live.games.length ? ` · ${t('game_n', { n: live.games[live.games.length - 1].n })}` : '';
    html = `<section>
      <h2>${esc(t('popup_live', { opp }))}${S.pips(S.colorsOf(live), t)}<span class="muted">${esc(S.scoreText(live))}${esc(game)}</span></h2>
      <p class="arch">${a ? `<span class="tag">${esc(a)}</span>` : g ? `<span class="tag guess">${esc(g.name)}</span><span class="muted">${esc(t('recognized_pct', { p: Math.round(g.p * 100) }))}</span>` : `<span class="muted">${esc(t('popup_unknown_opp'))}</span>`}</p>
    </section>
    ${key === '?' ? '' : `<section><h3>${esc(t('popup_vs_record', { deck }))}</h3>${vs.some((m) => m.result)
      ? `<dl class="stats">${stat(t('matches'), r.m)}${stat(t('g1'), r.s.g1)}${stat(t('g23'), r.s.g23)}</dl>` : `<p class="note">${esc(t('popup_first_time'))}</p>`}</section>
    <section><h3>${esc(t('side_plan'))}</h3>${plan ? `<pre class="plan">${esc(plan)}</pre>` : `<p class="note">${esc(t('popup_no_plan'))}</p>`}</section>`}`;
  } else if (d.matches.length) {
    const sess = S.lastSession(d.matches);
    const title = S.sessionOpen(sess) ? t('session_now') : t('session_last', { when: S.ago(sess[0].startedAt, I18N) });
    const recent = sess.slice(0, 3).map((m) => {
      const r = m.status === 'complete' && ['W', 'L', 'D'].includes(m.result) ? m.result : '';
      const a = S.archetype(m, C) || (guess(m) || {}).name || '';
      return `<li><span class="result ${r || 'open'}"><i></i>${esc(r ? t({ W: 'win', L: 'loss', D: 'draw' }[r]) : t('unfinished'))}</span>`
        + `<span class="who"><span>${esc(S.opps(m).map((p) => p.name).join(', ') || '?')}</span><span class="muted">${esc(a || S.deckName(m, C))}</span></span><span class="score">${esc(S.scoreText(m))}</span></li>`;
    }).join('');
    html = `<section><h2>${esc(title)}<span class="muted">${wl(S.records(sess).m)} · ${esc(I18N.tn('n_matches', sess.length))}</span></h2></section><ul class="recent">${recent}</ul>`;
  } else {
    html = `<p class="note">${esc(t('popup_empty'))}</p>`;
  }
  $('#main').innerHTML = html;
  $('#overlay').checked = d.settings.overlay !== false;
}

(async () => {
  I18N = await S.loadI18n();
  document.documentElement.lang = I18N.locale;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  let d = await load();
  render(d);
  document.body.classList.remove('loading');
  $('#open').addEventListener('click', openDashboard);
  $('#overlay').addEventListener('change', (e) => chrome.storage.local.set({ settings: { ...d.settings, overlay: e.target.checked } }));
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'local' && Object.keys(changes).some((k) => /^(match|note|plan):|^settings$/.test(k))) { d = await load(); render(d); }
  });
})();
