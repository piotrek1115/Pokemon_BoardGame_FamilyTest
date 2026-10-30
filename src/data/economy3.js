// Build 3.3 E2 — Economy 3.0 (B33-4, docs/BUILD_3_3_SPEC.md §12). Every number and
// list here is PROVISIONAL dev content behind its own rule switch; older games
// never read it.
//
// rules.shopStock 'regional': what a Poké Stop sells depends on the city. Every
// Stop keeps the basics; a few add their own (Celadon's Department Store —
// the stones, Silph Co. in Saffron and the League's Stop — Ultra Balls). The
// Moon Stone is never sold here (DEC-19 open: Pewter's gym and Hikers' loot are
// its sources in this candidate). Older games: the same stock everywhere.
export const SHOP_STOCK = {
  regional: {
    base: ['pokeball', 'superball', 'potion', 'superpotion', 'revive'],
    extra: {
      'celadon-city': ['firestone', 'waterstone', 'thunderstone', 'leafstone', 'ultraball'],
      'saffron-city': ['ultraball'],
      'indigo-plateau': ['ultraball'],
    },
  },
};

// rules.loot 'v1': after a won battle with a random trainer that pays (not at an
// exhausted place), a loot d6. 1–4 nothing; 5 a Poké Ball; 6 the trainer class's
// item. At a tired place only a 6 counts. Stones from loot: at most
// `stoneCap` per player per game (the ledger in player.loot).
// EREV — stone sources, a MEASUREMENT switch (rules.stoneSources; DEV stays false = the
// regional shops alone). PROVISIONAL places, faces and caps:
//   'explore' (B) an Explore at a stone place (not exhausted) rolls a stone d6 on its own
//                 stream: a 6 finds the place's stone — once per player per place;
//   'quests'  (C) five quest-book quests pay a stone as an extra line;
//   'mixed'   (D) both, limited: at most `mixedFindCap` finds per player, and a quest's
//                 stone only the first time that quest is collected.
export const STONE_SOURCES = {
  finds: { 'mt-moon': 'moonstone', 'power-plant': 'thunderstone', 'route-24': 'waterstone', 'safari-zone': 'leafstone', 'route-8': 'firestone' },
  findFace: 6,
  mixedFindCap: 2,
  questStones: { 'oak-water': 'waterstone', 'vermilion-spark': 'thunderstone', 'oak-habitats': 'leafstone', 'nugget-bridge': 'firestone', 'mt-moon-fossil': 'moonstone' },
  // KANTO WORLD DISTRIBUTION (ChatGPT 25.10 §3; rules.stoneSources 'kanto' — a DEV pilot, OFF in every set; ?dev=stones):
  // „kamienie leżą tam, gdzie pasują”. Celadon's Department Store keeps its four (SHOP_STOCK.regional, unchanged); Cerulean
  // sells the Water Stone and Vermilion the Thunder Stone (💰5 as everywhere); every stone has places where a player's
  // Explore (not at an exhausted place) surely FINDS one — no die — once per stone per player and at most `findCap`
  // finds per player per game (a found stone is like any other: kept, used, sold for 💰2). Gym rewards, trainers' loot and
  // the quests stay as they are. Fire: Route 8 and Cinnabar (no Poké Stop there in these sets); Moon: Mt. Moon (the gym
  // and the Hikers as before — still never sold). PROVISIONAL places and cap.
  kanto: {
    shops: { 'cerulean-city': ['waterstone'], 'vermilion-city': ['thunderstone'] },
    finds: { moonstone: ['mt-moon'], thunderstone: ['power-plant'], firestone: ['route-8', 'cinnabar-island'], leafstone: ['route-2', 'safari-zone'], waterstone: ['route-24', 'route-25'] },
    findCap: 2,
  },
  // KANTO WORLD re-review 25.10 DEC-4 (rules.stoneShops 's1' — a DEV pilot, OFF in every set; ?dev=stoneshops): two more
  // shops, measured APART from the finds (stoneSources): Fuchsia sells the Leaf Stone (the Safari's town), Cinnabar the Fire
  // Stone — only where a Poké Stop stands (Cinnabar's with pokeStops 'v2c', ?dev=cinnabar). 💰5 as everywhere; the Moon
  // Stone still never sold. A variant to measure, never switched on by itself.
  shops: { s1: { 'fuchsia-city': ['leafstone'], 'cinnabar-island': ['firestone'] } },
};

export const TRAINER_LOOT = {
  v1: {
    common: 'pokeball',
    byClass: {
      hiker: 'moonstone', camper: 'firestone', scientist: 'thunderstone',
      swimmer: 'superpotion', fisherman: 'superpotion', biker: 'superpotion',
      sailor: 'potion', lass: 'potion', picnicker: 'potion',
      youngster: 'pokeball', 'bug-catcher': 'pokeball',
      psychic: 'revive', channeler: 'revive', 'bird-keeper': 'superball',
    },
    stoneCap: 2,
  },
};

// COMBAT 2.1 (rules.statusRules 'c21', Piotr 16.10 — PROVISIONAL BALANCE): the cure items' prices and where they are
// sold. The Antidote everywhere (poison is the status that stays after a battle); the battle-only cures in a few cities,
// so carrying one is a choice; the Full Heal in the two big shops. A Potion heals HP only in these games.
export const CURE_ITEMS = {
  prices: { antidote: 1, burnheal: 1, paralyzeheal: 1, awakening: 1, fullheal: 3 },
  base: ['antidote'],
  extra: {
    'celadon-city': ['burnheal', 'paralyzeheal', 'awakening', 'fullheal'],
    'saffron-city': ['paralyzeheal', 'fullheal'],
    'vermilion-city': ['paralyzeheal'],
    'cerulean-city': ['awakening'],
    'lavender-town': ['awakening'],
    'fuchsia-city': ['burnheal'],
    'cinnabar-island': ['burnheal'],
    'indigo-plateau': ['fullheal'],
  },
};
