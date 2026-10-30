// LIVING KANTO 2.0 — the GAME engine (rules.livingKanto 'v1'; docs/design/LIVING_KANTO_2_0.md, decisions:
// docs/design/RUMOURS_LIVING_KANTO_DECISION_CARD.md). Copied 17.10.2026 from the Living Kanto prototype (c022774 — the prototype
// stays, as the frozen design reference with its own tests) and adapted for the game: the slots come from the game's
// rules (K-07: rumours / expeditions without a limit), the authored rumours and the expedition stay with
// rumourEngine (K-20: a heard rumour stays with its player), no stones from the boards in v1 (decision 5).
// The WORLD OPPORTUNITY BOARD — a pure state machine over a plain-JSON board object, driven week by week.
// In the game (rules 'v1' below): A standard contracts and the generated ★★★ B offers only; the authored B (the
// rumours) and C (the Scyther expedition) are rumourEngine's, exactly as without the board.
//
//   A  STANDARD CONTRACTS   4 slots per Poké Stop board, generated (archetypes.js). Taken = gone for the
//                           others (a „taken by …” stub until the stop's next refresh); untaken ones stay
//                           until they expire; new ones appear only on the stop's refresh weeks.
//   B  WORLD OPPORTUNITIES  exceptional, first come first served, posted at several boards at once: the
//                           Rumours pilot's six opportunities (their weeks unchanged) + one generated ★★★
//                           offer every few weeks. Taken = gone everywhere; given up = back on the boards.
//   C  PERSONAL EXPEDITIONS the rare-Pokémon expeditions (Safari Scyther): every player may take their own,
//                           nobody's take removes it for the others (TEMPORARY POLICY — Piotr decides, Q1).
// Slots per player: 2 ordinary (A — shared with the quest book's ordinary quests), 1 special (B or C —
// today's rumour slot). A taken contract never expires (the Questbook rule); it is finished, collected or
// given up in the quest book. The board only knows take / done / claim / give up.
import { EXPEDITIONS, RUMOUR_QUESTS } from '../data/questBook.js';
import { OPPORTUNITIES, RUMOURS } from '../data/rumours.js';
import { hashIndex } from './rng.js';
import { ARCHETYPES_BY_ID, generateStandard, generateWorldOffer } from './livingKantoArchetypes.js';
import { NO_BOARD, validateOffer } from './livingKantoWorld.js';
import { lineValue, rewardValue } from './livingKantoRewards.js';
import { STONE_IDS } from '../data/items.js';

export const BOARD_VERSION = 1;
export const GENERATOR = 'g1';

// rules.livingKanto 'v1' — the prototype's numbers (Piotr 17.10: „domyślne wartości prototypu”) with the game's
// decisions: no stones (decision 5), no authored specials on the board (K-20 — rumourEngine keeps them), the slots
// from the game's rules (K-07 — `specialSlots` / `maxOrdinary` are only the fallbacks when no `ctx` says them).
// Frozen once played: a change is 'v2'.
const LK_V1 = Object.freeze({
  stones: false, // decision 5: a stone line pays its 3 💰 replacement (rewards.menuFor)
  authoredSpecials: false, // K-20: the rumours' opportunities and the expedition stay with rumourEngine
  slotsPerStop: 4, // standard offers per board
  refreshEvery: 3, // weeks between two refreshes of one board
  firstRefresh: 3, // the boards refresh staggered: stop i first at week firstRefresh + (i mod refreshEvery)
  lifeCycles: 2, // an offer lives this many refreshes (6 weeks), the first fill alternates 1 / 2
  maxOrdinary: 2, // ordinary contracts a player may hold (= CONFIG.questBook.maxActive)
  specialSlots: 1, // World Opportunity / Personal Expedition (= RUMOURS.maxActive)
  stoneCap: 2, // stones a player may get from the board per game (more → the line's `otherwise`)
  world: Object.freeze({ fresh: RUMOURS.fresh, returnGap: RUMOURS.returnGap, generatedFirst: 6, generatedEvery: 6, generatedOpen: 5, returnPolicy: 'others' }),
  newsKeep: 40, // board news kept in the save (for the table's „what changed” strip)
});
// NIGHTSHIFT_015 B (rules.questDist 'v2', a DEV pilot, OFF in every set): v1 with 3 cards per board, not 4 — fewer offers
// piled in one city (PLAYTEST_014 PT014-07). Everything else as v1.
// NIGHTSHIFT_015 E1 (ChatGPT 21.10 08:56, rules.lkStagger 'e1' — a DEV pilot, OFF in every set): the boards open their
// slots one a week — 1 card in week 1, then +1 each week up to the board's size (`ramp`); after that as v1 / v2. 'v3' =
// v1 + ramp, 'v4' = v2 (3 cards) + ramp. The same generator, but a card is generated for the week its slot opens
// (offerRng uses the week, and the cards already live steer the variety), so a later card may be ANOTHER card — review
// 22.10 (P2): E1 changes both the time and the content of the cards.
// NIGHTSHIFT_015 E2 (ChatGPT 22.10 10:20, rules.lkField 'e2' — a DEV pilot, OFF in every set): `field` — a standard card
// whose first stage points to ONE place that has no board of its own (a route, a forest, a cave, a small town) hangs
// THERE (offer.postAt); a card for another board city stays on its own board (no new pile there). At most FIELD_CAP open
// field cards a place — any further one stays on its city board (never lost). Its client stays in the city: a field card
// is collected in its board's city (quest.claimAt = the city). The card itself is the same card. 'v5'…'v8' = v1…v4 + field.
export const FIELD_CAP = 2;
export const LK_RULES = Object.freeze({
  v1: LK_V1,
  v2: Object.freeze({ ...LK_V1, slotsPerStop: 3 }),
  v3: Object.freeze({ ...LK_V1, ramp: true }),
  v4: Object.freeze({ ...LK_V1, slotsPerStop: 3, ramp: true }),
  v5: Object.freeze({ ...LK_V1, field: true }),
  v6: Object.freeze({ ...LK_V1, slotsPerStop: 3, field: true }),
  v7: Object.freeze({ ...LK_V1, ramp: true, field: true }),
  v8: Object.freeze({ ...LK_V1, slotsPerStop: 3, ramp: true, field: true }),
  // KANTO WORLD DISTRIBUTION (rules.worldDist 'w1', a DEV pilot): `regional` — the last 2 slots of every board hang their
  // card in the board's REGION (the places nearer to this city than to any other board city: routes, forests, caves,
  // Pallet, Lavender — boardRegions), at most FIELD_CAP open cards a place; a full region keeps the card in the city. A card
  // posted at the very place of its work is collected in its city (as E2: never a reward where the work is done); any
  // other keeps its own collecting place. 'v9'…'v12' = v1…v4 + regional (it replaces E2's field).
  v9: Object.freeze({ ...LK_V1, regional: 2 }),
  v10: Object.freeze({ ...LK_V1, slotsPerStop: 3, regional: 2 }),
  v11: Object.freeze({ ...LK_V1, ramp: true, regional: 2 }),
  v12: Object.freeze({ ...LK_V1, slotsPerStop: 3, ramp: true, regional: 2 }),
});

// KANTO WORLD: every board city's region — each land place without a board belongs to the nearest board city (the first
// in the world's order on a tie). Pure data of the world (cached per world).
const REGIONS = new WeakMap();
const LATE_PLACES = Object.freeze(['route-23', 'unknown-dungeon']); // Victory Road and the Cerulean Cave: the end of the game, no early card there
export function boardRegions(world) {
  if (!REGIONS.has(world)) {
    const out = Object.fromEntries(world.stops.map((s) => [s, []]));
    for (const place of world.reachable) {
      if (world.stops.includes(place) || NO_BOARD.includes(place) || LATE_PLACES.includes(place)) continue;
      const d = world.distFrom(place);
      const home = world.stops.reduce((best, s) => ((d[s] ?? Infinity) < (d[best] ?? Infinity) ? s : best), world.stops[0]);
      out[home].push(place);
    }
    REGIONS.set(world, Object.freeze(Object.fromEntries(Object.entries(out).map(([s, list]) => [s, Object.freeze(list)]))));
  }
  return REGIONS.get(world);
}
// KANTO WORLD: hang a regional slot's card in its city's region — at its own work place when that is in the region and has
// room, else at a seeded place of the region with room; a full region: it stays in the city.
function placeInRegion(board, world, offer) {
  const region = boardRegions(world)[offer.stop] ?? [];
  const room = (place) => Object.values(board.offers).filter((o) => o.postAt === place && !o.takenBy && board.week < o.expiresWeek).length < FIELD_CAP;
  const own = fieldTarget(offer);
  // the first fill: a character's start without a board (Pallet) gets the first regional card of its region — the players who
  // start there open with a board card too, not only Oak's pair (the first measurement: their openings were the lab's only)
  const start = board.week === 1 && offer.slot === (rulesOf(board).slotsPerStop - rulesOf(board).regional) ? region.find((x) => world.starts.includes(x) && room(x)) : null;
  let place = start ?? (own && region.includes(own) && room(own) ? own : null);
  if (!place) {
    const free = region.filter(room);
    if (!free.length) return;
    place = free[hashIndex(`${board.seed}:${offer.id}:region`, free.length)];
  }
  offer.postAt = place;
  offer.quest = place === own ? { ...offer.quest, claimAt: offer.stop, lk: { ...offer.quest.lk, field: place } } : { ...offer.quest, lk: { ...offer.quest.lk, region: place } };
}

// E2: the one place a card's first stage points to — every objective of it names that place (`place`, or `places` with
// one entry) — and not its own city; else null (no place, several places, or the city itself: it stays on the board).
export function fieldTarget(offer) {
  const objs = offer.quest.stages[0].objectives;
  if (objs.some((o) => !o.place && !o.places)) return null;
  const places = [...new Set(objs.flatMap((o) => (o.place ? [o.place] : o.places)))];
  return places.length === 1 && places[0] !== offer.stop ? places[0] : null;
}
// E2: hang a new card in the field when its place has room (FIELD_CAP open field cards); the client stays in the city.
function placeInField(board, offer) {
  const place = fieldTarget(offer);
  if (!place || board.stops[place]) return; // a city with its own board keeps its own cards: the field is the routes, forests, caves, small towns
  const there = Object.values(board.offers).filter((o) => o.postAt === place && !o.takenBy && board.week < o.expiresWeek).length;
  if (there >= FIELD_CAP) return; // full: it stays on its city board
  offer.postAt = place;
  offer.quest = { ...offer.quest, claimAt: offer.stop, lk: { ...offer.quest.lk, field: place } };
}

const rulesOf = (board) => LK_RULES[board.rules];

// ---- the rotation schedule (pure) -------------------------------------------------------------------

export function isRefreshWeek(board, stop, week) {
  const { refreshEvery } = rulesOf(board);
  const offset = board.stops[stop].offset;
  return week >= offset && (week - offset) % refreshEvery === 0;
}

// The first refresh week of `stop` strictly after `week` (the n-th with `n`).
export function nextRefresh(board, stop, week, n = 1) {
  const { refreshEvery } = rulesOf(board);
  const offset = board.stops[stop].offset;
  const first = week < offset ? offset : offset + (Math.floor((week - offset) / refreshEvery) + 1) * refreshEvery;
  return first + (n - 1) * refreshEvery;
}

// ---- B / C: the special schedule (the Rumours pilot's own formula, folded in) -----------------------

const authoredQuest = (questId) => RUMOUR_QUESTS.v1.find((q) => q.id === questId) ?? EXPEDITIONS.v1.find((q) => q.id === questId) ?? null;

// The weeks every authored opportunity is open — EXACTLY engine/rumourEngine.setupRumours (same hash stream
// `${seed}:rumour:${id}`, same K fresh at a time, same return gap): folding the rumours into the board does
// not move a single week. `posts`: the boards within the rumour's reach (`hear`) of its start place.
export function scheduleSpecials(world, seed, { expeditions = true } = {}) {
  const defs = OPPORTUNITIES.v1.filter((o) => !o.needsRule || (o.needsRule === 'expeditions' && expeditions));
  const fresh = [];
  const out = [];
  for (const def of [...defs].sort((a, b) => a.appearsIn[0] - b.appearsIn[0] || (a.id < b.id ? -1 : 1))) {
    const quest = authoredQuest(def.quest);
    const places = [...new Set([def.start, ...quest.stages.flatMap((st) => st.objectives).map((o) => o.place).filter(Boolean), quest.claimAt])];
    if (!places.every((p) => world.reach.has(p))) continue; // anti-softlock, as the pilot: never scheduled
    let w = def.appearsIn[0] + hashIndex(`${seed}:rumour:${def.id}`, def.appearsIn[1] - def.appearsIn[0] + 1);
    const busy = (t) => fresh.filter((f) => t >= f.from && t < f.to).length;
    while (Array.from({ length: def.openWeeks }, (_, d) => busy(w + d)).some((n) => n >= RUMOURS.fresh)) w += 1;
    fresh.push({ from: w, to: w + def.openWeeks });
    const back = w + def.openWeeks + RUMOURS.returnGap;
    const d = world.distFrom(def.start);
    const posts = world.stops.filter((s) => def.hear === 'anyStop' || (d[s] ?? Infinity) <= def.hear.region);
    const kind = def.needsRule === 'expeditions' ? 'expedition' : 'world';
    out.push({ id: `${kind === 'world' ? 'wo' : 'exp'}:${def.id}`, opp: def.id, kind, quest: def.quest, start: def.start, posts, appears: w, closes: w + def.openWeeks, returns: back, returnCloses: back + def.openWeeks });
  }
  return out;
}

// ---- the board ------------------------------------------------------------------------------------------

export function createBoard(world, { seed, players, week = 1, rules = 'v1', options = {} }) {
  const R = LK_RULES[rules];
  if (!R) throw new Error(`No Living Kanto rules ${rules}`);
  const opts = { rocket: true, expeditions: true, strict: true, ...options };
  const board = {
    v: BOARD_VERSION, rules, gen: GENERATOR, seed: String(seed), week: 0, playerIds: [...players], options: opts,
    stops: Object.fromEntries(world.stops.map((s, i) => [s, { offset: R.firstRefresh + (i % R.refreshEvery), slots: Array(R.slotsPerStop).fill(null) }])),
    offers: {},
    specials: R.authoredSpecials === false ? [] : scheduleSpecials(world, seed, opts),
    records: Object.fromEntries(players.map((p) => [p, { families: {}, stones: 0, takes: {} }])),
    contracts: Object.fromEntries(players.map((p) => [p, []])),
    stats: { posted: 0, taken: 0, expired: 0, claimed: 0, abandoned: 0, rewardValue: 0 },
    news: [],
  };
  advanceTo(board, world, week);
  return board;
}

// Offers anyone could take now (a taken standard / world offer is not live; an expedition stays live).
export function liveOffers(board) {
  return Object.values(board.offers).filter((o) => !o.takenBy && board.week < o.expiresWeek);
}

function note(board, events, e) {
  const entry = { week: board.week, ...e };
  events.push(entry);
  board.news.push(entry);
  const keep = rulesOf(board).newsKeep;
  if (board.news.length > keep) board.news.splice(0, board.news.length - keep);
}

function admit(board, world, offer, events) {
  const problems = validateOffer(world, offer);
  if (problems.length) {
    if (board.options.strict) throw new Error(`Living Kanto generated an impossible offer: ${problems.join('; ')}`);
    note(board, events, { event: 'rejected', id: offer.id, problems });
    return false;
  }
  board.offers[offer.id] = offer;
  board.stats.posted += 1;
  note(board, events, { event: 'posted', id: offer.id, kind: offer.kind, stop: offer.stop ?? null });
  return true;
}

// Advance the board to `week` (a week start, like rocketWeekStart); returns what happened, in order.
export function advanceTo(board, world, week) {
  const events = [];
  for (let w = board.week + 1; w <= week; w++) {
    board.week = w;
    refreshBoards(board, world, w, events);
    runSpecials(board, world, w, events);
  }
  return events;
}

function refreshBoards(board, world, w, events) {
  const R = rulesOf(board);
  // E1 (`ramp`): slot k opens in week k + 1 — between two refreshes only the slot that opens this week is filled
  const opening = R.ramp && w >= 2 && w <= R.slotsPerStop ? w - 1 : -1;
  for (const stop of world.stops) {
    const st = board.stops[stop];
    const refresh = w === 1 || isRefreshWeek(board, stop, w);
    if (!refresh && opening < 0) continue;
    for (let slot = 0; slot < st.slots.length; slot++) {
      if (R.ramp && slot >= w) continue; // E1: not open yet
      if (!refresh && slot !== opening) continue;
      const old = st.slots[slot] && board.offers[st.slots[slot]];
      if (old && !old.takenBy && w < old.expiresWeek) continue; // it stays
      if (old) {
        if (!old.takenBy) {
          board.stats.expired += 1;
          note(board, events, { event: 'expired', id: old.id, stop });
        }
        delete board.offers[old.id]; // a taken stub leaves at the refresh; the taker's contract keeps its copy
      }
      st.slots[slot] = null;
      // the first fill alternates 1 / 2 refreshes of life, so a board never changes all at once
      const life = w === 1 ? 1 + (slot % 2) : R.lifeCycles;
      const offer = generateStandard(world, liveOffers(board), { seed: board.seed, stop, slot, week: w, expiresWeek: nextRefresh(board, stop, w, life), options: { ...board.options, stones: R.stones !== false } });
      if (offer && R.regional && slot >= st.slots.length - R.regional) placeInRegion(board, world, offer); // KANTO WORLD
      else if (offer && R.field) placeInField(board, offer); // E2
      if (offer && admit(board, world, offer, events)) st.slots[slot] = offer.id;
    }
  }
}

function runSpecials(board, world, w, events) {
  const R = rulesOf(board);
  // B / C authored (the rumours' opportunities, the Scyther expedition)
  // Its weeks over, a special card leaves every board — taken or not (a taker's contract keeps its own copy;
  // giving it up after this week returns nothing).
  const close = (o) => {
    delete board.offers[o.id];
    if (o.kind === 'world' && o.takenBy) return;
    if (o.kind === 'world') board.stats.expired += 1;
    note(board, events, { event: 'closed', id: o.id, kind: o.kind });
  };
  for (const sp of board.specials) {
    const live = board.offers[sp.id];
    if ((w === sp.closes || w === sp.returnCloses) && live) close(live);
    if (w !== sp.appears && w !== sp.returns) continue;
    const ret = w === sp.returns;
    const claimedBy = board.playerIds.filter((p) => board.contracts[p].some((c) => c.offer === sp.id && c.status === 'claimed'));
    const heldBy = board.playerIds.filter((p) => board.contracts[p].some((c) => c.offer === sp.id && (c.status === 'active' || c.status === 'done')));
    if (sp.kind === 'world' && ret && (heldBy.length || (claimedBy.length && R.world.returnPolicy === 'never'))) continue;
    const quest = structuredClone(authoredQuest(sp.quest));
    const offer = {
      id: sp.id, kind: sp.kind, source: sp.kind === 'world' ? 'rumour' : 'expedition', authored: true, opp: sp.opp, start: sp.start, posts: [...sp.posts],
      postedWeek: w, expiresWeek: ret ? sp.returnCloses : sp.closes, quest, hints: [sp.start], signature: sp.id, takenBy: null, takenWeek: null,
      ...(sp.kind === 'world' ? { excluded: claimedBy } : { takers: [...heldBy, ...claimedBy] }),
    };
    admit(board, world, offer, events);
  }
  // B generated: one exceptional ★★★ offer every `generatedEvery` weeks
  for (const o of Object.values(board.offers)) if (o.kind === 'world' && o.source === 'generated' && w >= o.expiresWeek) close(o);
  const { generatedFirst, generatedEvery, generatedOpen } = R.world;
  if (w >= generatedFirst && (w - generatedFirst) % generatedEvery === 0) {
    const offer = generateWorldOffer(world, liveOffers(board), { seed: board.seed, week: w, closes: w + generatedOpen, options: { stones: R.stones !== false } });
    if (offer) admit(board, world, offer, events);
  }
}

// ---- taking, finishing, collecting, giving up ---------------------------------------------------------

const held = (board, pid) => board.contracts[pid].filter((c) => c.status === 'active' || c.status === 'done');

// May player `pid` take offer `id` now? { ok } or { ok: false, reason, … } — one legality for the engine
// AND the table (the table shows the reason: „Masz już 2 zlecenia”, „Zabrane przez Misty”…).
//   ctx.location        where the player stands (null = do not check)
//   ctx.bookOrdinary    ordinary quest-book quests the player already holds (outside the board)
//   ctx.bookSpecial     rumour-slot quests the player already holds (outside the board)
//   ctx.unseenCatchable species on land the player has not seen yet (observe offers only)
//   ctx.ordinaryMax / ctx.specialMax  the game's limits (questBookEngine.maxActive / rumourSlotMax — K-07: no limit)
export function canTakeOffer(board, pid, id, ctx = {}) {
  const R = rulesOf(board);
  const no = (reason, extra = {}) => ({ ok: false, reason, ...extra });
  const o = board.offers[id];
  if (!o || board.week >= o.expiresWeek) return no('gone');
  if (o.kind !== 'expedition' && o.takenBy) return no('taken', { by: o.takenBy });
  const posts = o.kind === 'standard' ? [o.postAt ?? o.stop] : [...o.posts, ...(o.start ? [o.start] : [])]; // E2: a field card hangs at its place
  if (ctx.location != null && !posts.includes(ctx.location)) return no('notHere', { posts });
  if (ctx.fromWeek && o.kind !== 'expedition') return no('fromWeek', { week: ctx.fromWeek }); // PLAYTEST_016 PT016-02 'w4': no local offer before week 4
  if (o.kind === 'world' && o.excluded?.includes(pid)) return no('done');
  if (o.kind === 'expedition' && o.takers.includes(pid)) return no('done');
  const mine = held(board, pid);
  if (o.kind === 'standard') {
    const used = mine.filter((c) => c.kind === 'standard').length + (ctx.bookOrdinary ?? 0);
    const max = ctx.ordinaryMax ?? R.maxOrdinary;
    if (used >= max) return no('slotsFull', { used, max });
    const arch = ARCHETYPES_BY_ID[o.archetype];
    const rec = board.records[pid].families[o.family];
    if (rec && rec.completed >= arch.maxPerGame) return no('maxPerGame', { max: arch.maxPerGame });
    if (rec?.lastCompletedWeek != null && board.week < rec.lastCompletedWeek + arch.cooldownWeeks) return no('cooldown', { until: rec.lastCompletedWeek + arch.cooldownWeeks });
    if (o.archetype === 'observe-species' && ctx.unseenCatchable != null && ctx.unseenCatchable < o.params.count + 2) return no('nothingNew');
  } else {
    const used = mine.filter((c) => c.kind !== 'standard').length + (ctx.bookSpecial ?? 0);
    const max = ctx.specialMax ?? R.specialSlots;
    if (used >= max) return no('specialFull', { used, max });
  }
  return { ok: true };
}

export function takeOffer(board, pid, id, ctx = {}) {
  const check = canTakeOffer(board, pid, id, ctx);
  if (!check.ok) throw new Error(`${pid} cannot take ${id}: ${check.reason}`);
  const o = board.offers[id];
  const takes = board.records[pid].takes;
  takes[o.quest.id] = (takes[o.quest.id] ?? 0) + 1;
  const contract = {
    occ: `${o.quest.id}#${takes[o.quest.id]}`, offer: id, kind: o.kind, family: o.family ?? null, archetype: o.archetype ?? null, difficulty: o.difficulty ?? null,
    quest: structuredClone(o.quest), ...(o.quest.lk ? { lk: structuredClone(o.quest.lk) } : {}), ...(o.keyItem ? { keyItem: { ...o.keyItem } } : {}), takenWeek: board.week, status: 'active', completedWeek: null, claimedWeek: null,
  };
  if (o.kind === 'expedition') o.takers.push(pid);
  else {
    o.takenBy = pid;
    o.takenWeek = board.week;
  }
  board.contracts[pid].push(contract);
  board.stats.taken += 1;
  note(board, [], { event: 'taken', id, player: pid });
  return contract;
}

const contractOf = (board, pid, occ) => {
  const c = board.contracts[pid].find((x) => x.occ === occ);
  if (!c) throw new Error(`${pid} has no contract ${occ}`);
  return c;
};

// The quest book says the quest is done (its last stage met): the family's cooldown starts now.
export function completeContract(board, pid, occ) {
  const c = contractOf(board, pid, occ);
  if (c.status !== 'active') throw new Error(`${occ} is ${c.status}`);
  c.status = 'done';
  c.completedWeek = board.week;
  // only STANDARD contracts feed the per-family anti-farm records (a World Opportunity is one of a kind)
  if (c.kind === 'standard' && c.family) {
    const rec = (board.records[pid].families[c.family] ??= { completed: 0, lastCompletedWeek: null });
    rec.completed += 1;
    rec.lastCompletedWeek = board.week;
  }
  return c;
}

// Collect (at a Poké Stop): the reward lines as paid — a stone over the player's cap pays its `otherwise`.
// Idempotent: a claimed contract pays nothing again.
export function claimContract(board, pid, occ) {
  const c = contractOf(board, pid, occ);
  if (c.status === 'claimed') return [];
  if (c.status !== 'done') throw new Error(`${occ} is ${c.status}`);
  const R = rulesOf(board);
  const rec = board.records[pid];
  const paid = c.quest.reward.map((r) => {
    if (STONE_IDS.includes(r.type) && r.otherwise) {
      if (rec.stones >= R.stoneCap) return { ...r.otherwise };
      rec.stones += 1;
    }
    const { otherwise, ...line } = r;
    return line;
  });
  c.status = 'claimed';
  c.claimedWeek = board.week;
  c.paid = paid;
  delete c.quest; // the definition is no longer needed in the save
  board.stats.claimed += 1;
  board.stats.rewardValue += rewardValue(paid.filter((r) => lineValue(r) != null));
  note(board, [], { event: 'claimed', id: c.offer, player: pid });
  return paid;
}

// Give up (at a Poké Stop, as the quest book): a standard offer is gone for good (no reroll by taking and
// giving up); a World Opportunity goes back on its boards while its weeks last; an expedition may be
// taken again by the same player (EREV-02: given up ≠ gone).
export function abandonContract(board, pid, occ) {
  const c = contractOf(board, pid, occ);
  if (c.status !== 'active') throw new Error(`${occ} is ${c.status}`);
  c.status = 'abandoned';
  c.abandonedWeek = board.week;
  delete c.quest;
  board.stats.abandoned += 1;
  const o = board.offers[c.offer];
  if (o && c.kind === 'world' && o.takenBy === pid && board.week < o.expiresWeek) {
    o.takenBy = null;
    o.takenWeek = null;
    note(board, [], { event: 'returned', id: o.id, player: pid });
  }
  if (o && c.kind === 'expedition') o.takers = o.takers.filter((p) => p !== pid);
  return c;
}

// ---- views for the table (read only) ------------------------------------------------------------------

// What player `pid` sees at `stop`: the four cards (open / taken by whom / empty until week N), the special
// cards posted here, and the week the board changes next — „Nowe zlecenia: tydzień 9”.
export function boardView(board, pid, stop, ctx = {}) {
  const st = board.stops[stop];
  const take = (id) => canTakeOffer(board, pid, id, { ...ctx, location: stop });
  // E1 (`ramp`): a slot not open yet fills exactly in the week it opens (slot + 1) — a refresh before that skips it
  const refill = (slot) => (rulesOf(board).ramp && slot >= board.week ? slot + 1 : nextRefresh(board, stop, board.week));
  const opens = st.slots.map((_, slot) => slot).filter((slot) => rulesOf(board).ramp && slot >= board.week).map((slot) => slot + 1);
  return {
    stop, week: board.week, nextRefresh: Math.min(nextRefresh(board, stop, board.week), ...opens),
    cards: st.slots.map((id, slot) => {
      const o = id && board.offers[id];
      if (!o) return { slot, empty: true, refillWeek: refill(slot) };
      return { slot, id, archetype: o.archetype, difficulty: o.difficulty, params: o.params, hints: o.hints, reward: o.quest.reward, expiresWeek: o.expiresWeek, takenBy: o.takenBy, take: take(id) };
    }),
    specials: Object.values(board.offers).filter((o) => o.kind !== 'standard' && o.posts.includes(stop)).map((o) => ({ id: o.id, kind: o.kind, start: o.start ?? null, expiresWeek: o.expiresWeek, takenBy: o.takenBy ?? null, take: take(o.id) })),
  };
}

// The map's view: per board how many offers are open / taken and when it refreshes; every special offer
// with where it points and who holds it — taking something visibly changes the world for everyone.
export function mapMarkers(board) {
  const stops = Object.fromEntries(Object.entries(board.stops).map(([stop, st]) => {
    const offers = st.slots.map((id) => id && board.offers[id]).filter(Boolean);
    return [stop, { open: offers.filter((o) => !o.takenBy).length, taken: offers.filter((o) => o.takenBy).map((o) => o.takenBy), nextRefresh: nextRefresh(board, stop, board.week) }];
  }));
  const specials = Object.values(board.offers).filter((o) => o.kind !== 'standard').map((o) => ({ id: o.id, kind: o.kind, start: o.start ?? o.stop, posts: o.posts, takenBy: o.takenBy ?? null, takers: o.takers ?? null, expiresWeek: o.expiresWeek }));
  return { week: board.week, stops, specials };
}

// ---- save / load ----------------------------------------------------------------------------------------

// The board is plain JSON already; a save stores it as it is. Nothing is regenerated on load: every offer
// and contract carries its full definition, and the generator version (`gen`) decides the next ones.
export const serializeBoard = (board) => JSON.stringify(board);

export function restoreBoard(text) {
  const board = JSON.parse(text);
  const problem = boardProblem(board);
  if (problem) throw new Error(`Living Kanto: ${problem.message}`);
  return board;
}

// Why this board cannot be played by this version — { reason: 'newer' | 'corrupt', message } — or null. A version, rules
// or generator newer than this build knows → 'newer' (never silently migrated, never regenerated); a missing or broken
// shape → 'corrupt'. `playerIds`: the game's players (each must have its contracts and records).
export function boardProblem(board, playerIds = null) {
  const newer = (message) => ({ reason: 'newer', message });
  const corrupt = (message) => ({ reason: 'corrupt', message });
  const isObj = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
  if (!isObj(board)) return corrupt('no board');
  if (!Number.isInteger(board.v)) return corrupt('no board version');
  if (board.v > BOARD_VERSION) return newer(`board v${board.v} (this version knows v${BOARD_VERSION})`);
  if (board.v !== BOARD_VERSION) return corrupt(`board v${board.v} is not supported`);
  if (typeof board.rules !== 'string' || !board.rules) return corrupt('no board rules');
  if (!LK_RULES[board.rules]) return newer(`board rules ${board.rules}`);
  if (typeof board.gen !== 'string' || !board.gen) return corrupt('no board generator');
  if (board.gen !== GENERATOR) return newer(`board generator ${board.gen}`);
  if (!Number.isInteger(board.week) || board.week < 0) return corrupt('bad board week');
  if (!isObj(board.stops) || !Object.values(board.stops).every((st) => isObj(st) && Number.isInteger(st.offset) && Array.isArray(st.slots))) return corrupt('bad boards');
  if (!isObj(board.offers) || !Object.values(board.offers).every((o) => isObj(o) && typeof o.id === 'string' && isObj(o.quest) && Array.isArray(o.quest.stages))) return corrupt('bad offers');
  if (!Array.isArray(board.specials) || !Array.isArray(board.playerIds) || !isObj(board.records) || !isObj(board.contracts)) return corrupt('bad board records');
  const ids = playerIds ?? board.playerIds;
  if (playerIds && (board.playerIds.length !== playerIds.length || !playerIds.every((id) => board.playerIds.includes(id)))) return corrupt('the board\'s players are not the game\'s');
  if (!ids.every((id) => Array.isArray(board.contracts[id]) && isObj(board.records[id]))) return corrupt('a player\'s board records are missing');
  return null;
}
