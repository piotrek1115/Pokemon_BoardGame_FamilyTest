// LIVING KANTO 2.0 — the GAME engine (rules.livingKanto 'v1'; docs/design/LIVING_KANTO_2_0.md, decisions:
// docs/design/RUMOURS_LIVING_KANTO_DECISION_CARD.md). Copied 17.10.2026 from the Living Kanto prototype (c022774 — the prototype
// stays, as the frozen design reference with its own tests) and adapted for the game: the slots come from the game's
// rules (K-07: rumours / expeditions without a limit), the authored rumours and the expedition stay with
// rumourEngine (K-20: a heard rumour stays with its player), no stones from the boards in v1 (decision 5).
// Rewards. The scale is the game's own:
// money + shop items at their shop prices (PRICES, a mirror of CONFIG.economy). The menus stay inside
// the range the CURRENT quest book pays (measureQuestBook) — never lower: Piotr finds them satisfying.
import { EXPEDITIONS, QUEST_BOOK, QUEST_PACK, RUMOUR_QUESTS } from '../data/questBook.js';
import { ITEMS } from '../data/items.js';
import { PRICES, SELL_RATE } from './livingKantoWorld.js';

// Shop value of one reward line (money = 1 per coin; 'pokeballs' = Poké Balls). Pokémon / clue / key
// items have no shop value (null).
export function lineValue(r) {
  if (r.type === 'money') return r.amount;
  if (r.type === 'pokeballs') return PRICES.pokeball * r.amount;
  if (ITEMS[r.type]) return (PRICES[r.type] ?? 0) * r.amount;
  return null;
}

// What the line is worth if sold back at a shop (⌊rate × price⌋ per item; money as it is).
export function lineSellValue(r) {
  if (r.type === 'money') return r.amount;
  const id = r.type === 'pokeballs' ? 'pokeball' : r.type;
  if (ITEMS[id]) return Math.floor(SELL_RATE * (PRICES[id] ?? 0)) * r.amount;
  return 0;
}

export const rewardValue = (lines) => lines.reduce((s, r) => s + (lineValue(r) ?? 0), 0);
export const rewardSellValue = (lines) => lines.reduce((s, r) => s + lineSellValue(r), 0);

// The current quest book (all four sets), each quest's reward in shop value — the scale to keep.
// A Pokémon reward (the fossil, the expedition) is listed apart; `clue` lines count their EREV-01
// alternative (`otherwise`).
export function measureQuestBook() {
  const all = [...QUEST_BOOK.v1, ...QUEST_PACK.day14, ...RUMOUR_QUESTS.v1, ...EXPEDITIONS.v1];
  const rows = all.map((q) => {
    const lines = q.reward.map((r) => (r.type === 'clue' && r.otherwise ? r.otherwise : r));
    const pokemon = lines.find((r) => r.type === 'pokemon')?.species ?? (q.reward.length === 0 ? 'caught' : null);
    return { id: q.id, value: pokemon ? null : rewardValue(lines), pokemon };
  });
  const values = rows.filter((r) => r.value != null).map((r) => r.value).sort((a, b) => a - b);
  const mid = values.length >> 1;
  return {
    rows,
    count: values.length,
    min: values[0],
    max: values.at(-1),
    median: values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2,
    mean: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100,
  };
}

// The stone a board pays (★★ / ★★★ menus): the handoff's candidate sources (Stage 8 D) — Water Stone
// Cerulean, Thunder Stone Vermilion, Fire Stone Celadon, Leaf Stone Fuchsia (the Safari Zone's find).
// The Moon Stone stays off the board (DEC-19 open). A stop without a stone uses the other menu lines.
export const STOP_STONES = Object.freeze({ 'cerulean-city': 'waterstone', 'vermilion-city': 'thunderstone', 'celadon-city': 'firestone', 'fuchsia-city': 'leafstone' });
export const STONE = 'STONE'; // placeholder in a menu, resolved by the posting stop
// Over the per-player stone cap a stone line pays this instead (the EREV-01 `otherwise` pattern).
export const STONE_OTHERWISE = Object.freeze({ type: 'money', amount: 3 });

// Reward menus by difficulty (★ / ★★ / ★★★). Shop values: ★ 5–7, ★★ 7–8, ★★★ 11 (= today's maximum:
// oak-water, oak-rocket, celadon-rocket). One menu line is drawn per offer.
export const REWARD_MENUS = Object.freeze({
  1: [
    [{ type: 'money', amount: 3 }, { type: 'pokeballs', amount: 1 }],
    [{ type: 'money', amount: 2 }, { type: 'potion', amount: 1 }],
    [{ type: 'money', amount: 2 }, { type: 'superball', amount: 1 }],
    [{ type: 'money', amount: 2 }, { type: 'superpotion', amount: 1 }],
  ],
  2: [
    [{ type: 'money', amount: 3 }, { type: 'superball', amount: 1 }],
    [{ type: 'money', amount: 2 }, { type: 'revive', amount: 1 }],
    [{ type: 'money', amount: 3 }, { type: 'superpotion', amount: 1 }],
    [{ type: 'money', amount: 3 }, { type: STONE, amount: 1 }],
  ],
  3: [
    [{ type: 'money', amount: 3 }, { type: 'ultraball', amount: 1 }],
    [{ type: 'money', amount: 2 }, { type: 'revive', amount: 1 }, { type: 'superball', amount: 1 }],
    [{ type: 'money', amount: 2 }, { type: STONE, amount: 1 }, { type: 'superball', amount: 1 }],
  ],
});

// The menu of one stop: STONE resolved (with its `otherwise`), lines without a stone here dropped.
// `stones: false` (rules.livingKanto 'v1', decision 5 — no stone source until the stone economy is decided, DEC-19 /
// DQ-130): a stone line pays its replacement (3 💰) and the card SAYS so — the money lines are merged into one, so a
// child is never promised a stone.
export function menuFor(difficulty, stop, { stones = true } = {}) {
  const stone = STOP_STONES[stop] ?? null;
  return REWARD_MENUS[difficulty]
    .filter((lines) => stone || !lines.some((r) => r.type === STONE))
    .map((lines) => {
      const out = lines.map((r) => (r.type !== STONE ? { ...r } : stones ? { type: stone, amount: r.amount, otherwise: { ...STONE_OTHERWISE } } : { ...STONE_OTHERWISE }));
      if (stones) return out;
      const money = out.filter((r) => r.type === 'money').reduce((n, r) => n + r.amount, 0);
      return [...(money ? [{ type: 'money', amount: money }] : []), ...out.filter((r) => r.type !== 'money')];
    });
}

// DELIVER ITEM („Zanieś…”): the player SPENDS shop items, so the reward is a trade-up — worth more than
// the items in shop value, worth LESS than them when sold (no buy → deliver → sell loop can make money).
export const DELIVER_ITEM_TABLE = Object.freeze({
  1: [
    { item: 'pokeball', count: 2, reward: [{ type: 'superpotion', amount: 1 }, { type: 'money', amount: 1 }] },
    { item: 'potion', count: 2, reward: [{ type: 'revive', amount: 1 }, { type: 'money', amount: 3 }] },
  ],
  2: [
    { item: 'superpotion', count: 1, reward: [{ type: 'ultraball', amount: 1 }] },
    { item: 'potion', count: 3, reward: [{ type: 'revive', amount: 1 }, { type: 'superball', amount: 1 }, { type: 'money', amount: 2 }] },
  ],
});

export const deliverCost = (row) => PRICES[row.item] * row.count;
