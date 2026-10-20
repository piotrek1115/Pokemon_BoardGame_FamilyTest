// AI opponent: transparent heuristic scoring over getLegalActions(). No LLM.
// Every candidate gets a list of reasons (+/- contributions); the best score
// wins and the reasons are written to the log via dispatch(meta.ai).
// Archetypes (balanced / collector / aggressive / explorer) are weight sets in
// CONFIG.ai.archetypes. Ties are broken with a stateless hash so AI decisions
// never consume the game RNG.
import { POKEMON, attackTypeOf, getSpecies, isWild } from '../data/pokemon.js';
import { LOCAL_POOLS } from '../data/pools.js';
import { placeFatigue, usesFatigue } from './fatigueEngine.js';
import { isLocationEnabled, locationBiomes, topologyLocations } from '../data/locations.js';
import { EVENTS_BY_ID } from '../data/events.js';
import { hashIndex } from './rng.js';
import { currentPlayer, getLead } from './gameState.js';
import { getLegalActions, restHeal } from './turnEngine.js';
import { catchChanceWithRetries, escapeColour, throwChance, vigilanceSteps } from './captureEngine.js';
import { currentOpponent, freeBattleHealing, typeModifier } from './combatEngine.js';
import { canTraverse, networkNeighbors } from './travelEngine.js';
import { hasPokeStop, price, sellPrice, shopStock } from './pokeStopEngine.js';
import { ballCount, healingItems, itemCount } from './itemEngine.js';
import { evolutionTarget, starCost } from './evolutionEngine.js';
import { QUESTS_BY_ID } from '../data/quests.js';
import { CHARACTERS_BY_ID } from '../data/characters.js';
import { ITEMS } from '../data/items.js';
import { statusOf } from './combatMoves.js';
import { awardAmount, growthEdge, growthEdges } from './growthEngine.js';
import { placeMatches, questDistance, questLocations, speciesMatches } from './questEngine.js';
import { travelDistances } from './travelEngine.js';
import { questBlocks, worldBlocks } from './graphEngine.js';
import { LEAGUE, gymsOf } from '../data/gyms.js';
import { chainOpponents, gymHere, gymRow, gymTier, gymUnlock, gymsEnabled, hasBadge, leagueBadges, leagueStageTeam, leagueStartStage, placeClosedNow, rowPower, usesGymChain, usesLeagueChallenge } from './gymEngine.js';
import { activePlot, catchBlocked, challengeLocations, exploreFindsRocket, lootValue, plotCard, plotRewardValue, rocketTeam } from './rocketEngine.js';
import { jobSpec, kitPlace, needsKit, researchReward, usesResearch } from './oakEngine.js';
import { canUseBox } from './boxEngine.js';
import { localPool, placeSpecies } from './localPoolEngine.js';
import { bookQuest, findOcc, isDone, maxActive, objectiveProgress, objectiveTarget, openChallenge, takeBlock, usesQuestBook } from './questBookEngine.js';
import { pokeStopPlaces } from '../data/pokeStops.js';
import { FISHING } from '../data/fishing.js';
import { fishingWaters, hasRod, usesFishing } from './fishingEngine.js';
import { huntDef, huntOpenFor } from './huntEngine.js';

export function chooseAction(state) {
  // Living Kanto 2.0 (rules.livingKanto 'v1', a pilot): the AI ignores the offer boards — a take action exists only in
  // such a game, so every other game's AI sees exactly the same list as before (AI v2e frozen; no new heuristic)
  const legal = getLegalActions(state).filter((a) => a.type !== 'takeOffer');
  if (!legal.length) return null;
  const player = currentPlayer(state);
  const cfg = state.config;
  const weights = cfg.ai.archetypes[player.aiArchetype] ?? cfg.ai.archetypes[cfg.ai.defaultArchetype];

  const scored = legal.map((action) => {
    const reasons = scoreAction(state, player, action, weights).filter((r) => r.value !== 0);
    const score = reasons.reduce((sum, r) => sum + r.value, 0);
    return { action, reasons, score };
  });
  // AI v2d (boxFirst): a free swap that makes the team better is made before anything else
  const free = v2dPart(cfg, 'boxFirst') ? scored.filter((s) => s.action.type === 'boxIn' && s.score > 0) : [];
  const pool = free.length ? free : scored;
  const best = Math.max(...pool.map((s) => s.score));
  const top = pool.filter((s) => Math.abs(s.score - best) < 1e-9);
  const chosen = top.length > 1 ? top[hashIndex(`${state.seed}:${state.history.length}`, top.length)] : top[0];

  return {
    action: chosen.action,
    ai: {
      archetype: player.aiArchetype,
      score: chosen.score,
      reasons: chosen.reasons,
      ...(top.length > 1 ? { tiebreak: top.length } : {}),
    },
  };
}

function r(label, value) {
  return { label, value };
}

function uncaughtShare(player, biome) {
  const pool = POKEMON.filter((p) => isWild(p) && p.biomes.includes(biome));
  if (!pool.length) return 0;
  return pool.filter((p) => !player.pokedex.caught.includes(p.id)).length / pool.length;
}

// Macro 01 (rules.explorePools 'v2'): a mixed place's pool is every biome's species, each once.
function uncaughtShareMixed(player, biomes) {
  const pool = POKEMON.filter((p) => isWild(p) && p.biomes.some((b) => biomes.includes(b)));
  if (!pool.length) return 0;
  return pool.filter((p) => !player.pokedex.caught.includes(p.id)).length / pool.length;
}

// Macro 02 M02-1 (rules.localPools 'v2'): a place with its own pool — the same
// share over that pool's species (no new weights).
function uncaughtSharePlace(player, place, config) {
  const pool = placeSpecies(place, config);
  if (!pool.length) return 0;
  return pool.filter((p) => !player.pokedex.caught.includes(p.id)).length / pool.length;
}

function hpFraction(p) {
  return p ? p.hp / p.maxHp : 0;
}

function totalBalls(player) {
  return ballCount(player);
}

// Steps to the nearest Poké Stop over edges this player can travel.
function distanceToPokeStop(player, from, config, blocks) {
  const dist = { [from]: 0 };
  const queue = [from];
  while (queue.length) {
    const at = queue.shift();
    if (hasPokeStop(at, config)) return dist[at];
    for (const to of networkNeighbors(at, config)) { // the game's travel network (3A-5)
      if (dist[to] === undefined && canTraverse(player, at, to, config, blocks)) {
        dist[to] = dist[at] + 1;
        queue.push(to);
      }
    }
  }
  return Infinity;
}

// Poké Stops are a few far-apart hubs with a full heal (DQ-33/34): the pull home
// grows with damage the bag can't fix. A fully fainted team without a Revive
// outranks every mission pull (missions pull at most 5 per step).
function pokeStopNeed(player, config) {
  const fainted = player.team.filter((p) => p.hp === 0).length;
  const missing = player.team.reduce((sum, p) => sum + p.maxHp - p.hp, 0);
  const max = player.team.reduce((sum, p) => sum + p.maxHp, 0);
  const revives = itemCount(player, 'revive');
  const potions = itemCount(player, 'potion');
  let heal;
  if (fainted === player.team.length) heal = revives ? 1 : 8; // with a Revive, revive first (free)
  else {
    const unfixedFainted = Math.max(0, fainted - revives);
    heal = (missing / max) * 4 + unfixedFainted * 1.5;
    if (potions >= 2) heal *= 0.6; // potions can patch the team in the field
  }
  const canBuy = player.money >= price('pokeball', config);
  const shop = canBuy && totalBalls(player) === 0 ? 3 : canBuy && totalBalls(player) <= 1 ? 1.5 : 0;
  // AI v2e (noFutileCatch): no Ball and no money for one — Oak's emergency kit waits at a Poké Stop (once a game)
  const kit = !canBuy && totalBalls(player) === 0 && config.rules.oakKit && !player.oakKitUsed && v2ePart(config, 'noFutileCatch') ? 3 : 0;
  return heal + shop + kit + (stoneWanted(player, config) ? 2 : 0);
}

// Growth games: an Evolution Stone a READY team Pokémon is waiting for, that the
// player can afford and doesn't have yet (Poké Stops sell them, DQ-78).
function stoneWanted(player, config) {
  if (config.rules.evolution !== 'growth') return null;
  if (usesAiPlanC(config)) return stoneNeeds(player, config).find((n) => n.ready && n.items.some((id) => player.money >= price(id, config)))?.items.find((id) => player.money >= price(id, config)) ?? null;
  for (const p of player.team) {
    const edge = growthEdge(p, config.rules);
    if (edge?.item && (p.growth ?? 0) >= edge.growth && itemCount(player, edge.item) === 0 && player.money >= price(edge.item, config)) return edge.item;
  }
  return null;
}

// Growth games: the starter's evolution line is the one the player cares about most.
function isStarterLine(player, pokemon) {
  const starter = CHARACTERS_BY_ID[player.id]?.starter;
  return Boolean(starter) && getSpecies(starter).family === getSpecies(pokemon.species).family;
}

function stoneReasons(player, id, rules, config = null) {
  // AI v2c: every branch counts (Eevee: any of its three stones); one stone per Pokémon that needs one
  if (config && usesAiPlanC(config)) {
    const needs = stoneNeeds(player, config).filter((n) => n.items.includes(id));
    if (!needs.length) return [r(`no team Pokémon needs a ${ITEMS[id].name} (AI v2c)`, -2)];
    const best = needs.reduce((a, b) => (a.left <= b.left ? a : b));
    return [r(`${ITEMS[id].name} for ${getSpecies(best.mon.species).name}: ${best.left ? `${best.left} Growth to go` : 'ready to evolve'} (AI v2c)`, best.left <= 0 ? 4 : best.left === 1 ? 2.5 : best.left === 2 ? 1 : -0.5)];
  }
  const needers = player.team.filter((p) => growthEdge(p, rules)?.item === id);
  if (!needers.length) return [r(`no team Pokémon needs a ${ITEMS[id].name}`, -2)];
  if (itemCount(player, id) >= needers.length) return [r(`already carrying a ${ITEMS[id].name}`, -2)];
  const left = Math.min(...needers.map((p) => growthEdge(p, rules).growth - (p.growth ?? 0)));
  return [r(`${ITEMS[id].name}: ${left ? `${left} Growth to go` : 'ready to evolve'}`, left <= 0 ? 4 : left === 1 ? 2.5 : left === 2 ? 1 : -0.5)];
}

export function scoreAction(state, player, action, w) {
  const lead = getLead(player);
  switch (action.type) {
    case 'move': {
      const toBiomes = locationBiomes(action.to, state.config); // the game's board topology (DQ-96)
      const here = player.exploreCounts[player.location] ?? 0;
      const newSpecies = localPool(action.to, state.config) ? uncaughtSharePlace(player, action.to, state.config) : Math.max(0, ...toBiomes.map((b) => uncaughtShare(player, b)));
      // EREV-03: with the League open and the team ready for it, the League leads — side goals
      // (missions, quests, Team Rocket, hunts) pull at half strength. Pulling with equal force
      // in opposite directions held the AI between two places for dozens of weeks.
      const league = towardLeague(state, player, action.to);
      const side = league.value ? 0.5 : 1;
      const halfV1 = (list) => (side === 1 ? list : list.map((x) => (x.value ? r(`${x.label} ×½ (the League first)`, x.value * side) : x)));
      // AI v2c — the main goal first: with a gym the team is ready for (or the League leading), a side goal (a mission,
      // a book quest, Team Rocket, a hunt, the sailor, a stone shop) that pulls AGAINST it on this move counts nothing,
      // one on the way counts half. Opposite equal pulls held players between two places for hundreds of weeks (seen:
      // Viridian ↔ Route 2 for 1000 weeks — the gym +5, the mission „Road to the League” −5); with the gym in this city,
      // no side goal pulls it away (seen: Celadon ↔ Route 7 for 14 000 weeks instead of healing and challenging).
      const gymPull = towardGym(state, player, action.to);
      const main = league.value + gymPull.value;
      const gymT = usesAiPlanC(state.config) ? gymTarget(state, player) : null;
      const mainHere = gymT?.d === 0; // the gym it is ready for is in this city: leaving it is against the main goal
      const mainOn = usesAiPlanC(state.config) && (league.value !== 0 || Boolean(gymT));
      const half = (list) => (!mainOn ? halfV1(list) : list.map((x) => (!x.value ? x : mainHere || (main !== 0 && Math.sign(x.value) !== Math.sign(main)) ? r(`${x.label} — against the main goal, later (AI v2c)`, 0) : r(`${x.label} ×½ (the main goal first)`, x.value * 0.5))));
      return [
        r('base move', 1 * w.move),
        r('unvisited location', player.visited.includes(action.to) ? 0 : 3 * w.novelty),
        r('uncaught species there', 1.5 * newSpecies * w.novelty),
        r(`explored here ${here}×`, here >= 2 ? 1 * w.move : 0),
        r('backtracking', action.to === player.previousLocation ? -2 : 0),
        r('nothing to explore there', toBiomes.length ? 0 : -1),
        towardPokeStop(state, player, action.to),
        ...half(towardQuests(state, player, action.to, w)),
        ...half([towardRocket(state, player, action.to)]),
        ...enteringPlot(state, player, action.to, w),
        gymPull,
        league,
        ...towardOak(state, player, action.to),
        ...half(towardBook(state, player, action.to)),
        ...half(towardHunt(state, player, action.to)),
        ...(v2dPart(state.config, 'sailorOnTheWay') ? sailorOnTheWay(towardSailor(state, player, action.to), { league: league.value !== 0, here: mainHere, gym: Boolean(gymT), main: gymPull.value }) : half(towardSailor(state, player, action.to))),
        ...half(towardStone(state, player, action.to)),
      ];
    }
    case 'visitPokeStop': {
      // Full heal of the active team (fainted included).
      const missing = player.team.reduce((sum, p) => sum + p.maxHp - p.hp, 0);
      const fainted = player.team.filter((p) => p.hp === 0).length;
      const canBuy = player.money >= price('pokeball', state.config);
      const balls = totalBalls(player);
      const poisoned = player.team.filter((p) => p.status?.id === 'poison').length; // COMBAT 2.1: Leczenie cures it
      return [
        r(`full heal (+${missing} HP)`, missing * w.rest),
        r(`revives ${fainted}`, fainted * 2 * w.rest),
        r(`cures ${poisoned} poisoned`, poisoned * 2 * w.rest),
        r('restock Poké Balls', canBuy ? (balls === 0 ? 7 : balls <= 1 ? 3 : balls <= 3 ? 1 : 0) * w.catch : 0),
        r('buy an Evolution Stone', stoneWanted(player, state.config) ? 4 : 0),
        ...activeQuests(player)
          .filter(({ instance, quest }) => quest.kind === 'visitPokeStops' && !instance.visited.includes(player.location))
          .map(({ quest }) => r(`mission "${quest.title}"`, 2)),
      ];
    }
    // Gameplay P1 (rules.pokeStop 'v2'): healing and shopping are separate actions.
    case 'pokeStopHeal': {
      const missing = player.team.reduce((sum, p) => sum + p.maxHp - p.hp, 0);
      const fainted = player.team.filter((p) => p.hp === 0).length;
      // EREV-03: the gym the AI came for is here — heal, then challenge (it used to walk off
      // to a mission and come back, week after week)
      const here = gymTarget(state, player)?.d === 0 ? gymHere(state, player) : null;
      const forGym = Boolean(here) && missing >= 1 && (missing >= 2 || gymReadiness(state, player, here) < gymBarFor(state, player, here));
      return [
        r(`full heal (+${missing} HP)`, missing * w.rest),
        r(`revives ${fainted}`, fainted * 2 * w.rest),
        r('heal for the gym here', forGym ? state.config.ai.gym.challenge / 2 : 0),
        ...pokeStopMissionReasons(player),
      ];
    }
    case 'pokeStopShop': {
      const canBuy = player.money >= price('pokeball', state.config);
      const balls = totalBalls(player);
      const restock = canBuy ? (balls === 0 ? 7 : balls <= 1 ? 3 : balls <= 3 ? 1 : 0) * w.catch : 0;
      // The field kit (2 Potions / Super Potions + a Revive) is bought here now — no
      // heal-and-shop in one action any more (DQ-89).
      const kit = itemCount(player, 'potion') + itemCount(player, 'superpotion');
      const medicine = player.money >= price('potion', state.config) ? (kit === 0 ? 2 : kit === 1 ? 1.2 : 0) * w.rest : 0;
      const revive = player.money >= price('revive', state.config) + 2 && itemCount(player, 'revive') === 0 ? 0.8 * w.rest : 0;
      // EREV-03: only what THIS shop sells (regional stock, E2) and what the AI would really
      // buy once inside — entering, buying nothing and leaving cost an action again and again
      const stock = shopStock(state, player.location);
      const wanted = stoneWanted(player, state.config);
      const stone = wanted && stock.includes(wanted) ? 4 : 0;
      const wouldBuy = stock.some((id) => player.money >= price(id, state.config) && scoreAction(state, player, { type: 'buy', item: id }, w).reduce((sum, x) => sum + x.value, 0) > 1);
      const buying = wouldBuy ? 1 : 0;
      const surplus = state.config.rules.selling && Object.keys(ITEMS).some((id) => sellValue(state, player, id) > 1) ? 1 : 0;
      const missions = pokeStopMissionReasons(player);
      const worth = (restock + medicine + revive) * buying + stone + surplus + missions.reduce((sum, m) => sum + m.value, 0);
      // PLAYTEST_009 (rules.shopCharge 'transaction'): entering is free — the AI goes in once a turn, never in and out again
      if (state.config.rules.shopCharge === 'transaction' && (state.turn.shopVisits ?? 0) > 0) return [r('already looked in the shop this turn', -20)];
      return [
        r('restock Poké Balls', restock * buying),
        r(`${kit} Potions in the bag`, medicine * buying),
        r('no Revive in the bag', revive * buying),
        r('buy an Evolution Stone', stone),
        r('something to sell', surplus),
        ...missions,
        r('nothing worth an action', worth ? 0 : -1),
      ];
    }
    case 'sell':
      return [r(`sell a ${ITEMS[action.item].name} for ${sellPrice(action.item, state.config)}`, sellValue(state, player, action.item))];
    case 'boxKeep': {
      // Gameplay P1 (rules.oakBox): the catch joins the team when it beats who would leave.
      const caught = player.reserve.find((p) => p.uid === state.boxChoice.uid);
      const out = player.team.find((p) => p.uid === action.target);
      if (usesAiPlanC(state.config)) {
        // AI v2c: the whole team's value with the newcomer instead of `out` (duplicates counted) — the starter's line stays
        const gain = teamValue([...player.team.filter((t) => t !== out), caught]) - teamValue(player.team);
        return [r(`the team with ${getSpecies(caught.species).name} instead of ${getSpecies(out.species).name}: ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} (AI v2c)`, gain * 0.5 - 1), r('starter line stays', isStarterLine(player, out) ? -5 : 0), ...sailorSwapReasons(state, player, caught, out)];
      }
      return [...boxSwapReasons(player, caught, out), ...sailorSwapReasons(state, player, caught, out)];
    }
    case 'boxSend':
      return [r("keep the team, the catch goes to Oak's Box", 0.5)];
    case 'boxIn': {
      const mon = player.reserve.find((p) => p.uid === action.target);
      if (usesAiPlanC(state.config)) return boxInReasonsC(state, player, action);
      if (!action.swap) return [r('a free place in the team', mon.hp > 0 ? 2 : -1), ...sailorSwapReasons(state, player, mon, null)];
      return [...boxSwapReasons(player, mon, player.team.find((p) => p.uid === action.swap)), ...sailorSwapReasons(state, player, mon, player.team.find((p) => p.uid === action.swap))];
    }
    case 'boxOut':
      return [r('the AI keeps its team together', -3)];
    // Macro 01: Professor Oak in Pallet Town.
    case 'oakKit':
      return [r("Professor Oak's emergency kit: a free Poké Ball", 20)];
    case 'oakJob':
      return oakJobReasons(state, player, action.job);
    case 'oakJobPick':
      return oakPickReasons(player, action.target, state);
    case 'oakJobCancel':
      return [r('the AI finishes what it starts', -10)];
    case 'swapQuest': {
      const instance = player.quests.find((q) => q.questId === action.target);
      const quest = QUESTS_BY_ID[action.target];
      const d = questDistance(player, instance, state.config, questBlocks(state));
      if (!Number.isFinite(d)) return [r(`mission "${quest.title}" is unreachable`, 6)];
      const places = questLocations(instance, state.config);
      if (quest.kind === 'catch' && places.length && places.every((id) => placeFatigue(player, id, state.config) >= 2)) return [r(`mission "${quest.title}": its place is exhausted for now`, 4)]; // EREV-03
      if (d >= 7) return [r(`mission "${quest.title}" is ${d} steps away`, 1.5)];
      return [r(`keep mission "${quest.title}"`, -1)];
    }
    case 'evolve': {
      // Evolve before shopping; prefer the lead, then the biggest stat jump.
      const target = player.team.find((p) => p.uid === action.target);
      const from = getSpecies(target.species);
      const to = action.to ? getSpecies(action.to) : evolutionTarget(from); // bonus 14.10: Eevee's chosen form
      return [
        r(`evolve ${from.name} → ${to.name} (free)`, 9),
        r('lead Pokémon', target === lead ? 1.5 : 0),
        r('stat gain', (to.hp - from.hp) * 0.2 + (to.attack - from.attack) * 0.5),
      ];
    }
    case 'buy': {
      const left = player.money - price(action.item, state.config);
      const balls = totalBalls(player);
      switch (action.item) {
        case 'pokeball': return [r(`have ${balls} balls`, (balls < 3 ? 3 : balls < 5 ? 1.2 : 0.2) * w.catch)];
        case 'superball': return [r('spare money for a Super Ball', left >= 4 && balls < 6 ? 1.3 * w.catch : 0)];
        // Build 3.3 E2: one Ultra Ball for a rare one, only with plenty of money left
        case 'ultraball': return [r('an Ultra Ball for a rare Pokémon', left >= 6 && itemCount(player, 'ultraball') === 0 && balls >= 3 ? 1.1 * w.catch : 0)];
        // Poké Stops are far apart (DQ-33): keep a small field kit of 2 Potions + 1 Revive.
        case 'potion': return [r(`carrying ${itemCount(player, 'potion')} Potions`, (itemCount(player, 'potion') === 0 ? 1.25 : itemCount(player, 'potion') === 1 ? 1.1 : 0.2) * w.rest)];
        // Gameplay P1: one Super Potion for the big hits, when there's money to spare.
        case 'superpotion': return [r(`carrying ${itemCount(player, 'superpotion')} Super Potions`, (itemCount(player, 'superpotion') === 0 && itemCount(player, 'potion') >= 1 && left >= 0 ? 1.15 : 0.1) * w.rest)];
        case 'revive': return [r(`carrying ${itemCount(player, 'revive')} Revives`, (itemCount(player, 'revive') === 0 && left >= 1 ? 1.05 : 0.1) * w.rest)];
        // COMBAT 2.1: an Antidote when someone is poisoned or the bag has none; the battle-only cures rarely
        case 'antidote': return [r('poisoned / no Antidote', player.team.some((p) => p.status?.id === 'poison') && itemCount(player, 'antidote') === 0 ? 3 : itemCount(player, 'antidote') === 0 && left >= 2 ? 1.3 : 0.1)];
        case 'burnheal': case 'paralyzeheal': case 'awakening': return [r('a battle cure', 0.15)];
        case 'fullheal': return [r('a Full Heal', itemCount(player, 'fullheal') === 0 && left >= 6 ? 1.02 * w.rest : 0.1)];
        default: return ITEMS[action.item]?.kind === 'evolution' ? stoneReasons(player, action.item, state.config.rules, state.config) : [];
      }
    }
    case 'assignGrowth': {
      // Growth games: closest to evolving first, then the starter's line, then the stronger next form.
      const mon = player.team.find((p) => p.uid === action.target);
      const edge = growthEdge(mon, state.config.rules);
      const left = edge.growth - (mon.growth ?? 0);
      const to = getSpecies(edge.to);
      if (state.config.rules.exp && state.growthChoice?.awards[0]) {
        // Build 3.3 E1: the award is worth more to a weaker receiver (class difference)
        const amount = Math.min(left, awardAmount(state.config.rules, mon, state.growthChoice.awards[0]));
        return [
          r(`+${amount} EXP (${left} to evolving)`, amount * 1.5 + (amount >= left ? 3 : 0)),
          r('starter line', isStarterLine(player, mon) ? 1.5 : 0),
          r(`next form ${to.name}`, (to.hp + 2 * to.attack) * 0.1),
        ];
      }
      return [
        r(`${left} Growth from evolving`, 4 / left),
        r('starter line', isStarterLine(player, mon) ? 1.5 : 0),
        r(`next form ${to.name}`, (to.hp + 2 * to.attack) * 0.1),
      ];
    }
    case 'leaveShop':
      return [r('done shopping', 1)];
    // Build 3.3 E3: the quest book — take a quest when a slot is free, collect at once, never give up
    case 'takeQuest':
      // NIGHTSHIFT C (rules.epicQuests 'v1'): an epic line is for the family — the AI plans no new line (AI v2e frozen)
      if (bookQuest(action.quest).epic) return [r('an epic quest line: the AI leaves it to the family (NIGHTSHIFT C)', -20)];
      if (bookQuest(action.quest).pack) {
        if (!usesAiPlan(state.config)) return [r('a day-14 pack quest: the AI does not plan its steps (show / give / observe / evolve)', -20)]; // One Kanto day 14.10
        // SYS-01 AI v2: one it can finish with the steps it knows, taken before moving on (it is free) — but only while
        // a slot stays free for an ordinary book quest (those carry the story; quest book maxActive)
        const block = packPlanBlock(state, player, bookQuest(action.quest));
        if (block) return [r(`a pack quest it cannot finish now: ${block}`, -20)];
        const slotsLeft = maxActive(state.config) - player.questBook.active.length - 1;
        // AI v2b: a pack quest whose steps are all in hand now (show / give ready) may take the last slot — it ends soon
        const readyNow = usesAiPlanB(state.config) && bookQuest(action.quest).stages[0].objectives.every((o) => o.kind === 'show' || o.kind === 'give');
        if (slotsLeft < 1 && readyNow) return [r(`take the pack quest ${action.quest}: its steps are in hand (AI v2b — the last slot, it ends soon)`, 11)];
        return [slotsLeft >= 1 ? r(`take the pack quest ${action.quest} (AI v2, free — before moving on; a slot stays free)`, 11) : r('a pack quest would take the last slot of the book quests', -2)];
      }
      // AI v2e (bookSlot): the last slot of the book stays for a quest whose steps are in hand (the sailor's show)
      if (v2ePart(state.config, 'bookSlot') && maxActive(state.config) - player.questBook.active.length - 1 < 1) return [r(`take the quest ${action.quest}: it would fill the last book slot — kept for a quest whose steps are in hand (AI v2e)`, -2)];
      return [r(`take the quest ${action.quest} (free)`, bookQuest(action.quest).giver === 'oak' ? 7 : 6.5)]; // free: before moving on
    case 'claimQuest':
      return [r(`collect the quest reward ${action.occ}`, 10)];
    case 'abandonQuest': {
      // SYS-01 AI v2: a pack quest whose open step it can no longer finish (the team lost the types, the items are
      // gone) frees its slot; every other quest — never
      const a = usesAiPlan(state.config) ? findOcc(player, action.occ) : null;
      if (a && bookQuest(a.questId).pack && !isDone(a) && packPlanBlock(state, player, bookQuest(a.questId), a)) return [r(`give up the pack quest ${a.occ} (free — before moving on): ${packPlanBlock(state, player, bookQuest(a.questId), a)}`, 11)];
      return [r('never give up a quest', -5)];
    }
    case 'questChallenge': {
      const a = findOcc(player, action.occ); // E5: a trial's challenge too
      const ratio = challengeRatio(state, player, openChallenge(state, player, a).spec);
      return [r(`quest challenge (team ${Math.round(ratio * 100)}% of it)`, ratio >= state.config.ai.gym.readyRatio ? 4 : -(1 + (state.config.ai.gym.readyRatio - ratio) * 10) * w.caution)];
    }
    case 'questEncounter':
      // AI v2e (noFutileCatch): the expedition's encounter ends only with a catch — no Ball, no encounter (it would run)
      if (v2ePart(state.config, 'noFutileCatch') && noCatchNow(state, player)) return [r('the expedition encounter is here — but only a catch finishes it, no Ball now (AI v2e)', -3)];
      return [r('the expedition encounter is here (PLAYTEST_006 C4)', 5)];
    case 'challengeRocket':
      return rocketBattleReasons(state, player, w);
    case 'challengeGym':
      return gymChallengeReasons(state, player, w);
    case 'challengeLeague':
      return leagueChallengeReasons(state, player, w);
    case 'continueLeague':
      // Items and lead changes first (they score higher when useful), then Lance.
      return [r('face Champion Lance', 0.5)];
    case 'continueChallenge':
      // Build 3.3 B33-3: items and lead first (they score higher when useful), then the next battle
      return [r('the next battle of the challenge', 0.5)];
    case 'quitChallenge':
      // the AI does not give up an attempt it can still fight
      return [r('leave the challenge (it starts over next time)', -4)];
    case 'giveLoot':
      // Hand Meowth the cheapest item; it comes back when anyone beats Rocket.
      return [r(`give up ${action.item} (worth ${price(action.item, state.config)})`, -price(action.item, state.config))];
    case 'useItem': {
      if (state.phase === 'encounter') return battleItemReasons(state, player, action, w);
      const target = player.team.find((p) => p.uid === action.target);
      if (ITEMS[action.item]?.kind === 'cure') {
        // COMBAT 2.1: poison on the map costs a heart every turn — cure it (free), the sooner the lower the HP; a Full
        // Heal only when there is no Antidote
        const spare = action.item === 'fullheal' && itemCount(player, 'antidote') > 0;
        return [r('cure the poison (free action)', (target.hp <= 2 ? 6 : 3) * w.rest), r('keep the Full Heal', spare ? -4 : 0)];
      }
      if (action.item === 'revive') {
        const allDown = player.team.every((p) => p.hp === 0);
        return [r('revive fainted', 3 * w.rest), r(allDown ? 'whole team fainted' : 'free action', allDown ? 12 : 2)];
      }
      const heal = state.config.items[action.item].heal;
      const missing = Math.min(heal, target.maxHp - target.hp);
      const reasons = [r(`heals ${missing}`, missing * w.rest), r('badly hurt, free action', hpFraction(target) <= 0.5 ? 5 : 0), ...keptForQuest(state, player, action.item, 6)];
      // Gameplay P1: don't spend a Super Potion where a Potion does.
      if (action.item === 'superpotion') reasons.push(r(`wastes ${heal - missing}`, -(heal - missing) * 0.6));
      return reasons;
    }
    case 'explore': {
      // Build 3.3 E4: the hunt's place — a sure meeting with a clue, a 1-in-6 chance without
      if (huntHere(state, player)) return [r('the rare hunt is here', player.clues.includes(state.hunts.active.id) && !player.huntsMet.includes(state.hunts.active.id) ? 9 : 2.5 * w.catch)];
      const here = player.exploreCounts[player.location] ?? 0;
      // Macro 01: no biome = the whole mixed place.
      const mixed = action.biome === undefined ? locationBiomes(player.location, state.config) : null;
      // Exploring here only finds Team Rocket: it's a challenge in disguise.
      if (exploreFindsRocket(state, player)) return [...rocketBattleReasons(state, player, w), ...exploreQuestReasons(state, player, action.biome, w, mixed)];
      const futile = v2ePart(state.config, 'noFutileCatch') && noCatchNow(state, player);
      // AI v2e: no Ball but one within reach (the money for it, the kit) — catching waits for it; no way to a Ball at all —
      // exploring stays worth it (its trainers and events are the way back to money; seen: SOAK-1-151, a one-Pokémon
      // team wandering 300 weeks without exploring once the catch reasons were gone)
      const broke = futile && !ballWithinReach(state, player);
      const noCatch = catchBlocked(state, player) || (futile && !broke) ? 0 : 1;
      return [
        r('base explore', 2 * w.explore),
        r(futile ? (broke ? 'uncaught in biome (no Ball and no money: its trainers and events lead back to one, AI v2e)' : 'uncaught in biome (no Ball — first fetch one, AI v2e)') : 'uncaught in biome', 3 * (localPool(player.location, state.config) ? uncaughtSharePlace(player, player.location, state.config) : mixed ? uncaughtShareMixed(player, mixed) : uncaughtShare(player, action.biome)) * w.explore * noCatch),
        r('not explored here yet', here === 0 ? 2 * w.explore : 0),
        r('new place: explore it before moving on', here === 0 ? w.exploreNewPlace ?? 0 : 0),
        // EREV-03: in a fatigue game the place recovers week by week (M02-2) — judge it by today's
        // fatigue (as the rule does), not by every Explore ever made here (that pinned the AI for good)
        ...(usesFatigue(state.config)
          ? [r(`explored here ${here}×`, -Math.min(3, 0.3 * here)), r(['', 'tired here', 'exhausted here'][placeFatigue(player, player.location, state.config)] || 'fresh here', -3 * placeFatigue(player, player.location, state.config))]
          : [r(`explored here ${here}×`, -1 * here)]),
        // Gameplay P1 (rules.vigilance): the Pokémon here are wary after our catches.
        r('wary Pokémon here', -vigilanceSteps(state, player) * 1.5 * w.catch),
        r('lead hurt', lead.hp < lead.maxHp ? -(1 - hpFraction(lead)) * 6 * w.caution : 0),
        r('no Poké Balls', totalBalls(player) === 0 ? -1 * w.catch : 0),
        ...(futile ? noBallFirst(exploreQuestReasons(state, player, action.biome, w, mixed), /target lives here/) : exploreQuestReasons(state, player, action.biome, w, mixed)),
        ...bookExploreHere(state, player, futile),
        ...(sailorPlaces(state, player).includes(player.location) && totalBalls(player) > 0 ? [r('the sailor wants a water Pokémon from here (AI v2b)', 2 * w.explore)] : []),
      ];
    }
    case 'rest': {
      const target = player.team.find((p) => p.uid === action.target);
      const missing = Math.min(target.maxHp - target.hp, restHeal(state.config));
      return [
        r(`heals ${missing}`, missing * w.rest),
        r('revives fainted', target.hp === 0 ? 2 * w.rest : 0),
        r('lead badly hurt', target === lead && hpFraction(lead) <= 0.5 ? 1 * w.caution : 0),
      ];
    }
    case 'setLead': {
      const target = player.team.find((p) => p.uid === action.target);
      const better = hpFraction(lead) < 0.5 && hpFraction(target) > hpFraction(lead);
      return [r(better ? 'healthier lead' : 'no reason to swap', better ? 1.5 : -1)];
    }
    case 'chooseLead': {
      // DQ-107: like setLead — the AI keeps its lead (DQ-71) unless it is badly
      // hurt and another one is healthier (the healthiest first).
      const target = player.team.find((p) => p.uid === action.target);
      if (target === lead) return [r('keeps its lead', 1)];
      const better = hpFraction(lead) < 0.5 && hpFraction(target) > hpFraction(lead);
      return [r(better ? 'healthier lead' : 'no reason to swap', better ? 1.5 + hpFraction(target) : -1)];
    }
    case 'cancelBattle':
      return [r('the AI finishes what it starts', -10)];
    case 'switchPokemon':
      // DQ-71: the AI keeps its lead for now (simulations stay comparable).
      return [r('AI does not switch in battle yet', -5)];
    case 'endTurn':
      return [r('wastes remaining actions', -0.5 * state.turn.actionsRemaining)];
    // One Kanto day 14.10: trading and friendly duels are for two people at the table — the AI (and a developer
    // table's autoplay) never starts one, backs out of one it finds open, and finishes a duel already fought
    case 'tradeOpen':
    case 'pvpChallenge':
      return [r('trades and duels are for the people at the table', -20)];
    case 'tradeCancel':
    case 'pvpCancel':
      return [r('back out of a trade / duel', 2)];
    case 'pvpAttack':
      return [r('the duel goes on', 1)];
    // bonus 2 (rules.signatureMoves): the line's move when it is ready — the AI's simple rule (spec v1)
    case 'pvpMove':
      return [r('the signature move in a duel', 1.2)];
    case 'signature':
      return [...scoreAction(state, player, { type: 'fight' }, w), r('the signature move (once per battle)', 0.5)];
    case 'fight': {
      const opp = currentOpponent(state.encounter);
      if (state.encounter.kind === 'trainer') return [r('trainer battle', 1 * w.fight)];
      return [
        // Weakening serves both fighters and collectors (an easier Catch Die and Escape Die at low HP).
        r('weaken it', (hpFraction(opp) * 4 + hpFraction(lead) * 2) * Math.max(w.fight, w.catch)),
        r('might knock it out', opp.hp <= 2 ? -2 * w.catch : 0),
      ];
    }
    case 'throwBall': {
      const wild = state.encounter.pokemon;
      const species = getSpecies(wild.species);
      // With retries (DQ-61) a throw is worth more: the chance to catch within
      // the balls in hand, a failed throw possibly leaving another try.
      const p = catchChanceWithRetries(state, wild, action.ball, totalBalls(player));
      const known = player.pokedex.caught.includes(species.id);
      return [
        ...counterRisk(state, player, wild, action.ball, w),
        r(`capture chance ${Math.round(p * 100)}%${state.config.capture.retry === 'harsh' ? '' : ' (with retries)'}`, 10 * p * w.catch * (known ? 0.5 : 1)),
        r('new for Pokédex', known ? 0 : 1 * w.catch),
        r('pricier ball', action.ball === 'superball' ? -0.8 : action.ball === 'ultraball' ? (species.rarity === 'common' ? -3 : -1.2) : 0), // E2: an Ultra Ball for the rare ones
        ...catchQuestBonus(state, player, species.id, w),
        ...(sailorWants(state, player, species.id) ? [r('a water Pokémon for the sailor (AI v2b)', 3 * w.catch)] : []),
      ];
    }
    case 'run':
      if (state.encounter.kind === 'trainer') return retreatReasons(state, player, action, w);
      return [
        r('mission target', catchQuestBonus(state, player, state.encounter.pokemon.species, w).length || sailorWants(state, player, state.encounter.pokemon.species) ? -1.5 : 0),
        r('lead hurt', (1 - hpFraction(lead)) * 5 * w.caution),
        r('lead about to faint', lead?.hp === 1 ? 2 * w.caution : 0),
        r('no Poké Balls', totalBalls(player) === 0 ? 2 : 0),
      ];
    case 'chooseEvent': {
      const choice = EVENTS_BY_ID[state.pendingEvent.id].choices[action.choice];
      return choice.effects.map((e) => r(`${e.type} ${e.amount ?? ''}`.trim(), effectValue(player, lead, e, w)));
    }
    // SYS-01 AI v2: „Łów” with the Old Rod — judged like an Explore: species of these waters not caught yet, the
    // place's fatigue, a hurt lead, no Balls (AI v1 never holds the rod: it never takes the sailor's quest)
    case 'fish': {
      if (!usesAiPlan(state.config)) return [];
      const pool = [...new Set(fishingWaters(player.location, state.config).flatMap((wtr) => FISHING.v1.pools[wtr]?.map((x) => x.species) ?? []))];
      const uncaught = pool.length ? pool.filter((sp) => !player.pokedex.caught.includes(sp)).length / pool.length : 0;
      const noCatch = catchBlocked(state, player) ? 0 : 1;
      return [
        r(usesAiPlanB(state.config) ? 'fish with the Old Rod (AI v2b: like an Explore)' : 'fish with the Old Rod (AI v2)', (usesAiPlanB(state.config) ? 2 : 1.5) * w.explore),
        r('uncaught in these waters', 3 * uncaught * w.explore * noCatch),
        ...(usesFatigue(state.config) ? [r(['', 'tired here', 'exhausted here'][placeFatigue(player, player.location, state.config)] || 'fresh here', -3 * placeFatigue(player, player.location, state.config))] : []),
        r('lead hurt', lead.hp < lead.maxHp ? -(1 - hpFraction(lead)) * 6 * w.caution : 0),
        r('no Poké Balls', totalBalls(player) === 0 ? -1 * w.catch : 0),
      ];
    }
    default:
      return [];
  }
}

// ---- SYS-01 AI v2 (rules.aiPlan 'v2', dev-1610-ai2 — docs/design/AI_V2_CONTRACT.md): the day-14 pack quests -----
// The AI's versions (rules.aiPlan): each later one keeps the earlier ones' behaviour and adds its own (v2 ⊂ v2b ⊂ v2c).
const AI_LEVEL = Object.freeze({ v2: 1, v2b: 2, v2c: 3, v2d: 4, v2e: 5 });
const aiLevel = (config) => AI_LEVEL[config.rules.aiPlan] ?? 0;
const usesAiPlan = (config) => aiLevel(config) >= 1;
// AI v2b (rules.aiPlan 'v2b', dev-1610-ai2b — docs/design/AI_V2B_CONTRACT.md): AI v2 + the sailor's water Pokémon →
// the Old Rod → fishing, and a League bar that learns from lost League Challenges. 'v2' keeps its meaning (its saves).
const usesAiPlanB = (config) => aiLevel(config) >= 2;
// AI v2c (rules.aiPlan 'v2c', dev-1610-ai2c — docs/design/AI_V2C_CONTRACT.md): v2b + Oak's Box (the best team of six,
// duplicates counted), Oak's Research Jobs (Box Pokémon only, the research reward it would really get), evolution
// stones (the way to a shop that sells the one a ready Pokémon needs, keep it, Eevee's three).
const usesAiPlanC = (config) => aiLevel(config) >= 3;
// AI v2d (rules.aiPlan 'v2d', dev-1610-ai2d — docs/design/AI_V2D_CONTRACT.md): v2c + parts, each measured on its own
// against v2c (the same seeds) before they were put together (ChatGPT review 16.10 20:02 §4C). In v2d: boxFirst and
// league70; measured and left OFF: oakTeamOne (0 jobs with it and without — the job loses to a move, not to the Box)
// and sailorOnTheWay (rods within noise — the sailor waits on a full quest book, not on the walk). Always in v2d (P1):
// a team Pokémon goes on a Research Job only by the policy, otherwise the draft is called off.
//   boxFirst        a free Box swap that makes the team better comes before anything that spends the turn (v2c scored
//                   it 11 — a good move scored 13, so the AI walked off from the swap it wanted);
//   league70        the League entry bar starts at 70 % (v2c 60 %: 60–69 % won 0 of 20 attempts, 70–79 % 8 %);
//   oakTeamOne      a Research Job may take ONE weak team Pokémon beside Box ones (never the starter, the lead, the last
//                   healthy ones, one a quest needs, one the main goal needs); every other team pick → the draft is
//                   called off (v2c: Box only — 0 jobs in 160 games);
//   sailorOnTheWay  the sailor's water Pokémon / quest pull counts whole when it is on the way to a gym the team is
//                   ready for, nothing against it, nothing while the League leads or the gym is here (v2c: half / none).
// `config.ai.v2dParts` (never in a game's config — only a measurement sets it) switches a part off for an A/B; a game
// plays V2D_PARTS.
const V2D_PARTS = Object.freeze({ boxFirst: true, league70: true, oakTeamOne: false, sailorOnTheWay: false });
const usesAiPlanD = (config) => aiLevel(config) >= 4;
const v2dPart = (config, part) => usesAiPlanD(config) && (config.ai?.v2dParts?.[part] ?? V2D_PARTS[part]);
// AI v2e (rules.aiPlan 'v2e', dev-1610-ai2e — docs/design/AI_V2E_CONTRACT.md): v2d + parts for the loops found in v2c /
// v2d (ChatGPT review 16.10 21:13 §2), each measured on its own against v2d on the same seeds (SOAK-2-78, SOAK-2-367
// among them) before they are put together; v2d's parts stay (config.ai.v2dParts: league70 off = the 60 % control):
//   noFutileCatch  no Ball (or catching blocked): what only a catch can finish counts nothing — a mission's target here,
//                  „a new trail” for an expedition, the expedition's encounter itself (it ends only with a catch); the
//                  legal way to a Ball pulls instead (the shop with the money for one, Oak's emergency kit at a Poké
//                  Stop without it). Seen: SOAK-2-367, encounter → run → Explore 64× → run in the Safari Zone.
//   gymBarLearns   a gym's bar rises 5 points for every battle lost in THAT gym (up to +30), fading over 24 own map
//                  actions since the last gym challenge — the gym it keeps losing falls out of the targets for a while,
//                  another ready gym or training comes first. Seen: SOAK-2-78, Erika's gym lost week after week.
//   gymCooldown    (the alternative to compare) after a lost battle in a gym: not that gym again until the team changed
//                  (Growth handed out, an evolution, a Pokémon in from the Box / a catch kept / a trade) or 24 own map
//                  actions passed.
//   bookSlot       a book quest never takes the last slot of the quest book — it is kept for one whose steps are in
//                  hand (the sailor's show, as in v2b): full books of quests that stood still held the sailor back.
// `config.ai.v2eParts` (a measurement only) switches a part off for an A/B; a game plays V2E_PARTS.
const V2E_PARTS = Object.freeze({ noFutileCatch: true, gymBarLearns: true, gymCooldown: false, bookSlot: true });
const usesAiPlanE = (config) => aiLevel(config) >= 5;
const v2ePart = (config, part) => usesAiPlanE(config) && (config.ai?.v2eParts?.[part] ?? V2E_PARTS[part]);
const noCatchNow = (state, player) => totalBalls(player) === 0 || catchBlocked(state, player);
// a Ball it can get now: the money for one, or Oak's emergency kit still unused (rules.oakKit)
const ballWithinReach = (state, player) => player.money >= price('pokeball', state.config) || (Boolean(state.config.rules.oakKit) && !player.oakKitUsed);
// The sailor's quest (FISHING.v1.rodFrom): while this player has no rod and can still do it — its show step and how many
// different species of those types the team lacks ({ o, need, active }), else null.
function sailorWant(state, player) {
  if (!usesAiPlanB(state.config) || !usesFishing(state.config) || !player.questBook || hasRod(player)) return null;
  const q = bookQuest(FISHING.v1.rodFrom);
  const o = q?.stages[0].objectives.find((x) => x.kind === 'show');
  if (!o) return null;
  const active = player.questBook.active.find((a) => a.questId === q.id) ?? null;
  if (active && (isDone(active) || objectiveProgress(player, active, o, 0) >= objectiveTarget(o))) return null; // shown: the book's own pull
  const block = active ? null : takeBlock(state, player, q);
  if (block && !['goTo', 'slotFull'].includes(block.code)) return null; // done, given up for good, not open
  return { q, o, active, need: Math.max(0, o.count - showKinds(player, o)) };
}
// A wild species the sailor's step still lacks in the team (its type, a species the team does not have yet).
function sailorWants(state, player, speciesId) {
  const want = sailorWant(state, player);
  if (!want?.need) return false;
  const sp = getSpecies(speciesId);
  return sp.types.some((t) => want.o.types.includes(t)) && !player.team.some((m) => m.species === speciesId);
}
// Places whose own Pokémon include one the sailor still wants (the board's local pools — no other source).
function sailorPlaces(state, player) {
  const want = sailorWant(state, player);
  if (!want?.need) return [];
  return Object.keys(LOCAL_POOLS).filter((id) => placeSpecies(id, state.config).some((sp) => sailorWants(state, player, sp.id)));
}
// Walking: toward such a place while Balls last; with the team ready and the quest not taken, toward where it is taken.
function towardSailor(state, player, to) {
  const want = sailorWant(state, player);
  if (!want) return [];
  let places = [];
  let pull = 0;
  if (want.need > 0 && totalBalls(player) > 0) [places, pull] = [sailorPlaces(state, player), 2];
  // only with a free slot (a full quest book: going there takes nothing — seen: a pull to Cerulean for 50 weeks)
  else if (want.need === 0 && !want.active && [null, 'goTo'].includes(takeBlock(state, player, want.q)?.code ?? null)) [places, pull] = [[want.q.takeAt], 3];
  if (!places.length) return [];
  const blocks = worldBlocks(state);
  const here = travelDistances(player, player.location, state.config, blocks);
  const there = travelDistances(player, to, state.config, blocks);
  const now = Math.min(...places.map((id) => here[id] ?? Infinity));
  const next = Math.min(...places.map((id) => there[id] ?? Infinity));
  if (!Number.isFinite(now) || !Number.isFinite(next)) return [];
  return [r(`toward the sailor's ${want.need ? 'water Pokémon' : 'quest'} (${now} → ${next} away, AI v2b)`, (now - next) * pull)];
}
// AI v2d (sailorOnTheWay): the sailor's pull beside the main goal — none while the League leads or the ready gym is in
// this city; whole when it is on the way to the gym the team is ready for (or there is no main goal); none against it;
// half on a move that neither nears nor leaves the gym.
function sailorOnTheWay(list, { league, here, gym, main }) {
  return list.map((x) => {
    if (!x.value) return x;
    if (league) return r(`${x.label} — the League first, no detours (AI v2d)`, 0);
    if (here) return r(`${x.label} — the gym here first (AI v2d)`, 0);
    if (!gym) return x;
    if (main === 0) return r(`${x.label} ×½ (beside the way to the gym, AI v2d)`, x.value * 0.5);
    return Math.sign(x.value) === Math.sign(main) ? r(`${x.label} — on the way to the gym (AI v2d)`, x.value) : r(`${x.label} — against the way to the gym (AI v2d)`, 0);
  });
}
// ---- AI v2c: evolution stones, Oak's Box, Oak's Research Jobs ---------------------------------------------------
// The team's stone needs: a Pokémon with a stone edge (Eevee: every branch) whose stone the bag lacks, how much Growth it
// still needs (`left`), ready = 0 left. Growth games only.
function stoneNeeds(player, config) {
  if (config.rules.evolution !== 'growth') return [];
  const out = [];
  for (const mon of player.team) {
    const edges = growthEdges(mon, config.rules).filter((e) => e.item);
    if (!edges.length || edges.some((e) => itemCount(player, e.item) > 0)) continue; // no stone edge, or one in the bag
    const left = Math.max(0, Math.min(...edges.map((e) => (e.growth ?? 0) - (mon.growth ?? 0))));
    out.push({ mon, items: [...new Set(edges.map((e) => e.item))], left, ready: left === 0 });
  }
  return out;
}
// Walking: a Pokémon ready (or 1 Growth from it) needs a stone it lacks — toward the nearest Poké Stop whose shop sells
// one, with the money for it (no money, no pull).
function towardStone(state, player, to) {
  if (!usesAiPlanC(state.config)) return [];
  const needs = stoneNeeds(player, state.config).filter((n) => n.left <= 1);
  if (!needs.length) return [];
  const items = [...new Set(needs.flatMap((n) => n.items))].filter((id) => player.money >= price(id, state.config));
  if (!items.length) return [];
  const shops = stoneShops(state, items);
  if (!shops.length) return [];
  const blocks = worldBlocks(state);
  const here = travelDistances(player, player.location, state.config, blocks);
  const there = travelDistances(player, to, state.config, blocks);
  const now = Math.min(...shops.map((id) => here[id] ?? Infinity));
  const next = Math.min(...shops.map((id) => there[id] ?? Infinity));
  if (!Number.isFinite(now) || !Number.isFinite(next)) return [];
  const pull = needs.some((n) => n.ready) ? 3 : 1.5;
  return [r(`toward a shop with the ${items.map((id) => ITEMS[id].name).join(' / ')} (${now} → ${next} away, AI v2c)`, (now - next) * pull)];
}
// The Poké Stops whose shop sells one of `items` (cached per state and step, like bestBoxSwap).
let shopCache = { state: null, len: -1, key: '', value: [] };
function stoneShops(state, items) {
  const key = items.join(',');
  if (shopCache.state === state && shopCache.len === state.history.length && shopCache.key === key) return shopCache.value;
  const value = topologyLocations(state.config).map((l) => l.id).filter((id) => hasPokeStop(id, state.config) && shopStock(state, id).some((x) => items.includes(x)));
  shopCache = { state, len: state.history.length, key, value };
  return value;
}
// A stone a Pokémon of the team or the Box still needs (never sold — AI v2c; Eevee: every branch).
function stoneNeededByAnyone(player, id, config) {
  return [...player.team, ...player.reserve].some((m) => growthEdges(m, config.rules).some((e) => e.item === id));
}

// Oak's Box: the value of a team of six — its power (a fainted one counts a third: the Box never heals), each species
// once (a second of the same −3: variety beats copies), the starter's line and the sailor's water Pokémon protected
// by the swap reasons.
function teamValue(team) {
  const species = new Set();
  let v = 0;
  for (const m of team) {
    v += monPower(m) * (m.hp > 0 ? 1 : 0.33);
    if (species.has(m.species)) v -= 3;
    species.add(m.species);
  }
  return v;
}
// The best one swap Box ↔ team now (Oak's Box place): { inUid, outUid, gain } — null when nothing gains 2 or more.
// One decision scores every legal swap against the same state: computed once per state and history step (a cache that
// only spares work — the same answer every time).
let swapCache = { state: null, len: -1, pid: null, value: null };
function bestBoxSwap(state, player) {
  if (swapCache.state === state && swapCache.len === state.history.length && swapCache.pid === player.id) return swapCache.value;
  const value = computeBestBoxSwap(state, player);
  swapCache = { state, len: state.history.length, pid: player.id, value };
  return value;
}
function computeBestBoxSwap(state, player) {
  if (!canUseBox(state, player) || !player.reserve.length) return null;
  const base = teamValue(player.team);
  const full = player.team.length >= state.config.maxTeamSize;
  let best = null;
  for (const mon of player.reserve) {
    if (mon.hp <= 0) continue;
    const outs = full ? player.team.filter((t) => !isStarterLine(player, t) && !sailorSwapReasons(state, player, mon, t).some((x) => x.value < 0)) : [null];
    for (const out of outs) {
      const gain = teamValue([...player.team.filter((t) => t !== out), mon]) - base;
      if (gain >= 2 && (!best || gain > best.gain)) best = { inUid: mon.uid, outUid: out?.uid ?? null, gain };
    }
  }
  return best;
}
function boxInReasonsC(state, player, action) {
  const best = bestBoxSwap(state, player);
  if (best && best.inUid === action.target && (best.outUid ?? null) === (action.swap ?? null)) return [r(`a better team from Oak's Box (+${best.gain.toFixed(1)}; free — before moving on, AI v2c)`, 11)];
  return [r('not the best swap (AI v2c)', -2)];
}

// Oak's Box: a water Pokémon the sailor still lacks joins the team; one the step needs does not leave it.
function sailorSwapReasons(state, player, incoming, out) {
  const want = sailorWant(state, player);
  if (!want) return [];
  const gain = incoming && sailorWants(state, player, incoming.species) ? [r('a water Pokémon for the sailor (AI v2b)', 4)] : [];
  const kindsOut = out ? new Set(player.team.filter((m) => m !== out && getSpecies(m.species).types.some((t) => want.o.types.includes(t))).map((m) => m.species)).size : Infinity;
  const loss = out && getSpecies(out.species).types.some((t) => want.o.types.includes(t)) && kindsOut < want.o.count ? [r('the sailor needs it in the team (AI v2b)', -6)] : [];
  return [...gain, ...loss];
}
const showKinds = (player, o) => new Set(player.team.filter((m) => getSpecies(m.species).types.some((t) => o.types.includes(t))).map((m) => m.species)).size;
// What keeps the AI from finishing a pack quest's open steps now ('' = nothing). observe / evolve come with play;
// show / give only with the team / the items already in hand; any other step: it does not plan it.
function packPlanBlock(state, player, q, a = null) {
  for (const [i, o] of q.stages[a?.stage ?? 0].objectives.entries()) {
    if (a && objectiveProgress(player, a, o, i) >= objectiveTarget(o)) continue;
    if (o.kind === 'observe' || o.kind === 'evolve') continue;
    if (o.kind === 'show') {
      if (showKinds(player, o) < o.count) return `needs ${o.count} different ${o.types.join(' / ')} Pokémon in the team`;
      continue;
    }
    if (o.kind === 'give') {
      if (itemCount(player, o.item) < o.count) return `needs ${o.count}× ${o.item}`;
      continue;
    }
    return `a ${o.kind} step it does not plan`;
  }
  return '';
}
// An item an open „give” step will hand over: the AI keeps that many (a heal that would go below it is a minus).
function keptForQuest(state, player, item, weight) {
  if (!usesAiPlan(state.config) || !player.questBook) return [];
  let need = 0;
  for (const a of player.questBook.active) {
    if (isDone(a) || !bookQuest(a.questId).pack) continue;
    bookQuest(a.questId).stages[a.stage].objectives.forEach((o, i) => {
      if (o.kind === 'give' && o.item === item && objectiveProgress(player, a, o, i) < objectiveTarget(o)) need += o.count;
    });
  }
  return need && itemCount(player, item) - 1 < need ? [r(`kept for a quest (${need}× ${item})`, -weight)] : [];
}

// ---- missions: explainable bonuses, always smaller than survival needs ----------

function activeQuests(player) {
  return (player.quests ?? []).map((instance) => ({ instance, quest: QUESTS_BY_ID[instance.questId] }));
}

// Where a mission wants the player to go, and how hard it pulls per step.
// Fixed / generated destinations pull hardest; travel counters ("2 different
// Poké Stops", "3 different biomes") pull toward the nearest place that counts.
function questTravelTargets(state, player, instance, quest) {
  const q = state.config.ai.quest;
  const fixed = questLocations(instance, state.config);
  // EREV-03: a catch mission's place this player has exhausted (M02-2) is no target this
  // week — it recovers; until then the mission must not hold the AI there
  if (fixed.length && quest.kind === 'catch') return { targets: fixed.filter((id) => placeFatigue(player, id, state.config) < 2), pull: q.destinationPull };
  if (fixed.length) return { targets: fixed, pull: q.destinationPull };
  if (quest.kind === 'visitPokeStops') {
    return { targets: topologyLocations(state.config).filter((l) => hasPokeStop(l.id, state.config) && !instance.visited.includes(l.id)).map((l) => l.id), pull: q.counterPull };
  }
  if (quest.kind === 'exploreLocations') {
    // Any new place counts; the AI prefers places it has never explored.
    const open = topologyLocations(state.config).filter((l) => isLocationEnabled(l.id, state.config) && l.biomes.length && !instance.places.includes(l.id));
    const fresh = open.filter((l) => !player.exploreCounts[l.id]);
    return { targets: (fresh.length ? fresh : open).map((l) => l.id), pull: q.counterPull };
  }
  return { targets: [], pull: 0 };
}

function towardQuests(state, player, to, w) {
  // AI v2e (noFutileCatch): no Ball — a catch mission does not pull (nor hold it at its place: seen, a 400-week Safari
  // Zone stay with no money, no Ball, the kit used — the mission held it there); another mission may lead
  const noBall = v2ePart(state.config, 'noFutileCatch') && noCatchNow(state, player);
  const waiting = noBall ? activeQuests(player).filter(({ quest }) => quest.kind === 'catch').map(({ quest }) => r(`mission "${quest.title}" — a catch, no Ball now (AI v2e)`, 0)) : [];
  const travel = activeQuests(player)
    .filter(({ quest }) => !(noBall && quest.kind === 'catch'))
    .map(({ instance, quest }) => ({ quest, ...questTravelTargets(state, player, instance, quest) }))
    .filter((t) => t.targets.length);
  if (!travel.length) return waiting;
  const blocks = worldBlocks(state);
  const here = travelDistances(player, player.location, state.config, blocks);
  const there = travelDistances(player, to, state.config, blocks);
  // AI v2b: one mission card at a time — the nearest (then by id). Two pulling in opposite directions cancelled out:
  // seen, a player on Route 2 for 4900 weeks between „Road to the League” (+5) and „Moon stones” (−5). v1 / v2: all pull.
  const nowOf = (targets) => Math.min(...targets.map((t) => here[t] ?? Infinity));
  const focus = usesAiPlanB(state.config) ? travel.filter((t) => Number.isFinite(nowOf(t.targets))).sort((a, b) => nowOf(a.targets) - nowOf(b.targets) || (a.quest.id < b.quest.id ? -1 : 1))[0]?.quest : null;
  return travel.map(({ quest, targets, pull }) => {
    const now = nowOf(targets);
    const next = Math.min(...targets.map((t) => there[t] ?? Infinity));
    if (!Number.isFinite(now) || !Number.isFinite(next)) return r(`mission "${quest.title}"`, 0);
    if (focus && quest !== focus) return r(`mission "${quest.title}" (later — one at a time, AI v2b)`, 0);
    return r(`mission "${quest.title}" (${now} → ${next} away)`, (now - next) * pull);
  }).concat(waiting);
}

function speciesInBiome(biome, target) {
  return POKEMON.some((p) => isWild(p) && p.biomes.includes(biome) && speciesMatches(target, p.id));
}

function exploreQuestReasons(state, player, biome, w, mixed = null) {
  const q = state.config.ai.quest;
  const place = mixed ? { location: player.location, biome, biomes: mixed } : { location: player.location, biome };
  const local = localPool(player.location, state.config) ? placeSpecies(player.location, state.config) : null;
  const lives = (target) => (local ? local.some((p) => speciesMatches(target, p.id)) : mixed ? mixed.some((b) => speciesInBiome(b, target)) : speciesInBiome(biome, target));
  return activeQuests(player).flatMap(({ instance, quest }) => {
    // Finishing a mission on the spot beats wandering off to the next one.
    if (quest.kind === 'explore' && placeMatches(quest, instance, place, state.config)) return [r(`mission "${quest.title}" done by exploring`, q.finishHere)];
    if (quest.kind === 'exploreLocations' && !instance.places.includes(player.location)) return [r(`mission "${quest.title}": new place`, q.newPlace)];
    if (quest.kind === 'catch' && placeMatches(quest, instance, place, state.config) && lives(quest.target)) {
      const atDestination = questLocations(instance, state.config).includes(player.location);
      return [r(`mission "${quest.title}": target lives here`, (atDestination ? q.catchHereDestination : q.catchHereGlobal) * w.catch)];
    }
    return [];
  });
}

function catchQuestBonus(state, player, speciesId, w) {
  const place = { location: player.location };
  return activeQuests(player)
    .filter(({ instance, quest }) => quest.kind === 'catch' && speciesMatches(quest.target, speciesId) && placeMatches(quest, instance, { ...place, biome: undefined }, state.config))
    .map(({ quest }) => r(`mission "${quest.title}"`, state.config.ai.quest.catchTarget * w.catch));
}

function towardPokeStop(state, player, to) {
  const need = pokeStopNeed(player, state.config);
  if (!need) return r('toward Poké Stop', 0);
  const blocks = worldBlocks(state);
  const now = distanceToPokeStop(player, player.location, state.config, blocks);
  const next = distanceToPokeStop(player, to, state.config, blocks);
  if (!Number.isFinite(now) || !Number.isFinite(next)) return r('toward Poké Stop', 0);
  return r(`toward Poké Stop (${now} → ${next} away)`, (now - next) * need);
}

// ---- Team Rocket: go for a plot when the team can take it ------------------------
// Power = HP + 2 × attack of every healthy Pokémon (Rocket: full HP). The stake
// is what clearing pays this player: card reward + own loot + a bit for others'.

function speciesPower(speciesId, hp) {
  return hp + 2 * Math.max(0, getSpecies(speciesId).attack);
}

function rocketReadiness(state, player) {
  const card = plotCard(activePlot(state));
  const rocket = rocketTeam(state, card).reduce((sum, id) => sum + speciesPower(id, getSpecies(id).hp), 0);
  const mine = player.team.filter((p) => p.hp > 0).reduce((sum, p) => sum + speciesPower(p.species, p.hp), 0);
  return mine / rocket;
}

function plotStake(state, player) {
  const q = state.config.ai.rocket;
  const active = activePlot(state);
  const loot = (own) => active.loot.filter((e) => (e.owner === player.id) === own).reduce((sum, e) => sum + lootValue(e, state.config), 0);
  return plotRewardValue(plotCard(active), state.config) + loot(true) * q.ownLoot + loot(false) * q.othersLoot;
}

// Shared by Challenge Rocket, Explore-into-Rocket and walking into an ambush.
function rocketBattleReasons(state, player, w) {
  const q = state.config.ai.rocket;
  const card = plotCard(activePlot(state));
  const ratio = rocketReadiness(state, player);
  const stake = plotStake(state, player);
  const blocksMission = activeQuests(player).some(({ instance }) => questLocations(instance, state.config).includes(activePlot(state).location));
  return [
    r(`beat Team Rocket "${card.title}" (stake ${Math.round(stake * 10) / 10})`, ratio >= q.readyRatio ? q.challenge + 0.8 * stake * w.fight : 0),
    r(`team ${Math.round(ratio * 100)}% of Rocket's power`, ratio >= q.readyRatio ? 0 : -(1 + (q.readyRatio - ratio) * 10) * w.caution),
    r('Rocket sits on my mission target', blocksMission && ratio >= q.readyRatio ? 2 : 0),
  ];
}

// Archetype-neutral pull toward the plot, only when the team can take it.
function towardRocket(state, player, to) {
  const active = activePlot(state);
  if (!active || rocketReadiness(state, player) < state.config.ai.rocket.readyRatio) return r('toward Team Rocket', 0);
  const q = state.config.ai.rocket;
  const blocks = worldBlocks(state);
  const targets = challengeLocations(state);
  const here = travelDistances(player, player.location, state.config, blocks);
  const there = travelDistances(player, to, state.config, blocks);
  const now = Math.min(...targets.map((t) => here[t] ?? Infinity));
  const next = Math.min(...targets.map((t) => there[t] ?? Infinity));
  if (!Number.isFinite(now) || !Number.isFinite(next)) return r('toward Team Rocket', 0);
  const pull = Math.min(q.maxPull, plotStake(state, player) * q.pullPerValue);
  return r(`toward Team Rocket "${plotCard(active).title}" (${now} → ${next} away)`, (now - next) * pull);
}

// Walking into an ambush is a free Rocket battle; a pitfall costs the rest of the turn.
function enteringPlot(state, player, to, w) {
  const active = activePlot(state);
  if (!active || active.location !== to) return [];
  const kind = plotCard(active).effect.kind;
  if (kind === 'ambush' && getLead(player)) return rocketBattleReasons(state, player, w).map((x) => ({ ...x, label: `ambush: ${x.label}` }));
  if (kind === 'pitfall') return [r('Rocket pitfall ends the turn', -1.5 * (state.turn.actionsRemaining - 1))];
  return [];
}

// ---- Phase 3A-2 battle choices ---------------------------------------------------------

// A failed throw may leave the wild Pokémon in place, and then it strikes back
// (rules.counterattackOnStay): the risk weighs more the closer the lead is to fainting.
function counterRisk(state, player, wild, ball, w) {
  if (!state.config.rules.counterattackOnStay || state.config.capture.retry === 'harsh') return [];
  const lead = getLead(player);
  const miss = 1 - throwChance(wild, ball, state.config, vigilanceSteps(state, player));
  const stay = 1 - state.config.capture.escapeDice[escapeColour(wild)].fleeFaces / 6;
  const threat = lead.hp <= 1 ? 4 : lead.hp <= 2 ? 2 : 0.6;
  return [r('it may stay and strike back', -miss * stay * threat * w.caution)];
}

// Potion / Revive replace the attack this exchange (rules.battleItems): worth
// it when the lead is about to faint, rarely otherwise.
function battleItemReasons(state, player, action, w) {
  const target = player.team.find((p) => p.uid === action.target);
  const lead = getLead(player);
  const foe = getSpecies(currentOpponent(state.encounter).species);
  if (ITEMS[action.item]?.kind === 'cure') {
    // COMBAT 2.1: a status on the lead — worth the exchange when it may knock it out (poison / burn on few hearts) or
    // stops it attacking (sleep / paralysis); the bench waits for the map
    if (target !== lead) return [r('cure the bench mid-battle', -2)];
    const id = statusOf(state.encounter, target.uid, target)?.id;
    const danger = ['poison', 'burn'].includes(id) ? (target.hp <= 2 ? 3 : 1) : 2;
    const single = Object.keys(ITEMS).find((k) => ITEMS[k].cures?.length === 1 && ITEMS[k].cures[0] === id); // its own cure
    const spare = action.item === 'fullheal' && single && itemCount(player, single) > 0;
    return [r(`cure ${id}`, danger * w.rest), r('keep the Full Heal', spare ? -3 : 0), r('no attack this exchange', freeBattleHealing(state.config) ? 0 : -1)];
  }
  if (freeBattleHealing(state.config)) return freeBattleItemReasons(state, player, action, target, lead, foe, w);
  const noAttack = r('no attack this exchange', -1);
  // Build 3.3 (battleTempo 'v2'): the Super Potion too, as the exchange
  if (action.item === 'potion' || action.item === 'superpotion') {
    if (target !== lead) return [r('heal the bench mid-battle', -1), noAttack];
    const missing = Math.min(state.config.items[action.item].heal, target.maxHp - target.hp);
    const danger = lead.hp <= 1 ? 3 : lead.hp <= 2 && foe.attack >= 1 ? 2 : 0;
    return [r(`heals the lead +${missing}`, missing * 0.5 * w.rest), r('lead about to faint', danger * w.caution), noAttack, ...keptForQuest(state, player, action.item, 3)];
  }
  const power = (m) => m.maxHp + 2 * Math.max(0, getSpecies(m.species).attack);
  const stronger = lead && power(target) > power(lead);
  return [r('revive mid-battle', 0.5 * w.rest), r(stronger ? 'stronger than the lead' : 'weaker than the lead', stronger ? 1 : -1), noAttack];
}

// Gameplay P1 (rules.healingItems 'v2'): healing in battle is free, once per
// Pokémon per battle — heal the lead when it is in danger, then fight on.
function freeBattleItemReasons(state, player, action, target, lead, foe, w) {
  const power = (m) => m.maxHp + 2 * Math.max(0, getSpecies(m.species).attack);
  if (action.item === 'revive') {
    const healthy = player.team.filter((p) => p.hp > 0).length;
    const stronger = lead && power(target) > power(lead);
    return [r('revive mid-battle (free)', healthy <= 1 && lead.hp <= 2 ? 6 : stronger ? 2 : -1)];
  }
  if (target !== lead) return [r('heal the bench after the battle', -2)];
  const heal = state.config.items[action.item].heal;
  const missing = Math.min(heal, target.maxHp - target.hp);
  // Free and once per battle: heal a hurt lead before the next blow, without waste.
  const danger = lead.hp <= 1 ? 8 : lead.hp <= 2 && foe.attack >= 1 ? 6 : hpFraction(lead) <= 0.6 && missing >= heal ? 5 : 0;
  if (!danger) return [r('lead not in danger', -1)];
  return [r(`heals the lead +${missing} (free)`, missing * 0.8 * w.rest), r('lead in danger', danger * w.caution), r(`wastes ${heal - missing}`, -(heal - missing) * 0.5)];
}

// ---- Macro 01: Professor Oak's Research Jobs and emergency kit --------------------------
// The AI sends the Box first (those Pokémon are idle anyway), then the weakest
// team Pokémon — never the starter's line or the lead if it can help it.

const monPower = (m) => m.maxHp + 2 * Math.max(0, getSpecies(m.species).attack) + (m.growth ?? 0) * 0.3;

// AI v2d (oakTeamOne): the one team Pokémon a Research Job may take — the weakest healthy one that is not the starter's
// line, not the lead, not one a quest needs (a show step, the sailor), with two healthy ones left beside it, and without
// which the main goal (the gym the team is ready for, the League it leads to) is still ready; null when there is none.
function oakSpare(state, player) {
  const healthy = player.team.filter((m) => m.hp > 0);
  if (healthy.length < 3) return null;
  const lead = getLead(player);
  const ok = healthy.filter((m) => m !== lead && !isStarterLine(player, m) && !neededForQuest(state, player, m));
  if (!ok.length) return null;
  const m = ok.reduce((a, b) => (monPower(a) <= monPower(b) ? a : b));
  const without = { ...player, team: player.team.filter((t) => t !== m) };
  const gymT = gymTarget(state, player);
  if (gymT && gymReadiness(state, without, gymT.gym, tripAtFullHp(state, gymT.gym.city)) < gymBarFor(state, player, gymT.gym)) return null;
  if (leagueEligible(state, player) && leagueReadiness(state, player) >= leagueBar(state, player) && leagueReadiness(state, without) < leagueBar(state, player)) return null;
  return m;
}
// A team Pokémon an open quest needs in the team: a show step (different species of some types) it would leave short,
// or the sailor's water Pokémon.
function neededForQuest(state, player, m) {
  if (sailorSwapReasons(state, player, null, m).some((x) => x.value < 0)) return true;
  const types = getSpecies(m.species).types;
  for (const a of player.questBook?.active ?? []) {
    if (isDone(a)) continue;
    for (const [i, o] of (bookQuest(a.questId).stages[a.stage]?.objectives ?? []).entries()) {
      if (o.kind !== 'show' || objectiveProgress(player, a, o, i) >= objectiveTarget(o) || !types.some((t) => o.types.includes(t))) continue;
      if (showKinds({ ...player, team: player.team.filter((t) => t !== m) }, o) < o.count) return true;
    }
  }
  return false;
}
function oakJobReasons(state, player, job) {
  const spec = jobSpec(state, job);
  if (usesAiPlanC(state.config)) {
    // AI v2c: only Box Pokémon go (the team stays whole); the reward it would really get now — Oak's research pays more
    // for species new to him (the freshest Box Pokémon first); nothing to gain, no job
    const idleBox = player.reserve.filter((p) => p.hp > 0);
    // AI v2d (oakTeamOne): one weak team Pokémon may fill the last place (oakSpare: never the starter, the lead, the last
    // healthy ones, one a quest or the main goal needs)
    const spare = v2dPart(state.config, 'oakTeamOne') && idleBox.length === spec.size - 1 ? oakSpare(state, player) : null;
    if (idleBox.length < spec.size && !spare) return [r(`Research Job ${job}: only with ${spec.size} Box Pokémon${v2dPart(state.config, 'oakTeamOne') ? ' (or one less and a spare team Pokémon), AI v2d' : ' (AI v2c)'}`, -10)];
    const studied = player.oakStudied ?? [];
    const pick = [...[...idleBox].sort((a, b) => Number(studied.includes(a.species)) - Number(studied.includes(b.species)) || monPower(a) - monPower(b)).slice(0, spec.size), ...(spare ? [spare] : [])];
    const reward = usesResearch(state) ? researchReward(player, job, pick.map((m) => m.species)).reward : spec.reward;
    const value = reward.reduce((sum, x) => sum + (x.type === 'money' ? x.amount : price(x.type === 'pokeballs' ? 'pokeball' : x.type, state.config) * x.amount), 0);
    return [r(`Research Job ${job} with Box Pokémon${spare ? ` and ${getSpecies(spare.species).name} from the team (back in ${spec.turns} turns, AI v2d)` : ''}: ${value} money-equivalent (AI v2c)`, value > 0 ? value * 1.4 : -5)];
  }
  const value = spec.reward.reduce((sum, x) => sum + (x.type === 'money' ? x.amount : price(x.type === 'pokeballs' ? 'pokeball' : x.type, state.config) * x.amount), 0);
  const idle = player.reserve.filter((p) => p.hp > 0).length;
  const fromTeam = Math.max(0, spec.size - idle);
  const healthyTeam = player.team.filter((p) => p.hp > 0).length;
  const left = healthyTeam - fromTeam; // healthy Pokémon the team keeps
  const poor = player.money < state.config.economy.pokeball * 2;
  return [
    r(`Research Job ${job}: ${value} money-equivalent`, value * 1.4),
    r(`${fromTeam} team Pokémon away ${spec.turns} turns, ${left} stay`, -fromTeam * (left >= 3 ? 0.5 : left === 2 ? 1 : 2.5)),
    r('money is short', poor ? 3 : 0),
  ];
}

function oakPickReasons(player, uid, state = null) {
  const inBox = player.reserve.find((p) => p.uid === uid);
  if (!inBox && state && usesAiPlanD(state.config)) {
    // AI v2d: a team Pokémon goes only as the one spare (oakTeamOne), when no Box Pokémon is left to pick and none of the
    // team went yet; any other team pick scores below calling the draft off — never a wrong Pokémon, never a hung draft
    const draft = state.oakJobDraft;
    const fromTeam = (draft?.picked ?? []).filter((id) => player.team.some((m) => m.uid === id)).length;
    const boxLeft = player.reserve.some((m) => m.hp > 0 && !(draft?.picked ?? []).includes(m.uid));
    const spare = v2dPart(state.config, 'oakTeamOne') && !fromTeam && !boxLeft ? oakSpare(state, player) : null;
    const mon = player.team.find((p) => p.uid === uid);
    return spare?.uid === uid ? [r(`${getSpecies(mon.species).name}, the one spare team Pokémon (AI v2d)`, 1)] : [r(`${getSpecies(mon.species).name} from the team — not by the policy, call the job off (AI v2d)`, -20)];
  }
  if (inBox && state && usesAiPlanC(state.config)) return [r('an idle Pokémon from the Box', 3 - monPower(inBox) * 0.05), r('new for Oak\'s research (AI v2c)', (player.oakStudied ?? []).includes(inBox.species) ? 0 : 2)];
  if (inBox) return [r('an idle Pokémon from the Box', 3 - monPower(inBox) * 0.05)];
  const mon = player.team.find((p) => p.uid === uid);
  return [
    r(`${getSpecies(mon.species).name} from the team`, -monPower(mon) * 0.2),
    r('starter line stays', isStarterLine(player, mon) ? -5 : 0),
    r('the lead stays', mon === getLead(player) ? -2 : 0),
  ];
}

// Toward Professor Oak's emergency kit when it would rescue the player (no
// ball, no money): as strong as a fainted team's pull to a Poké Stop, toward
// the nearest place that gives it. Research Jobs pull nobody — a detour for
// +1 money cost the AI badges in the Macro 01 simulation; the AI starts a job
// only when it is in Pallet Town anyway.
// Build 3.3 E4: an open hunt — toward its place (known with a clue; else the region)
// when the team has balls and is ready for a strong Pokémon.
function huntHere(state, player) {
  const h = state.hunts?.active;
  return Boolean(h) && h.place === player.location && huntOpenFor(state, player) && ballCount(player) > 0;
}
function towardHunt(state, player, to) {
  const h = state.hunts?.active;
  if (!h || !huntOpenFor(state, player) || ballCount(player) === 0) return [];
  const targets = player.clues.includes(h.id) ? [h.place] : huntDef(state.config, h.id).region;
  const blocks = worldBlocks(state);
  const here = travelDistances(player, player.location, state.config, blocks);
  const there = travelDistances(player, to, state.config, blocks);
  const now = Math.min(...targets.map((t) => here[t] ?? Infinity));
  const next = Math.min(...targets.map((t) => there[t] ?? Infinity));
  if (!Number.isFinite(now) || !Number.isFinite(next) || now > 6) return [];
  return [r(`toward the rare hunt (${now} → ${next} away)`, (now - next) * (player.clues.includes(h.id) ? 5 : 2))];
}

// Build 3.3 E3: toward the place the next quest-book step needs (a visit, an Explore, a key
// item to bring, a quest challenge) or, when done, where its reward is collected.
// Only the steps still open count; a quest challenge only once the team is ready for it
// (E5: a challenge the AI would not fight must not hold it at that place).
// noCatch (AI v2e, noFutileCatch — no Ball): an expedition's encounter is no target (it ends only with a catch)
function bookTargets(state, player, a, noCatch = false) {
  const q = bookQuest(a.questId);
  if (isDone(a)) return q.claimAt === 'pokeStop' ? pokeStopPlaces(state.config) : [q.claimAt];
  const places = [];
  q.stages[a.stage].objectives.forEach((o, i) => {
    if (objectiveProgress(player, a, o, i) >= objectiveTarget(o)) return;
    if (['visit', 'explore', 'bring', 'encounter'].includes(o.kind)) { if (!(noCatch && o.kind === 'encounter')) places.push(o.place); } // C4: the expedition's encounter place
    else if (o.kind === 'challenge' && challengeRatio(state, player, o) >= state.config.ai.gym.readyRatio) places.push(o.place);
    // E5: a trial's catch goal — the places whose own (signature) species has the type
    else if (a.gym && o.kind === 'catch' && o.types && state.config.rules.localPools === 'v2') places.push(...signaturePlacesOf(o.types));
    // SYS-01 AI v2: a pack quest's show / give place, once the team / the items are in hand
    else if (usesAiPlan(state.config) && ((o.kind === 'show' && showKinds(player, o) >= o.count) || (o.kind === 'give' && itemCount(player, o.item) >= o.count))) places.push(o.place);
  });
  return places;
}
const challengeRatio = (state, player, spec) => {
  const row = spec.teams[Math.min(3, player.badges.length + 1) - 1];
  return powerAgainst(state, player, row) / rowPower(row);
};
const signaturePlacesOf = (types) => Object.entries(LOCAL_POOLS).filter(([, t]) => t.signature.some((s) => getSpecies(s).types.some((x) => types.includes(x)))).map(([id]) => id);
// E5: one gym trial at a time — the one with the most steps done, then the nearest (like
// one gym target): several trials pulling apart would leave the AI between them.
function focusTrial(state, player, here) {
  const open = (player.questBook.trials ?? []).filter((t) => !isDone(t) && !player.badges.includes(t.gym));
  const done = (t) => bookQuest(t.questId).stages[t.stage].objectives.filter((o, i) => objectiveProgress(player, t, o, i) >= objectiveTarget(o)).length;
  const near = (t) => Math.min(Infinity, ...bookTargets(state, player, t).map((p) => here[p] ?? Infinity));
  const best = open.map((t) => ({ t, done: done(t), near: near(t) })).filter((x) => Number.isFinite(x.near)).sort((x, y) => y.done - x.done || x.near - y.near || (x.t.occ < y.t.occ ? -1 : 1))[0];
  return best ? [best.t] : [];
}

// Build 3.3 E3 / E5: an Explore here is a quest-book step (an Explore goal, or a trial's
// catch goal at a place whose own species has the type).
// noTrail (AI v2e, noFutileCatch — no Ball): „a new trail” for an expedition's encounter does not count (the encounter
// ends only with a catch); an explore step here still does.
function bookExploreHere(state, player, noTrail = false) {
  if (!usesQuestBook(state.config) || !player.questBook) return [];
  const entries = [...player.questBook.active, ...(player.questBook.trials ?? [])].filter((a) => !isDone(a));
  const trail = (a) => bookQuest(a.questId).stages[a.stage].objectives.some((o, i) => objectiveProgress(player, a, o, i) < objectiveTarget(o) && o.kind === 'encounter' && o.place === player.location && a.lost?.[i]);
  const hit = entries.find((a) => {
    const objs = bookQuest(a.questId).stages[a.stage].objectives;
    if (!noTrail && trail(a)) return true; // C4: R2 — a new trail
    return objs.some((o, i) => objectiveProgress(player, a, o, i) < objectiveTarget(o) && (
      (o.kind === 'explore' && o.place === player.location) ||
      (a.gym && o.kind === 'catch' && o.types && state.config.rules.localPools === 'v2' && signaturePlacesOf(o.types).includes(player.location) && totalBalls(player) > 0)));
  });
  if (hit) return [r(`quest ${hit.occ}: its step is here`, 4)];
  const t = noTrail ? entries.find(trail) : null;
  return t ? [r(`quest ${t.occ}: a new trail here — only a catch finishes it, no Ball now (AI v2e)`, 0)] : [];
}
// AI v2e (noFutileCatch): the reasons only a catch can pay off count nothing without a Ball (said so in the label)
function noBallFirst(list, pattern) {
  return list.map((x) => (x.value && pattern.test(x.label) ? r(`${x.label} — no Ball, cannot catch now (AI v2e)`, 0) : x));
}
function towardBook(state, player, to) {
  if (!usesQuestBook(state.config) || !player.questBook) return [];
  const blocks = worldBlocks(state);
  const here = travelDistances(player, player.location, state.config, blocks);
  const entries = [...player.questBook.active, ...focusTrial(state, player, here)];
  if (!entries.length) return [];
  const there = travelDistances(player, to, state.config, blocks);
  // AI v2c: one quest-book quest at a time too — the nearest (then by occ). Several pulling the other way outweighed
  // even the League (seen: 840 weeks between Viridian and Route 22, four side quests × ½ against the League's +6).
  const noBall = v2ePart(state.config, 'noFutileCatch') && noCatchNow(state, player); // AI v2e: see bookTargets
  const nowOf = (a) => Math.min(...bookTargets(state, player, a, noBall).map((t) => here[t] ?? Infinity));
  const focus = usesAiPlanC(state.config) ? entries.filter((a) => Number.isFinite(nowOf(a))).sort((a, b) => nowOf(a) - nowOf(b) || (a.occ < b.occ ? -1 : 1))[0] : null;
  return entries.map((a) => {
    const targets = bookTargets(state, player, a, noBall);
    if (!targets.length) return r(noBall && bookTargets(state, player, a).length ? `quest ${a.occ} — its encounter ends only with a catch, no Ball now (AI v2e)` : `quest ${a.occ}`, 0);
    const now = Math.min(...targets.map((t) => here[t] ?? Infinity));
    const next = Math.min(...targets.map((t) => there[t] ?? Infinity));
    if (!Number.isFinite(now) || !Number.isFinite(next)) return r(`quest ${a.occ}`, 0);
    if (focus && a !== focus) return r(`quest ${a.occ} (later — one at a time, AI v2c)`, 0);
    return r(`quest ${a.occ} (${now} → ${next} away)`, (now - next) * (isDone(a) ? 4 : 3));
  });
}

function towardOak(state, player, to) {
  const cfg = state.config;
  const kit = cfg.rules.oakKit && !player.oakKitUsed && needsKit(state, player);
  if (!kit) return [];
  const blocks = worldBlocks(state);
  const here = travelDistances(player, player.location, cfg, blocks);
  const there = travelDistances(player, to, cfg, blocks);
  const places = Object.keys(here).filter((id) => kitPlace(state, id));
  const now = Math.min(...places.map((id) => here[id] ?? Infinity));
  const next = Math.min(...places.map((id) => there[id] ?? Infinity));
  if (!Number.isFinite(now) || !Number.isFinite(next)) return [];
  return [r(`toward Professor Oak's emergency kit (${now} → ${next} away)`, (now - next) * 8)];
}

// ---- Gameplay P1: the shop and Oak's Box -------------------------------------------

function pokeStopMissionReasons(player) {
  return activeQuests(player)
    .filter(({ instance, quest }) => quest.kind === 'visitPokeStops' && !instance.visited.includes(player.location))
    .map(({ quest }) => r(`mission "${quest.title}"`, 2));
}

// Worth selling (> 1 beats leaving the shop): stones nobody in the team needs,
// medicine beyond a field kit; never balls. Buying stops at 1–2 Potions and
// only wants needed stones, so the AI never buys back what it sells.
function sellValue(state, player, id) {
  if (!state.config.rules.selling || itemCount(player, id) <= 0) return 0;
  const kind = ITEMS[id]?.kind;
  if (kind === 'ball') return -5;
  if (kind === 'evolution' && usesAiPlanC(state.config)) return stoneNeededByAnyone(player, id, state.config) ? -3 : 1.3; // AI v2c: the Box and Eevee's branches too
  if (kind === 'evolution') return player.team.some((p) => growthEdge(p)?.item === id) ? -3 : 1.3; // (an Eevee's stones: growthEdge without rules = no branch — the AI keeps its old view)
  if (id === 'potion') return itemCount(player, id) > 3 && !keptForQuest(state, player, id, 1).length ? 1.1 : -3;
  if (id === 'superpotion') return itemCount(player, id) > 2 ? 1.1 : -3;
  if (id === 'revive') return itemCount(player, id) > 2 ? 1.05 : -3;
  return -3;
}

// The new Pokémon against the one that would leave the team for the Box.
function boxSwapReasons(player, incoming, out) {
  const power = (m) => m.maxHp + 2 * Math.max(0, getSpecies(m.species).attack) + (m.growth ?? 0) * 0.3;
  const gain = power(incoming) - power(out);
  return [
    r(`${getSpecies(incoming.species).name} vs ${getSpecies(out.species).name}`, gain * 0.4 - 1),
    r('starter line stays', isStarterLine(player, out) ? -5 : 0),
    r('fainted newcomer', incoming.hp === 0 ? -2 : 0),
  ];
}

// Leave a trainer battle that is going badly (rules.trainerRetreat): our
// healthy power against what the trainer still has; the price counts a little,
// and with several items on offer the cheapest is given.
function retreatReasons(state, player, action, w) {
  const enc = state.encounter;
  const left = enc.trainer.pokemonTeam.slice(enc.index).filter((m) => m.hp > 0);
  const theirs = left.reduce((sum, m) => sum + m.hp + 2 * Math.max(0, getSpecies(m.species).attack), 0);
  const ratio = powerAgainst(state, player, left.map((m) => m.species)) / Math.max(1, theirs);
  const cost = player.money > 0 ? 1 : action.item ? price(action.item, state.config) : 0;
  return [
    r(`our power ${ratio.toFixed(2)} × theirs`, ratio < 0.7 ? (0.7 - ratio) * 12 * w.caution : -3),
    r(cost ? `costs ${action.item ? `a ${ITEMS[action.item].name}` : '1 money'}` : 'nothing to leave', -0.3 * cost),
  ];
}

// ---- gyms and the League ------------------------------------------------------------
// Readiness = own healthy power against these opponents (HP + 2 × (attack +
// average type modifier)) / their power (HP + 2 × attack). It uses current HP,
// so a hurt team heals before it challenges.

// fullHp: as the team will be after a full heal (a Poké Stop at the destination).
function powerAgainst(state, player, opponents, fullHp = false) {
  return player.team.filter((p) => fullHp || p.hp > 0).reduce((sum, p) => {
    const s = getSpecies(p.species);
    const mods = opponents.map((id) => typeModifier(attackTypeOf(s), getSpecies(id).types, state.config));
    const mod = mods.reduce((a, b) => a + b, 0) / mods.length;
    return sum + (fullHp ? p.maxHp : p.hp) + 2 * Math.max(0, s.attack + mod);
  }, 0);
}

// Build 3.3 correction C3: a chain is one attempt with no Poké Stop inside it — the
// AI measures its team (HP as it is now, or full after a heal on the way) against
// EVERY Pokémon of the attempt: the gym's trainer(s) and the leader (rules
// gymChallenge 'v2'), the four League v2 members (rules leagueChallenge 'v2'). The
// healing it carries counts too: between the battles items are free. Older games
// keep the leader's row alone and no item term (the same seeds play as before).
function itemReserveHp(state, player) {
  const team = player.team;
  if (!team.length) return 0;
  const avgMax = team.reduce((a, p) => a + p.maxHp, 0) / team.length;
  const hp = healingItems(state.config).reduce((sum, id) => sum + itemCount(player, id) * (id === 'revive' ? avgMax * (state.config.items.revive.hpFraction ?? 1) : state.config.items[id].heal), 0);
  return Math.min(hp, team.reduce((a, p) => a + p.maxHp, 0)); // never more than the team can hold
}

function gymReadiness(state, player, gym, fullHp = false) {
  if (usesGymChain(state.config)) {
    const row = chainOpponents(state, { kind: 'gym', gymId: gym.id, tier: gymTier(state, player) }).flatMap((o) => o.team);
    return (powerAgainst(state, player, row, fullHp) + itemReserveHp(state, player)) / rowPower(row);
  }
  const row = gymRow(gym, gymTier(state, player), state.config);
  return powerAgainst(state, player, row, fullHp) / rowPower(row);
}

function tripAtFullHp(state, location) {
  return Boolean(state.config.ai.pullReadinessAtFullHp) && hasPokeStop(location, state.config);
}

// Nearest gym (without the badge) the AI is ready for; ties → better readiness.
// Once it has enough badges for the League it stops hunting gyms: extra badges
// only pay money, so it trains for the League instead.
function gymTarget(state, player) {
  if (!gymsEnabled(state) || player.badges.length >= leagueBadges(state.config)) return null;
  const q = state.config.ai.gym;
  const dist = travelDistances(player, player.location, state.config, worldBlocks(state));
  const unlocked = (g) => { const u = gymUnlock(state, player, g.id); return u.ok || (u.missing.length === 1 && u.missing[0] === 'trial' && !player.knownTrials?.includes(g.id)); }; // E5: go and learn an unknown trial
  const shut = worldBlocks(state)?.gyms ?? []; // NIGHTSHIFT D (incidents pilot only): a gym shut this week is not a target — no trip, no waiting
  const ready = gymsOf(state.config).filter((g) => !hasBadge(player, g.id) && unlocked(g) && !placeClosedNow(state, g.city) && !shut.includes(g.id) && dist[g.city] !== undefined) // Build 3.3: credentials (hometown); C2: not a closed city
    .map((g) => ({ gym: g, ratio: gymReadiness(state, player, g, tripAtFullHp(state, g.city)), d: dist[g.city] }))
    .filter((t) => t.ratio >= gymBarFor(state, player, t.gym) && !gymCoolingDown(state, player, t.gym))
    .sort((a, b) => a.d - b.d || b.ratio - a.ratio);
  return ready[0] ?? null;
}

function towardGym(state, player, to) {
  const target = gymTarget(state, player);
  if (!target || target.d === 0) return r('toward a gym', 0);
  const there = travelDistances(player, to, state.config, worldBlocks(state))[target.gym.city];
  if (there === undefined) return r('toward a gym', 0);
  return r(`toward ${target.gym.leader}'s gym (${target.d} → ${there} away)`, (target.d - there) * state.config.ai.gym.pull);
}

function gymChallengeReasons(state, player, w) {
  const q = state.config.ai.gym;
  const gym = gymHere(state, player);
  const ratio = gymReadiness(state, player, gym);
  const missing = player.team.reduce((sum, p) => sum + p.maxHp - p.hp, 0);
  const enough = player.badges.length >= leagueBadges(state.config);
  const bar = gymBarFor(state, player, gym); // v2 … v2d: the plain ratio
  const learned = bar > gymBar(state) ? `; after ${player.stats.gyms.lost[gym.id]} lost here, the bar is ${Math.round(bar * 100)}% (AI v2e)` : '';
  return [
    r(`${gym.badge} (tier ${gymTier(state, player)}, team ${Math.round(ratio * 100)}% of ${usesGymChain(state.config) ? 'the whole chain' : 'the leader'}${learned})`, ratio >= bar ? q.challenge : -(1 + (bar - ratio) * 10) * w.caution),
    r('lost here — not again before the team changes (AI v2e)', gymCoolingDown(state, player, gym) ? -q.challenge - 2 : 0),
    r('already has enough badges for the League', enough ? -q.challenge + 1 : 0),
    // At a hub with 2 actions left: heal (1 action), then challenge (1 action).
    r('heal at the Poké Stop first', hasPokeStop(player.location, state.config) && missing >= 2 && state.turn.actionsRemaining >= 2 ? -q.challenge : 0),
  ];
}

function leagueRemaining(state, player) {
  if (usesLeagueChallenge(state.config)) return chainOpponents(state, { kind: 'league' }).flatMap((o) => o.team); // C3: all four, every time
  const start = leagueStartStage(state, player);
  return LEAGUE.stages.flatMap((_, i) => (i >= start ? leagueStageTeam(state, i) : []));
}

function leagueReadiness(state, player, fullHp = false) {
  const rest = leagueRemaining(state, player);
  const items = usesLeagueChallenge(state.config) ? itemReserveHp(state, player) : 0; // C3: free between the four battles
  return (powerAgainst(state, player, rest, fullHp) + items) / rowPower(rest);
}

function leagueEligible(state, player) {
  return gymsEnabled(state) && !player.league.champion && player.badges.length >= leagueBadges(state.config);
}

// AI v2b: the readiness the AI asks of itself before a League Challenge. The ratio is an estimate; every lost League
// Challenge is evidence it overrates the team, so the bar rises 5 points per loss (at most +30) — no more retries with
// the same team straight after a loss (seen: 37–84 attempts in the slowest games). The extra fades with ACTIVITY since
// its last attempt (its own map actions — moves, Explores, fishing, rests, Poké Stops, battles it starts; gone after 24,
// about 8 turns): a cooldown, not a measure of the team's strength — so a team that cannot grow is never locked out for
// good. Window: this player's last 600 history entries (a longer stretch = faded). v1 / v2: the plain ratio.
const TRAINING = new Set(['move', 'explore', 'fish', 'rest', 'visitPokeStop', 'pokeStopHeal', 'challengeGym', 'challengeRocket', 'questChallenge', 'evolve']);
function trainingSinceLeague(state, player) {
  let n = 0;
  for (let i = state.history.length - 1, seen = 0; i >= 0 && seen < 600; i--) {
    const h = state.history[i];
    if (h.player !== player.id) continue;
    seen += 1;
    if (h.action.type === 'challengeLeague') return n;
    if (TRAINING.has(h.action.type)) n += 1;
  }
  return Infinity;
}
function leagueBar(state, player) {
  const base = v2dPart(state.config, 'league70') ? 0.7 : state.config.ai.league.readyRatio; // AI v2d: see V2D_PARTS
  const losses = usesAiPlanB(state.config) ? player.stats.gyms.chain?.leagueResets ?? 0 : 0;
  // AI v2c keeps this bar as it is (measured, 200 one-player games each — weeks p50 / p99 / max, attempts max):
  //   a stall breaker (the bar falling with weeks since eligible) — undid the learning from losses: 89 attempts;
  //   a fade by real growth (Growth handed out, evolutions) beside a 72-action cooldown — 43 / 126 / 130, 42 attempts;
  //   a gate „the same team just lost — grow first” — 53 / 148 / 180, 8 attempts: the same team wins 21 % of its tries,
  //   a changed one 20 % — a loss says nothing about the next try, waiting only made games longer;
  //   this bar — 44 / 150 / 179, 25 attempts (v2b: 42 / 301 / 484, 26). The 840-week League stall came from side goals
  //   pulling against the League — settled by „the main goal first” in the moves, not by the bar.
  return losses ? base + Math.min(0.3, 0.05 * losses) * Math.max(0, 1 - trainingSinceLeague(state, player) / 24) : base;
}
// The gym's bar: the plain ratio in every AI version. (AI v2c measured a stall breaker that lowered it after weeks
// without a badge: worse — badges with weaker teams, then more lost Leagues; the gym stalls it was for came from side
// goals pulling against the gym, now settled by „the main goal first” in the moves.)
function gymBar(state) {
  return state.config.ai.gym.readyRatio;
}
// AI v2e: the bar for one gym — gymBarLearns: +5 points for every battle lost in this gym (up to +30), fading over 24 own
// map actions since the last gym challenge (no change in v2 … v2d: the plain ratio)
function gymBarFor(state, player, gym) {
  const base = gymBar(state);
  const losses = v2ePart(state.config, 'gymBarLearns') ? player.stats.gyms.lost?.[gym.id] ?? 0 : 0;
  if (!losses) return base;
  return base + Math.min(0.3, 0.05 * losses) * Math.max(0, 1 - actionsSince(state, player, 'challengeGym').training / 24);
}
// AI v2e (gymCooldown, the alternative): after a battle lost in this gym, not this gym again until the team changed or
// 24 own map actions passed since the last gym challenge
function gymCoolingDown(state, player, gym) {
  if (!v2ePart(state.config, 'gymCooldown') || !(player.stats.gyms.lost?.[gym.id] ?? 0)) return false;
  const since = actionsSince(state, player, 'challengeGym');
  return !since.teamChanged && since.training < 24;
}
// Own map actions and team changes since this player's last `type` action (looking back over its last 600 history entries;
// none among them = long ago).
function actionsSince(state, player, type) {
  let training = 0, teamChanged = false;
  for (let i = state.history.length - 1, seen = 0; i >= 0 && seen < 600; i--) {
    const h = state.history[i];
    if (h.player !== player.id) continue;
    seen += 1;
    if (h.action.type === type) return { training, teamChanged };
    if (TRAINING.has(h.action.type)) training += 1;
    if (['assignGrowth', 'evolve', 'boxIn', 'boxKeep', 'tradeAgree'].includes(h.action.type)) teamChanged = true;
  }
  return { training: Infinity, teamChanged: true };
}

function towardLeague(state, player, to) {
  if (!leagueEligible(state, player) || leagueReadiness(state, player, tripAtFullHp(state, LEAGUE.location)) < leagueBar(state, player)) return r('toward the League', 0);
  const blocks = worldBlocks(state);
  const now = travelDistances(player, player.location, state.config, blocks)[LEAGUE.location];
  const next = travelDistances(player, to, state.config, blocks)[LEAGUE.location];
  if (now === undefined || next === undefined) return r('toward the League', 0);
  return r(`toward the League (${now} → ${next} away)`, (now - next) * state.config.ai.league.pull);
}

function leagueChallengeReasons(state, player, w) {
  const q = state.config.ai.league;
  // Final week: no later turn to prepare for — try the League if it's legal.
  if (state.endgame?.status === 'finalWeek') return [r('final week: last chance to become Champion', 30)];
  const ratio = leagueReadiness(state, player);
  const bar = leagueBar(state, player);
  const missing = player.team.reduce((sum, p) => sum + p.maxHp - p.hp, 0);
  return [
    r(`League Challenge (team ${Math.round(ratio * 100)}% of what's left${bar > q.readyRatio ? `; after ${player.stats.gyms.chain?.leagueResets} lost, the bar is ${Math.round(bar * 100)}%` : ''})`, ratio >= bar ? q.challenge : -(1 + (bar - ratio) * 10) * w.caution),
    r('heal at the Poké Stop first', missing >= 2 && state.turn.actionsRemaining >= 2 ? -q.challenge : 0),
  ];
}

function effectValue(player, lead, e, w) {
  switch (e.type) {
    case 'money': return e.amount;
    case 'pokeballs': return 1.5 * e.amount;
    case 'healLead': return lead ? Math.min(e.amount, lead.maxHp - lead.hp) * w.rest : 0;
    case 'healTeam': return player.team.reduce((s, p) => s + Math.min(e.amount, p.maxHp - p.hp), 0) * w.rest;
    case 'damageLead': return -1.5 * e.amount * w.caution;
    case 'actions': return 2 * e.amount;
    case 'wildEncounter': return (totalBalls(player) > 0 ? 2 : 0.5) * w.catch;
    case 'trainerBattle': return 1 * w.fight;
    case 'item': return 1.5 * e.amount; // bonus 14.10 (rules.eventPack): a Potion / a Great Ball, like a Poké Ball
    default: return 0;
  }
}
