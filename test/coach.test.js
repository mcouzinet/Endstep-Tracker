// Coach features/heuristic on a board snapshot, and JS parity with the Python-trained model when one is shipped.
// Run: node test/coach.test.js
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Coach = require('../coach.js');

const land = (name, tapped = false) => ({ name, power: 0, toughness: 0, tapped, types: ['Land'], hasSummoningSickness: false });
const creature = (name, p, t, sick = false, tapped = false) => ({ name, power: p, toughness: t, tapped, types: ['Creature'], hasSummoningSickness: sick });
const board = {
  turnNumber: 4, phase: 'MAIN1', activePlayerId: 0, priorityPlayerId: 0,
  players: [
    { life: 17, hand: ['Lightning Bolt', 'Skullcrack'], handSize: 2, librarySize: 48, battlefield: [land('Mountain', true), land('Mountain'), land('Mountain'), creature('Goblin Guide', 2, 2), creature('Eidolon of the Great Revel', 2, 2, true)], graveyard: ['Lava Spike'], exile: [] },
    { life: 11, handSize: 4, librarySize: 47, battlefield: [land('Island'), land('Swamp', true), creature('Snapcaster Mage', 2, 1)], graveyard: ['Thoughtseize', 'Fatal Push'], exile: [] },
  ],
  stack: [],
};
const x = Coach.features(board, 0, 0);
const f = Object.fromEntries(Coach.FEATURES.map((k, i) => [k, x[i]]));
assert.equal(x.length, Coach.FEATURES.length);
assert.equal(f.turn, 4);
assert.equal(f.phase, 3, 'MAIN1 index');
assert.deepEqual([f.my_turn, f.on_play], [1, 1]);
assert.deepEqual([f.my_life, f.opp_life, f.life_diff], [17, 11, 6]);
assert.deepEqual([f.my_hand, f.opp_hand, f.hand_diff], [2, 4, -2]);
assert.deepEqual([f.my_lands, f.my_lands_untapped, f.opp_lands, f.opp_lands_untapped], [3, 2, 2, 1]);
assert.deepEqual([f.my_creatures, f.my_power, f.my_ready_creatures, f.my_ready_power], [2, 4, 1, 2], 'a summoning-sick creature is not ready');
assert.deepEqual([f.opp_creatures, f.opp_power, f.power_diff], [1, 2, 2]);
assert.deepEqual([f.my_graveyard, f.opp_graveyard, f.stack], [1, 2, 0]);
// Endstep phase names map onto Forge's.
assert.equal(Coach.features({ ...board, phase: 'DECLARE_ATTACKERS' }, 0, 0)[1], Coach.features({ ...board, phase: 'COMBAT_DECLARE_ATTACKERS' }, 0, 0)[1]);
// Same board from the other seat: mirrored differences.
const y = Coach.features(board, 1, 0);
const g = Object.fromEntries(Coach.FEATURES.map((k, i) => [k, y[i]]));
assert.deepEqual([g.life_diff, g.hand_diff, g.my_turn, g.on_play], [-6, 2, 0, 0]);
// Heuristic: ahead on life and board -> above 50 %, mirrored below.
assert.ok(Coach.heuristic(x) > 0.6 && Coach.heuristic(y) < 0.4);
assert.ok(Math.abs(Coach.heuristic(x) + Coach.heuristic(y) - 1) < 1e-9, 'symmetric');
assert.equal(Coach.predict(x, null), Coach.heuristic(x), 'no model -> heuristic');

// Extended features: zone sums of card vectors; the opponent's hand is never encoded.
{
  const cards = { dim: 2, cards: { 'Lightning Bolt': [1, 0], 'Goblin Guide': [0, 1], 'Snapcaster Mage': [0.5, 0.5], 'Lava Spike': [1, 1] } };
  const x2 = Coach.features2(board, 0, 0, cards);
  assert.equal(x2.length, Coach.FEATURES.length + 6 * 2);
  assert.equal(Coach.FEATURES2.length, Coach.FEATURES.length + 6 * 32);
  const z = Object.fromEntries(['my_hand', 'my_battlefield', 'opp_battlefield', 'my_graveyard', 'opp_graveyard', 'stack'].map((k, i) => [k, x2.slice(Coach.FEATURES.length + 2 * i, Coach.FEATURES.length + 2 * i + 2)]));
  assert.deepEqual(z.my_hand, [1, 0], 'Bolt in hand, Skullcrack unknown');
  assert.deepEqual(z.my_battlefield, [0, 1], 'Goblin Guide; lands and Eidolon unknown');
  assert.deepEqual(z.opp_battlefield, [0.5, 0.5]);
  assert.deepEqual(z.my_graveyard, [1, 1]);
  assert.deepEqual(z.opp_graveyard, [0, 0]);
  assert.deepEqual(z.stack, [0, 0]);
  assert.deepEqual(Coach.featuresFor({ features: Coach.FEATURES }, board, 0, 0, cards), x, 'a 37-feature model gets the counts');
  assert.equal(Coach.featuresFor({ features: Coach.FEATURES2 }, board, 0, 0, cards).length, Coach.FEATURES.length + 6 * cards.dim, 'the table sets the dimension');
}

// Ranked-option labels from the lab become readable words.
assert.equal(Coach.describeOption('Lightning Bolt (151) -> <$> deals 3 damage to any target. -> Opponent'), 'Lightning Bolt → Opponent');
assert.equal(Coach.describeOption('Goblin Guide (15) -> <$> - Creature 2 / 2'), 'Goblin Guide');
assert.equal(Coach.describeOption('Mountain (23) -> Play land'), 'Mountain');
assert.equal(Coach.describeOption('attack: Goblin Guide Kor Skyfisher', { attack: 'attaquer :' }), 'attaquer : Goblin Guide Kor Skyfisher');
assert.equal(Coach.describeOption('pass', { pass: 'passer' }), 'passer');
assert.equal(Coach.describeOption('no attack', { noAttack: "pas d'attaque" }), "pas d'attaque");

// Trained model, when present: the JS forward pass must reproduce Python's probabilities.
const modelPath = path.join(__dirname, '..', 'coach-model.json');
const parityPath = path.join(process.env.HOME, 'Developer', 'Endstep-coach', 'model', 'js-parity.json');
if (fs.existsSync(modelPath) && fs.existsSync(parityPath)) {
  const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
  assert.ok([Coach.FEATURES, Coach.FEATURES2].some((f) => JSON.stringify(f) === JSON.stringify(model.features)), 'model trained on a current feature list');
  for (const { x: vec, p } of JSON.parse(fs.readFileSync(parityPath, 'utf8'))) {
    assert.ok(Math.abs(Coach.predict(vec, model) - p) < 1e-6, `parity: js ${Coach.predict(vec, model)} vs py ${p}`);
  }
  const cardsPath = path.join(__dirname, '..', 'coach-cards.json');
  const cards = fs.existsSync(cardsPath) ? JSON.parse(fs.readFileSync(cardsPath, 'utf8')) : null;
  const px = Coach.predict(Coach.featuresFor(model, board, 0, 0, cards), model);
  assert.ok(px > 0 && px < 1);
  console.log(`coach test: ok (model ${model.type}, ${model.games} games, parity checked)`);
} else {
  console.log('coach test: ok (heuristic only, no trained model yet)');
}
