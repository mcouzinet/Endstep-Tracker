// Coach: turns a game state into features, and features into a win probability.
// Shared by the extension (dashboard) and the training pipeline (Node reads Forge dumps through the same code),
// so what the model learnt from is exactly what the dashboard computes.
(function (root) {
  'use strict';

  const PHASES = ['UNTAP', 'UPKEEP', 'DRAW', 'MAIN1', 'COMBAT_BEGIN', 'COMBAT_DECLARE_ATTACKERS', 'COMBAT_DECLARE_BLOCKERS',
    'COMBAT_FIRST_STRIKE_DAMAGE', 'COMBAT_DAMAGE', 'COMBAT_END', 'MAIN2', 'END_OF_TURN', 'CLEANUP'];
  // Endstep names a few phases differently from Forge.
  const PHASE_ALIAS = { BEGIN_COMBAT: 'COMBAT_BEGIN', DECLARE_ATTACKERS: 'COMBAT_DECLARE_ATTACKERS', DECLARE_BLOCKERS: 'COMBAT_DECLARE_BLOCKERS',
    FIRST_STRIKE_DAMAGE: 'COMBAT_FIRST_STRIKE_DAMAGE', COMBAT_DAMAGE: 'COMBAT_DAMAGE', END_COMBAT: 'COMBAT_END', END_STEP: 'END_OF_TURN', ENDOFTURN: 'END_OF_TURN' };

  const FEATURES = [
    'turn', 'phase', 'my_turn', 'on_play',
    'my_life', 'opp_life', 'life_diff',
    'my_hand', 'opp_hand', 'hand_diff', 'my_library', 'opp_library',
    'my_lands', 'my_lands_untapped', 'opp_lands', 'opp_lands_untapped', 'land_diff',
    'my_creatures', 'my_power', 'my_toughness', 'my_ready_creatures', 'my_ready_power',
    'opp_creatures', 'opp_power', 'opp_toughness', 'opp_ready_creatures', 'opp_ready_power',
    'creature_diff', 'power_diff', 'toughness_diff',
    'my_other_permanents', 'opp_other_permanents', 'my_graveyard', 'opp_graveyard', 'stack',
    'my_poison', 'opp_poison',
  ];

  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
  const has = (types, t) => Array.isArray(types) && types.includes(t);

  function side(p) {
    const bf = (p && p.battlefield) || [];
    const s = { lands: 0, landsUntapped: 0, creatures: 0, power: 0, toughness: 0, ready: 0, readyPower: 0, other: 0 };
    for (const c of bf) {
      if (!c) continue;
      if (has(c.types, 'Land')) { s.lands++; if (!c.tapped) s.landsUntapped++; continue; }
      if (has(c.types, 'Creature')) {
        s.creatures++;
        s.power += num(c.power);
        s.toughness += num(c.toughness);
        if (!c.tapped && !c.hasSummoningSickness) { s.ready++; s.readyPower += num(c.power); }
      } else s.other++;
    }
    return s;
  }

  const handSize = (p) => (p ? (typeof p.handSize === 'number' ? p.handSize : (p.hand || []).length) : 0);
  const library = (p) => num(p && (p.librarySize !== undefined ? p.librarySize : p.library));

  // state: a tracker board snapshot or a Forge dump line; mySeat: the seat evaluated (0/1). firstSeat: who played first (optional).
  function features(state, mySeat, firstSeat) {
    const players = (state && state.players) || [];
    const me = players[mySeat] || {};
    const opp = players.find((p, i) => i !== mySeat && p) || {};
    const a = side(me);
    const b = side(opp);
    const phase = PHASE_ALIAS[state.phase] || state.phase;
    const active = num(state.activePlayerId !== undefined ? state.activePlayerId : state.active);
    const f = {
      turn: num(state.turnNumber !== undefined ? state.turnNumber : state.turn),
      phase: Math.max(0, PHASES.indexOf(phase)),
      my_turn: active === mySeat ? 1 : 0,
      on_play: firstSeat === undefined || firstSeat === null ? 0.5 : (num(firstSeat) === mySeat ? 1 : 0),
      my_life: num(me.life), opp_life: num(opp.life), life_diff: num(me.life) - num(opp.life),
      my_hand: handSize(me), opp_hand: handSize(opp), hand_diff: handSize(me) - handSize(opp),
      my_library: library(me), opp_library: library(opp),
      my_lands: a.lands, my_lands_untapped: a.landsUntapped, opp_lands: b.lands, opp_lands_untapped: b.landsUntapped, land_diff: a.lands - b.lands,
      my_creatures: a.creatures, my_power: a.power, my_toughness: a.toughness, my_ready_creatures: a.ready, my_ready_power: a.readyPower,
      opp_creatures: b.creatures, opp_power: b.power, opp_toughness: b.toughness, opp_ready_creatures: b.ready, opp_ready_power: b.readyPower,
      creature_diff: a.creatures - b.creatures, power_diff: a.power - b.power, toughness_diff: a.toughness - b.toughness,
      my_other_permanents: a.other, opp_other_permanents: b.other,
      my_graveyard: (me.graveyard || []).length, opp_graveyard: (opp.graveyard || []).length,
      stack: (state.stack || []).length,
      my_poison: num(me.poisonCounters), opp_poison: num(opp.poisonCounters),
    };
    return FEATURES.map((k) => f[k]);
  }

  const sigmoid = (x) => 1 / (1 + Math.exp(-x));

  // A hand-made evaluation, used until a trained model exists (or when its file is missing/invalid).
  function heuristic(x) {
    const f = Object.fromEntries(FEATURES.map((k, i) => [k, x[i]]));
    const z = 0.12 * f.life_diff + 0.25 * f.hand_diff + 0.18 * f.power_diff + 0.08 * f.toughness_diff + 0.15 * f.land_diff
      + 0.1 * (f.my_other_permanents - f.opp_other_permanents) - 0.35 * (f.my_poison - f.opp_poison);
    return sigmoid(z);
  }

  // model: { type: 'logreg'|'mlp', features: [...], mean: [], scale: [], coef: [[...]], intercept: [...] } (see model/train.py)
  function predict(x, model) {
    if (!model || !Array.isArray(model.features) || model.features.length !== x.length) return heuristic(x);
    const z = x.map((v, i) => (v - (model.mean[i] || 0)) / (model.scale[i] || 1));
    if (model.type === 'logreg') {
      let s = model.intercept[0];
      for (let i = 0; i < z.length; i++) s += model.coef[0][i] * z[i];
      return sigmoid(s);
    }
    if (model.type === 'mlp') {
      let h = z;
      for (let l = 0; l < model.coef.length; l++) {
        const W = model.coef[l]; // [in][out]
        const b = model.intercept[l];
        const out = new Array(b.length).fill(0);
        for (let j = 0; j < b.length; j++) {
          let s = b[j];
          for (let i = 0; i < h.length; i++) s += h[i] * W[i][j];
          out[j] = l === model.coef.length - 1 ? s : Math.max(0, s); // ReLU hidden, logits out
        }
        h = out;
      }
      return sigmoid(h[0]);
    }
    return heuristic(x);
  }

  // A ranked option's label from Endstep-coach (bot/DecisionReplay), made readable: "Lightning Bolt -> <$> deals 3
  // damage to any target. -> Opponent" becomes "Lightning Bolt → Opponent"; "pass", "no attack" and "attack: A B" use
  // the given words. words: { pass, noAttack, attack } (attack is a prefix, e.g. "attack:").
  function describeOption(label, words) {
    const w = Object.assign({ pass: 'pass', noAttack: 'no attack', attack: 'attack:' }, words);
    if (label === null || label === undefined) return '';
    const s = String(label);
    if (s === 'pass') return w.pass;
    if (s === 'no attack') return w.noAttack;
    if (s.startsWith('attack:')) return `${w.attack} ${s.slice(7).trim()}`.trim();
    const parts = s.split(' -> ');
    const name = parts[0].replace(/ \(\d+\)$/, '').trim();
    if (parts.length >= 3) return `${name} → ${parts[parts.length - 1].replace(/ \(\d+\)$/, '').trim()}`;
    if (parts.length === 2 && /^Play land$/i.test(parts[1])) return name;
    return name;
  }

  const Coach = { FEATURES, features, heuristic, predict, describeOption };
  if (typeof module === 'object' && module.exports) module.exports = Coach;
  else root.EndstepCoach = Coach;
})(typeof self !== 'undefined' ? self : this);
