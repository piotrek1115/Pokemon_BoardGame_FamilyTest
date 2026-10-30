// LIVING KANTO 2.0 in the game (rules.livingKanto 'v1'; docs/design/LIVING_KANTO_2_0.md, Piotr's decisions 17.10:
// docs/design/RUMOURS_LIVING_KANTO_DECISION_CARD.md). The glue between the board (engine/livingKanto/board.js — a pure
// state machine over the plain-JSON `state.livingKanto`) and the game:
//   createGame       the board is created (its own seeded streams — the game's dice are never used)
//   week start       the board advances to the new week (refreshes, the generated ★★★ offers)
//   takeOffer        a card is taken at its board's Poké Stop (free, like takeQuest) — the board marks it taken and the
//                    card becomes an ordinary quest-book occurrence carrying its own definition (questBookEngine
//                    takeDefinedQuest); progress, done, claim (at any Poké Stop) and give up are the quest book's
// The slots are the game's: ordinary cards share the 2 ordinary slots with the quest book's own quests
// (questBookEngine.maxActive); the generated ★★★ offers are special — no limit (K-07, rumourSlotMax). The rumours and the
// Scyther expedition stay with rumourEngine (K-20: a heard rumour stays with its player; personal expeditions).
// The AI ignores the boards in v1 (aiEngine never takes an offer). No browser globals, no storage, no unseeded randomness.
import { advanceTo, boardProblem, boardView, canTakeOffer, createBoard, takeOffer as boardTake } from './livingKantoBoard.js';
import { worldFor } from './livingKantoWorld.js';
import { POKEMON_BY_ID } from '../data/pokemon.js';
import { currentPlayer } from './gameState.js';
import { log } from './log.js';
import { isSpecialQuest, questStartWeek, maxActive, questOf, rumourSlotMax, takeDefinedQuest, usesQuestBook, usesQuestDist } from './questBookEngine.js';

export const usesLivingKanto = (config) => config?.rules?.livingKanto === 'v1' && usesQuestBook(config);

// The board rules of a game: v1 (4 cards), NIGHTSHIFT_015 B questDist 'v2' → v2 (3 cards), E1 lkStagger 'e1' → the same
// with the slots opening one a week (v3 / v4). Fixed at createGame; a save's board must carry exactly these.
// + E2 lkField 'e2' → the same with the field cards (v5…v8).
const LK_KEYS = Object.freeze({ '4': 'v1', '3': 'v2', '4r': 'v3', '3r': 'v4', '4f': 'v5', '3f': 'v6', '4rf': 'v7', '3rf': 'v8', '4g': 'v9', '3g': 'v10', '4rg': 'v11', '3rg': 'v12' });
// KANTO WORLD (rules.worldDist 'w1'): the regional slots ('g') — they replace E2's field ('f')
export const lkRulesFor = (config) => LK_KEYS[`${usesQuestDist(config) ? 3 : 4}${config.rules.lkStagger === 'e1' ? 'r' : ''}${config.rules.worldDist === 'w1' ? 'g' : config.rules.lkField === 'e2' ? 'f' : ''}`];

// Once, at createGame (after the rumours: the board never touches their schedule).
export function setupLivingKanto(state) {
  if (!usesLivingKanto(state.config)) return;
  const world = worldFor(state.config);
  state.livingKanto = createBoard(world, {
    seed: state.seed, players: state.players.map((p) => p.id), week: state.turn.round, rules: lkRulesFor(state.config), // NS15 B / E1
    options: { rocket: state.config.rocket?.enabled !== false, expeditions: false },
  });
  log(state, 'system', `📋 Living Kanto: ${world.stops.length} boards, ${Object.keys(state.livingKanto.offers).length} offers.`, { livingKanto: { event: 'setup', week: state.livingKanto.week } });
}

// A week start (turnEngine.advanceTurn, beside rocketWeekStart): the board follows the game's week.
export function livingKantoWeekStart(state) {
  const board = state.livingKanto;
  if (!board || !usesLivingKanto(state.config) || board.week >= state.turn.round) return;
  const events = advanceTo(board, worldFor(state.config), state.turn.round);
  const posted = events.filter((e) => e.event === 'posted');
  const stops = [...new Set(posted.filter((e) => e.stop).map((e) => e.stop))];
  const specials = posted.filter((e) => e.kind === 'world').map((e) => e.id);
  if (posted.length) log(state, 'system', `📋 Living Kanto week ${board.week}: ${posted.length} new offer(s)${stops.length ? ` at ${stops.join(', ')}` : ''}${specials.length ? ` · ★★★ ${specials.join(', ')}` : ''}.`, { livingKanto: { event: 'week', week: board.week, stops, specials } });
}

// The game's context for the board's legality: the slots (the quest book's own quests count) and, for an
// „observe” card, how many land species this player has not seen yet.
function takeContext(state, player) {
  const active = player.questBook?.active ?? [];
  const special = (a) => isSpecialQuest(questOf(a)); // the one rule (questBookEngine)
  const world = worldFor(state.config);
  return {
    location: player.location,
    bookOrdinary: active.filter((a) => !a.def && !special(a)).length, // the board counts its own cards itself
    bookSpecial: active.filter((a) => !a.def && special(a)).length,
    ordinaryMax: maxActive(state.config),
    specialMax: rumourSlotMax(state.config),
    unseenCatchable: Object.keys(world.catchable).filter((id) => POKEMON_BY_ID[id].rarity !== 'superRare' && !player.pokedex.seen.includes(id)).length,
    ...(['w4', 'eq'].includes(state.config.rules.questStart) && state.turn.round < questStartWeek(state.config) ? { fromWeek: questStartWeek(state.config) } : {}), // PLAYTEST_016 PT016-02 'w4' / 'eq'
  };
}

// Why this player cannot take offer `id` here and now (the board's reason: gone · taken {by} · notHere · slotsFull ·
// specialFull · maxPerGame · cooldown {until} · nothingNew) — null when they can.
export function offerBlock(state, player, id) {
  const board = state.livingKanto;
  if (!board || !usesLivingKanto(state.config)) return { reason: 'off' };
  const r = canTakeOffer(board, player.id, id, takeContext(state, player));
  return r.ok ? null : r;
}

// The offers posted where this player stands (a board's four cards and any ★★★ posted here), each with its block.
// E2 (`field`, LK_RULES v5…v8): `view.field` — the cards hanging HERE in the field (open, or a „taken by …” stub).
export function offersHere(state, player) {
  const board = state.livingKanto;
  const here = player.location;
  const fieldHere = board ? Object.values(board.offers).filter((o) => o.kind === 'standard' && o.postAt === here && board.week < o.expiresWeek) : [];
  if (!board || !usesLivingKanto(state.config) || !board.stops[here] && !fieldHere.length && !Object.values(board.offers).some((o) => o.kind !== 'standard' && o.posts?.includes(here))) return null;
  const ctx = takeContext(state, player);
  const view = board.stops[here] ? boardView(board, player.id, here, ctx) : { stop: here, week: board.week, nextRefresh: null, cards: [], specials: [] };
  if (!board.stops[here]) {
    view.specials = Object.values(board.offers).filter((o) => o.kind !== 'standard' && o.posts?.includes(here)).map((o) => ({ id: o.id, kind: o.kind, expiresWeek: o.expiresWeek, takenBy: o.takenBy ?? null, take: canTakeOffer(board, player.id, o.id, ctx) }));
  }
  view.field = fieldHere.map((o) => ({ id: o.id, kind: 'standard', field: true, from: o.stop, expiresWeek: o.expiresWeek, takenBy: o.takenBy ?? null, take: canTakeOffer(board, player.id, o.id, ctx) }));
  return view;
}

// E2: the places where this player could take a field card now (open, and the board allows it) — the map's 📋 marks.
export function fieldOfferPlaces(state, player) {
  const board = state.livingKanto;
  if (!board || !usesLivingKanto(state.config)) return new Map();
  const ctx = takeContext(state, player);
  const out = new Map();
  for (const o of Object.values(board.offers)) {
    if (o.kind !== 'standard' || !o.postAt || o.takenBy || board.week >= o.expiresWeek) continue;
    const r = canTakeOffer(board, player.id, o.id, { ...ctx, location: o.postAt });
    if (!r.ok && r.reason !== 'slotsFull') continue; // done / cooldown / not for this player: no mark (a full book: still shown)
    out.set(o.postAt, [...(out.get(o.postAt) ?? []), o]);
  }
  return out;
}

// The legal take actions (free, in the player's turn): every open card here the board allows.
export function livingKantoActions(state, player) {
  if (state.phase !== 'turn' || !state.livingKanto || !usesLivingKanto(state.config)) return [];
  const view = offersHere(state, player);
  if (!view) return [];
  return [...view.cards.filter((c) => c.id && c.take.ok), ...view.specials.filter((c) => c.take.ok), ...(view.field ?? []).filter((c) => c.take.ok)].map((c) => ({ type: 'takeOffer', quest: c.id }));
}

export function takeOffer(state, id) {
  const player = currentPlayer(state);
  const board = state.livingKanto;
  const contract = boardTake(board, player.id, id, takeContext(state, player));
  takeDefinedQuest(state, player, contract.quest, contract.occ);
}

export const offerOf = (state, id) => state.livingKanto?.offers?.[id] ?? null;

// A loaded save (gameState.deserialize): a game with the boards must carry a board this version can play — checked, never
// regenerated, never migrated; a game without them must carry none. { reason: 'newer' | 'corrupt', message } or null.
export function livingKantoSaveProblem(state) {
  const on = state.config?.rules?.livingKanto === 'v1';
  if (!on) return state.livingKanto === undefined ? null : { reason: 'corrupt', message: 'a Living Kanto board in a game without Living Kanto' };
  if (state.livingKanto === undefined) return { reason: 'corrupt', message: 'a Living Kanto game without its board' };
  const problem = boardProblem(state.livingKanto, (state.players ?? []).map((p) => p.id));
  if (problem) return problem;
  // NIGHTSHIFT_015 B / E1: the board's rules follow the game's (lkRulesFor) — never another board's rules
  const want = lkRulesFor(state.config);
  return state.livingKanto.rules === want ? null : { reason: 'corrupt', message: `board rules ${state.livingKanto.rules} in a game that plays ${want}` };
}
