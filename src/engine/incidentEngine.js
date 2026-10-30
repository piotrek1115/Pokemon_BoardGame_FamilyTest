// NIGHTSHIFT D — the living world's regional incidents (rules.worldIncidents 'pilot'; data/worldIncidents.js).
// Pure and deterministic: the schedule is drawn once at createGame from the seed by a stateless hash (no game die,
// so every other roll of the game is the one it would have been), the active closures are a function of the week,
// Team Rocket's block and the world flags — a reload is the same game. graphEngine.worldBlocks is the only reader of
// the closures; the encounter engine asks swarmAt for the swarm. Engine rules hold: no browser globals, no unseeded randomness.
import { WORLD_INCIDENTS } from '../data/worldIncidents.js';
import { gymsOf } from '../data/gyms.js';
import { topologyLocations, isLocationEnabled } from '../data/locations.js';
import { edgeKey, travelDistances } from './travelEngine.js';
import { hashIndex } from './rng.js';
import { log } from './log.js';

export const usesIncidents = (config) => config.rules.worldIncidents === 'pilot';
export const incidentDef = (id) => WORLD_INCIDENTS.pilot.find((d) => d.id === id) ?? null;

const span = (seed, key, [lo, hi]) => lo + hashIndex(`${seed}:incident:${key}`, hi - lo + 1);
const length = (seed, key, weeks) => (Array.isArray(weeks) ? span(seed, key, weeks) : weeks);

// Once, at createGame: every occurrence's weeks (and the closed gym), from the seed.
export function setupIncidents(state) {
  if (!usesIncidents(state.config)) return;
  const gyms = gymsOf(state.config).filter((g) => !g.unlock?.badges).map((g) => g.id);
  const schedule = [];
  for (const def of WORLD_INCIDENTS.pilot) {
    if (def.fromStart) {
      schedule.push({ id: def.id, n: 1, from: 1, to: null });
      continue;
    }
    let from = span(state.seed, `${def.id}:1`, def.first);
    for (const n of [1, 2]) {
      if (n === 2) from += span(state.seed, `${def.id}:gap`, def.again);
      const to = from + length(state.seed, `${def.id}:len${n}`, def.weeks);
      schedule.push({ id: def.id, n, from, to, ...(def.kind === 'closeGym' ? { gym: gyms[hashIndex(`${state.seed}:incident:gym:${n}`, gyms.length)] } : {}) });
      from = to;
    }
  }
  state.incidents = { v: 1, schedule, flags: {}, noted: 0 };
  log(state, 'system', `World incidents (pilot): ${schedule.map((x) => `${x.id}${x.gym ? ` (${x.gym})` : ''} ${x.to ? `weeks ${x.from}–${x.to - 1}` : 'from week 1'}`).join(', ')}.`, { incidents: { event: 'schedule', schedule } });
}

const live = (state, e, week) => week >= e.from && (e.to == null ? !state.incidents.flags[incidentDef(e.id).until] : week < e.to);

// The occurrences open this week by the schedule (before the safety gate): Snorlax first, then by start.
export function scheduledNow(state, week = state.turn.round) {
  if (!usesIncidents(state.config) || !state.incidents) return [];
  return state.incidents.schedule.filter((e) => live(state, e, week)).sort((a, b) => (a.to == null ? -1 : b.to == null ? 1 : a.from - b.from || (a.id < b.id ? -1 : 1)));
}

// The swarm at this place this week (never a closure, so never held), or null.
export function swarmAt(state, place) {
  const e = scheduledNow(state).find((x) => incidentDef(x.id).kind === 'swarm' && incidentDef(x.id).places.includes(place));
  return e ? incidentDef(e.id) : null;
}

// SAFETY: with these blocks, can every place still be reached from every open place that reaches it on the bare
// network (closed places aside) — for a player with and without water travel? Pure, from the config's network.
export function safeBlocks(config, blocks) {
  const places = topologyLocations(config).filter((l) => isLocationEnabled(l.id, config)).map((l) => l.id).filter((id) => !blocks.locations?.includes(id));
  const bare = { locations: blocks.locations ?? [], edges: [] };
  for (const capabilities of [{}, { canTravelWater: true }]) {
    const who = { capabilities };
    for (const from of places) {
      const ref = travelDistances(who, from, config, bare);
      const now = travelDistances(who, from, config, blocks);
      for (const to of places) if (ref[to] !== undefined && now[to] === undefined) return false;
    }
  }
  return true;
}

const cache = new WeakMap();
// This week's incident closures on top of Team Rocket's (`rocket`, graphEngine passes it): { edges, gyms, held }, or
// null without the pilot. A closure that would cut a road is HELD (not applied) — in the fixed order above.
export function incidentBlocks(state, rocket) {
  if (!usesIncidents(state.config) || !state.incidents) return null;
  const now = scheduledNow(state);
  const key = `${state.turn.round}|${JSON.stringify(rocket ?? null)}|${now.map((e) => `${e.id}#${e.n}`).join(',')}`;
  const hit = cache.get(state);
  if (hit?.key === key) return hit.value;
  const edges = [];
  const gyms = [];
  const held = [];
  for (const e of now) {
    const def = incidentDef(e.id);
    if (def.kind === 'closeGym') gyms.push(e.gym);
    if (def.kind !== 'closeEdges') continue;
    const mine = def.edges.map(([a, b]) => edgeKey(a, b));
    const trial = { locations: rocket?.locations ?? [], edges: [...(rocket?.edges ?? []), ...edges, ...mine] };
    if (safeBlocks(state.config, trial)) edges.push(...mine);
    else held.push(e.id);
  }
  const value = { edges, gyms, held };
  cache.set(state, { key, value });
  return value;
}

// The incidents a table shows this week: { id, kind, to, gym, held }.
export function incidentsNow(state, rocket) {
  const blocks = incidentBlocks(state, rocket);
  if (!blocks) return [];
  return scheduledNow(state).map((e) => ({ id: e.id, kind: incidentDef(e.id).kind, to: e.to, gym: e.gym ?? null, held: blocks.held.includes(e.id) }));
}

// A world flag (the Poké Flute wakes Snorlax): shared by every player, kept in the save.
export function setWorldFlag(state, flag) {
  if (!state.incidents || state.incidents.flags[flag]) return;
  state.incidents.flags[flag] = state.turn.round;
  log(state, 'world', `🌍 The world changes: ${flag}.`, { incidents: { event: 'flag', flag } });
}
export const worldFlag = (state, flag) => Boolean(state.incidents?.flags?.[flag]);

// At the start of each week: one log line for every incident that starts or ends (the table's notices read them).
export function incidentsWeekStart(state, rocket) {
  if (!usesIncidents(state.config) || !state.incidents) return;
  const week = state.turn.round;
  for (const e of state.incidents.schedule) {
    if (e.from === week && e.to != null) log(state, 'world', `🌍 ${e.id} starts (until week ${e.to - 1})${e.gym ? `: the ${e.gym} gym is closed` : ''}.`, { incidents: { event: 'start', id: e.id, n: e.n, to: e.to, gym: e.gym ?? null } });
    if (e.to === week) log(state, 'world', `🌍 ${e.id} is over.`, { incidents: { event: 'end', id: e.id, n: e.n } });
  }
  const held = incidentBlocks(state, rocket)?.held ?? [];
  if (held.length) log(state, 'world', `🌍 Held (it would cut a road): ${held.join(', ')}.`, { incidents: { event: 'held', ids: held } });
}

// Which incident closes this edge this week (the table's reason), or null.
export function incidentOnEdge(state, rocket, a, b) {
  const blocks = incidentBlocks(state, rocket);
  if (!blocks) return null;
  const key = edgeKey(a, b);
  if (!blocks.edges.includes(key)) return null;
  return scheduledNow(state).find((e) => !blocks.held.includes(e.id) && incidentDef(e.id).kind === 'closeEdges' && incidentDef(e.id).edges.some(([x, y]) => edgeKey(x, y) === key))?.id ?? null;
}
