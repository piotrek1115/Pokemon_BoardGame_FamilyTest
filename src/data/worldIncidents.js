// NIGHTSHIFT D (ChatGPT 18.10 22:50; EVT-01/02/03, WRLD-07, EVT-06) — the LIVING WORLD pilot: regional incidents,
// rules.worldIncidents 'pilot' (OFF in every set; a developer URL ?dev=incidents). ONE travel graph: every closure
// goes through graphEngine.worldBlocks (engine/incidentEngine.js), never a second movement system.
//   kind        'swarm'      exploring one of `places` meets the swarm's species of the rolled rarity (no closure)
//               'closeEdges' the `edges` are closed while it lasts
//               'closeGym'   one gym's challenge is closed while it lasts (the city, its Poké Stop and roads stay open);
//                            the gym is drawn per occurrence from the game's gyms (never one with `unlock.badges`)
//   first       the weeks its first occurrence may START in (drawn once per game from the seed — its own hash
//               stream, no game die); `again` the gap before its one return; `weeks` how long (a number or [min, max])
//   fromStart / until   Snorlax: from week 1 until the world flag is set (the Poké Flute quest — data/questBook.js
//               INCIDENT_QUESTS); catching it is NOT here (DEC-01 / DEC-13: Piotr)
// SAFETY (incidentEngine.safeBlocks): a closure starts only if, with Team Rocket's block of the moment and every other
// incident open, no place of Kanto loses its last road (every gym, Koga, Cinnabar by sea, every quest place, the
// League) — for a player with and without water travel; otherwise it is HELD (it waits, logged) and never cuts.
// The candidate edges each have a road around them: the Underground Paths (the roads above stay), Rock Tunnel's
// south exit (Lavender by Route 8 / 12), Route 11 ↔ 12 (Lavender / Route 12 by Route 8 or Route 13).
// PROVISIONAL content, weeks and places — a pilot for Piotr's review.
export const WORLD_INCIDENTS = {
  pilot: [
    { id: 'beedrill-swarm', kind: 'swarm', places: ['route-7', 'route-8'], species: { common: 'weedle', rare: 'kakuna', superRare: 'beedrill' }, first: [6, 12], weeks: 2, again: [10, 16] },
    { id: 'downpour', kind: 'closeEdges', edges: [['route-5', 'route-6'], ['route-7', 'route-8']], first: [8, 16], weeks: 2, again: [12, 18] },
    { id: 'landslide', kind: 'closeEdges', edges: [['rock-tunnel', 'route-10-south']], first: [10, 20], weeks: 3, again: [14, 22] },
    { id: 'gym-closed', kind: 'closeGym', first: [12, 24], weeks: [1, 2], again: [12, 20] },
    { id: 'snorlax', kind: 'closeEdges', edges: [['route-11', 'route-12']], fromStart: true, until: 'snorlaxAwake' },
  ],
};
