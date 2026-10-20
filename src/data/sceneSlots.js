// NIGHTSHIFT_014 C (ChatGPT 19.10 23:30) — 14 picture SLOTS for Piotr's own art (the Studio's „Ilustracje kart”, two tabs
// of ONE numbered series 01–14: a GRID 01 of 10 panels, a GRID 02 of 4 + six white fields). No picture is made here —
// each slot starts EMPTY (BRAKUJE) and the game shows its card as today until Piotr saves one.
//   STORY_SLOTS     the 9 story lines: one picture per LINE, shown on its quest's card (the Journal, the quest's moments)
//                   — data/sceneArt.js sceneArtFor('quest', id) falls back to the line's slot (the Dojo: one picture for
//                   its two quests). Snorlax's story (the Poké Flute quest) is `epic-snorlax`…
//   INCIDENT_SLOTS  the 5 world incidents (data/worldIncidents.js ids): shown on the incident's world notice (pilot only)
//                   — …and Snorlax on the road is the incident `snorlax`: two contexts, two slots, two artIds
//                   (story-epic-snorlax / inc-snorlax), never one picture by accident.
// The ids are the game's own; the LK 2.0 archetype slots and the world moments (quiet / poison) stay as they are.
export const STORY_SLOTS = Object.freeze([
  Object.freeze({ id: 'epic-charizard', name: 'Ognisty ogon', quests: Object.freeze(['epic-charizard']) }),
  Object.freeze({ id: 'epic-venusaur', name: 'Ogród Eriki', quests: Object.freeze(['epic-venusaur']) }),
  Object.freeze({ id: 'epic-dojo', name: 'Mistrz Dojo', quests: Object.freeze(['epic-dojo-lee', 'epic-dojo-chan']) }),
  Object.freeze({ id: 'epic-porygon', name: 'Sztuczny Pokémon (Porygon)', quests: Object.freeze(['epic-porygon']) }),
  Object.freeze({ id: 'epic-dratini', name: 'Smoczy szlak', quests: Object.freeze(['epic-dratini']) }),
  Object.freeze({ id: 'epic-lapras', name: 'Dar z Silph Co.', quests: Object.freeze(['epic-lapras']) }),
  Object.freeze({ id: 'epic-snorlax', name: 'Śpiący Snorlax — zadanie z Poké Flute', quests: Object.freeze(['epic-snorlax']) }),
  Object.freeze({ id: 'story-zapdos', name: 'Zapdos — Elektryczna burza', quests: Object.freeze(['story-zapdos', 'legend-zapdos']) }), // + DEC-01's line (pilot)
  Object.freeze({ id: 'story-mewtwo', name: 'Mewtwo — Notatki z Cinnabar', quests: Object.freeze(['story-mewtwo']) }),
]);
export const INCIDENT_SLOTS = Object.freeze([
  Object.freeze({ id: 'beedrill-swarm', name: 'Rój Beedrilli' }),
  Object.freeze({ id: 'downpour', name: 'Ulewa nad Kanto' }),
  Object.freeze({ id: 'landslide', name: 'Osuwisko' }),
  Object.freeze({ id: 'gym-closed', name: 'Sala w remoncie' }),
  Object.freeze({ id: 'snorlax', name: 'Snorlax na drodze (trasa 11 ↔ 12)' }),
]);
// quest id → its story slot
export const STORY_SLOT_OF = Object.freeze(Object.fromEntries(STORY_SLOTS.flatMap((s) => s.quests.map((q) => [q, s.id]))));
