// Build 3.3 E3 — Questbook 2.0 (B33-5 + M02-3; docs/BUILD_3_3_SPEC.md §11.1, Macro 02
// §3). ONE quest engine (engine/questBookEngine.js) for Oak contracts, people's
// quests and — later — Gym Trials (E5). Played only with rules.questBook 'v2'; the
// old two mission cards (rules.quests) stay as they are, next to it.
//
// A definition never changes; a player's attempt at it is an OCCURRENCE
// ('<id>#<n>', engine) with its own progress, credits and payouts.
//   giver    'oak' | 'npc'           — who gives it (the table's token / text)
//   takeAt   'pokeStop' | <place>    — where it can be taken (free)
//   claimAt  'pokeStop' | <place>    — where its reward is collected (free)
//   unlock   { badges }              — from how many badges it is offered
//   repeat   'never' | { cooldownWeeks, maxPerGame }
//   stages   [{ objectives: [...], gives?: { keyItem } }] — in order; the objectives
//            of one stage in any order
//   reward   [{ type: money | pokeballs | <item id> | pokemon (species) | clue, otherwise? }]
//            `otherwise` (rules.bookRewards 'v2'): what the line pays when the game cannot
//            use it — a clue with no hunt to come (EREV-01)
// Objective kinds: visit {place} · explore {place, times} · catch {types?, count} ·
// seeSignature {places} · defeatTrainer {count} · defeatRocket {count} ·
// challenge {place, name, archetype, teams: [tier1, tier2, tier3]} — a guaranteed
// battle at the place („Wyzwanie z misji”), never a random roll · bring {keyItem,
// place} · wait {ownTurns}.
//
// CONTENT IS A PROVISIONAL DEV SAMPLE (7 quests; Macro 02's 12-quest library stays
// in the backlog). The fossil pilot revives the Old Amber at the PEWTER museum —
// the place is open (DEC-09); Cinnabar's lab is not built.
export const QUEST_BOOK = {
  v1: [
    {
      id: 'oak-water', giver: 'oak', takeAt: 'pokeStop', claimAt: 'pokeStop', repeat: { cooldownWeeks: 6, maxPerGame: 2 },
      stages: [{ objectives: [{ kind: 'catch', types: ['water'], count: 2 }, { kind: 'defeatTrainer', count: 2 }] }],
      reward: [{ type: 'ultraball', amount: 1 }, { type: 'money', amount: 3 }],
    },
    {
      id: 'oak-rocket', giver: 'oak', takeAt: 'pokeStop', claimAt: 'pokeStop', repeat: 'never',
      stages: [{ objectives: [{ kind: 'defeatRocket', count: 1 }] }],
      // EREV-01: with no hunt to come (hunts off, or all done / clued) the clue line pays 3 money — PROVISIONAL
      reward: [{ type: 'ultraball', amount: 1 }, { type: 'clue', amount: 1, otherwise: { type: 'money', amount: 3 } }],
    },
    {
      id: 'oak-habitats', giver: 'oak', takeAt: 'pokeStop', claimAt: 'pokeStop', repeat: 'never',
      stages: [{ objectives: [{ kind: 'seeSignature', places: 3 }] }],
      reward: [{ type: 'potion', amount: 1 }, { type: 'superpotion', amount: 1 }],
    },
    {
      id: 'oak-parcel', giver: 'oak', takeAt: 'viridian-city', claimAt: 'pallet-town', repeat: 'never',
      stages: [{ objectives: [{ kind: 'visit', place: 'pallet-town' }] }],
      reward: [{ type: 'pokeballs', amount: 2 }],
    },
    {
      id: 'mt-moon-fossil', giver: 'npc', takeAt: 'pewter-city', claimAt: 'pewter-city', repeat: 'never',
      stages: [
        { objectives: [{ kind: 'explore', place: 'mt-moon', times: 2 }], gives: { keyItem: 'oldAmber' } },
        { objectives: [{ kind: 'bring', keyItem: 'oldAmber', place: 'pewter-city' }] },
        { objectives: [{ kind: 'wait', ownTurns: 2 }] },
      ],
      reward: [{ type: 'pokemon', species: 'aerodactyl' }],
    },
    {
      id: 'nugget-bridge', giver: 'npc', takeAt: 'cerulean-city', claimAt: 'cerulean-city', repeat: 'never', unlock: { badges: 1 },
      stages: [{
        objectives: [{
          kind: 'challenge', place: 'route-24', name: 'Bridge Captain', archetype: 'camper',
          teams: [['rattata', 'pidgey'], ['raticate', 'pidgeotto'], ['raticate', 'pidgeotto', 'primeape']],
        }],
      }],
      reward: [{ type: 'money', amount: 3 }, { type: 'superball', amount: 1 }],
    },
    {
      id: 'vermilion-spark', giver: 'npc', takeAt: 'vermilion-city', claimAt: 'vermilion-city', repeat: 'never',
      stages: [{ objectives: [{ kind: 'catch', types: ['electric'], count: 1 }] }],
      reward: [{ type: 'superpotion', amount: 1 }, { type: 'money', amount: 2 }],
    },
  ],
};

// `lasting` (bonus 14.10): a key item that stays — never handed in by a step, never taken back when a quest is given up.
export const QUEST_BOOK_KEY_ITEMS = { oldAmber: { name: 'Old Amber' }, lostParcel: { name: 'Lost Parcel' }, portLetter: { name: 'Port Letter' }, oldRod: { name: 'Old Rod', lasting: true }, silphData: { name: 'Silph Data' }, fireEgg: { name: 'Fire Egg' }, pokeFlute: { name: 'Poké Flute' }, plantKey: { name: 'Power Plant Key' }, mansionNotes: { name: 'Mansion Notes' }, helixFossil: { name: 'Helix Fossil' }, domeFossil: { name: 'Dome Fossil' } }; // + NIGHTSHIFT C: the Porygon line's disk, Blaine's egg; D: the Poké Flute; NIGHTSHIFT_014 B: the two Mt. Moon fossils

// PLAYTEST_006 C4 — Rare Expeditions (PT006-04), DEV pilot (rules.expeditions 'pilot'; One Kanto: a
// developer URL). The first MEDIUM expedition: a guaranteed ENCOUNTER, the catch is not guaranteed.
//   encounter {place, species}   at the place, while this step is open: „Spotkanie z wyprawy” (1 action, at
//                                most once per own turn per quest) — a wild battle with that species, normal
//                                stats. Done = caught (the Pokémon is the reward: nothing to collect).
//   R2 „Nowy trop”: an encounter that ends any other way (knocked out, fled, run, your team down) sends the
//   step back to ONE Explore at that place; then the encounter is there again — no limit, each retry
//   costs 2 actions. Anti-farm: the opponent's Growth / EXP once per occurrence (growthEngine.creditKey);
//   a wild battle pays no money and no loot; `repeat: 'never'`.
// Scyther, not Aerodactyl: the fossil quest already gives an Aerodactyl (no second Aerodactyl source).
// PROVISIONAL content — the steps, the challenge team and the place are for the family test.
export const EXPEDITIONS = {
  v1: [
    {
      id: 'safari-scyther', giver: 'npc', tier: 'medium', takeAt: 'fuchsia-city', claimAt: 'fuchsia-city', repeat: 'never', rumour: 'opp-scyther', // with rumours on: found as a rumour
      stages: [
        { objectives: [{ kind: 'challenge', place: 'fuchsia-city', name: 'Safari Warden', archetype: 'camper', teams: [['venonat'], ['venonat', 'paras'], ['venomoth', 'parasect']] }] },
        { objectives: [{ kind: 'explore', place: 'safari-zone', times: 2 }, { kind: 'explore', place: 'route-12', times: 1 }] },
        { objectives: [{ kind: 'encounter', place: 'safari-zone', species: 'scyther' }] },
      ],
      reward: [],
    },
  ],
};

// One Kanto day 14.10 (rules.questPack 'day14'; ChatGPT canonical full-day handoff G2) — four quests, each with
// a NEW small step, none a copy of the 7 book quests or the 6 rumour quests:
//   observe {count}                 see `count` species new to the player's Pokédex (wild or a trainer's) since
//                                   taking it — research by looking, not catching (oak-water / vermilion-spark catch)
//   show {types, count, place}      stand at `place` with `count` DIFFERENT species of those types in the team —
//                                   a team to build, not a catch during the quest
//   give {item, count, place}       arrive at `place` holding `count` of an ordinary item: they are handed over —
//                                   spending, not a key item (bring)
//   evolve {count}                  `count` evolutions of the player's Pokémon after taking it — training
// Anti-farm: 'never' or a cooldown + maxPerGame; observe counts only species NEW to the Pokédex (finite), give
// costs more than its reward's shop value minus the Poké Ball / money on top. No RNG softlock: every step is
// reachable by moving, exploring, the shop or training, and a quest can be given up at a Poké Stop. The AI never
// takes them (aiEngine: it does not plan these steps). PROVISIONAL content and rewards.
export const QUEST_PACK = {
  day14: [
    {
      id: 'oak-field-research', pack: 'day14', giver: 'oak', takeAt: 'pokeStop', claimAt: 'pokeStop', repeat: { cooldownWeeks: 4, maxPerGame: 2 },
      stages: [{ objectives: [{ kind: 'observe', count: 3 }] }],
      reward: [{ type: 'money', amount: 3 }, { type: 'pokeballs', amount: 1 }],
    },
    {
      id: 'sailor-water-show', pack: 'day14', giver: 'npc', takeAt: 'cerulean-city', claimAt: 'vermilion-city', repeat: 'never',
      stages: [{ objectives: [{ kind: 'show', types: ['water'], count: 2, place: 'vermilion-city' }] }],
      reward: [{ type: 'superball', amount: 1 }, { type: 'money', amount: 2 }],
    },
    {
      id: 'tower-potions', pack: 'day14', giver: 'npc', takeAt: 'saffron-city', claimAt: 'lavender-town', repeat: 'never',
      stages: [{ objectives: [{ kind: 'give', item: 'potion', count: 2, place: 'lavender-town' }] }],
      reward: [{ type: 'revive', amount: 1 }, { type: 'money', amount: 2 }],
    },
    {
      id: 'celadon-evolution', pack: 'day14', giver: 'npc', takeAt: 'celadon-city', claimAt: 'celadon-city', repeat: 'never',
      stages: [{ objectives: [{ kind: 'evolve', count: 1 }] }],
      reward: [{ type: 'leafstone', amount: 1 }, { type: 'money', amount: 2 }],
    },
  ],
};

// PLAYTEST_006 C5 — the quests of the Rumours pilot (data/rumours.js OPPORTUNITIES): taken only by a player
// for whom its opportunity is open (rumourEngine.rumourOpenFor) — heard at a Poké Stop, or found at the start
// place. Existing steps only (visit / explore / challenge / bring / wait). PROVISIONAL content and rewards.
export const RUMOUR_QUESTS = {
  v1: [
    {
      id: 'viridian-parcel', rumour: 'opp-parcel', giver: 'npc', takeAt: 'viridian-city', claimAt: 'pewter-city', repeat: 'never',
      stages: [
        { objectives: [{ kind: 'explore', place: 'viridian-city', times: 1 }], gives: { keyItem: 'lostParcel' } }, // find it
        { objectives: [{ kind: 'bring', keyItem: 'lostParcel', place: 'pewter-city' }] },
      ],
      reward: [{ type: 'money', amount: 2 }, { type: 'potion', amount: 1 }],
    },
    {
      id: 'vermilion-courier', rumour: 'opp-courier', giver: 'npc', takeAt: 'vermilion-city', claimAt: 'saffron-city', repeat: 'never',
      stages: [
        { objectives: [{ kind: 'explore', place: 'vermilion-city', times: 1 }], gives: { keyItem: 'portLetter' } }, // find the sailor
        { objectives: [{ kind: 'bring', keyItem: 'portLetter', place: 'saffron-city' }] },
      ],
      reward: [{ type: 'superball', amount: 1 }],
    },
    {
      id: 'bill-teleporter', rumour: 'opp-bill', giver: 'npc', takeAt: 'bills-cottage', claimAt: 'bills-cottage', repeat: 'never',
      stages: [
        { objectives: [{ kind: 'explore', place: 'route-25', times: 1 }] },
        { objectives: [{ kind: 'visit', place: 'bills-cottage' }] },
        { objectives: [{ kind: 'wait', ownTurns: 1 }] },
      ],
      reward: [{ type: 'money', amount: 2 }, { type: 'superpotion', amount: 1 }],
    },
    {
      id: 'power-plant-fault', rumour: 'opp-power-plant', giver: 'npc', takeAt: 'power-plant', claimAt: 'power-plant', repeat: 'never',
      stages: [{
        objectives: [
          { kind: 'explore', place: 'power-plant', times: 1 },
          { kind: 'challenge', place: 'power-plant', name: 'Engineer', archetype: 'scientist', teams: [['voltorb'], ['voltorb', 'magnemite'], ['electrode', 'magneton']] },
        ],
      }],
      reward: [{ type: 'thunderstone', amount: 1 }, { type: 'money', amount: 2 }],
    },
    {
      id: 'lavender-fog', rumour: 'opp-lavender', giver: 'npc', takeAt: 'lavender-town', claimAt: 'lavender-town', repeat: 'never',
      stages: [{
        objectives: [
          { kind: 'explore', place: 'lavender-town', times: 2 },
          { kind: 'challenge', place: 'lavender-town', name: 'Channeler', archetype: 'channeler', teams: [['gastly'], ['gastly', 'gastly'], ['haunter', 'gastly']] },
        ],
      }],
      reward: [{ type: 'revive', amount: 1 }, { type: 'money', amount: 2 }],
    },
    {
      id: 'celadon-rocket', rumour: 'opp-celadon-rocket', giver: 'npc', takeAt: 'celadon-city', claimAt: 'celadon-city', repeat: 'never',
      stages: [{
        objectives: [{ kind: 'challenge', place: 'celadon-city', name: 'Game Corner Rocket', archetype: 'jessie', teams: [['ekans', 'koffing'], ['arbok', 'koffing'], ['arbok', 'weezing']] }],
      }],
      reward: [{ type: 'ultraball', amount: 1 }, { type: 'money', amount: 3 }],
    },
  ],
};

// NIGHTSHIFT C (ChatGPT 18.10 22:50; rules.epicQuests 'v1', with rules.roster 'kanto151') — EPIC LINES: six long quest
// lines through the one Quest Book (and the Expedition step), each with a unique Pokémon (data/pokemon.js `obtain`).
// Existing steps only (catch / defeatTrainer / challenge / explore / bring / show / give / wait / encounter); every
// mandatory step is reachable by moving, the shop or training — never a random event, a die, an expiring rumour or a
// legend (so the lines are IN THE BOOK at their place, not found as rumours: a rumour closes). `repeat: 'never'`, a
// claim pays once (by line index), a challenge's Growth / EXP once per occurrence (the book's anti-farm); a full team
// sends the Pokémon to the reserve. They sit in the special slot (`special`: no limit in these sets). New fields, read
// only by questBookEngine:
//   epic       'v1' — an epic line: the AI leaves it to the family (aiEngine; AI v2e frozen — it plans no new line)
//   exclusive  a group: a player may take only ONE quest of it (the Dojo: Hitmonlee OR Hitmonchan — given up = free
//              again); another player's choice does not matter (each player's own Dojo visit)
// Ognisty ogon needs Cinnabar Island (by sea: the Soul Badge — always within reach, never a die). Not here (backlog):
// Mr. Mime / Jynx trades, Ditto, the fossils; Śpiący Snorlax is NIGHTSHIFT D (INCIDENT_QUESTS). PROVISIONAL content,
// teams and rewards — for Piotr's review.
const DOJO_STAGES = [
  { objectives: [{ kind: 'defeatTrainer', count: 2 }] }, // training on the road
  { objectives: [{ kind: 'challenge', place: 'saffron-city', name: 'Karate Master', archetype: 'hiker', teams: [['mankey', 'machop'], ['primeape', 'machoke'], ['primeape', 'machoke', 'machamp']] }] },
];
export const EPIC_QUESTS = {
  v1: [
    {
      id: 'epic-charizard', epic: 'v1', special: true, giver: 'oak', takeAt: 'pallet-town', claimAt: 'pallet-town', repeat: 'never', unlock: { badges: 4 },
      stages: [
        { objectives: [{ kind: 'catch', types: ['fire'], count: 1 }] }, // the trail of fire Pokémon
        { objectives: [{ kind: 'defeatTrainer', count: 3 }] }, // battles with different trainers
        { objectives: [{ kind: 'challenge', place: 'cinnabar-island', name: "Blaine's Quiz", archetype: 'scientist', teams: [['vulpix', 'growlithe'], ['ninetales', 'rapidash'], ['ninetales', 'rapidash', 'arcanine']] }], gives: { keyItem: 'fireEgg' } }, // Blaine's trial
        { objectives: [{ kind: 'bring', keyItem: 'fireEgg', place: 'pallet-town' }] }, // to Oak's lab
        { objectives: [{ kind: 'wait', ownTurns: 2 }] }, // Oak's research
      ],
      reward: [{ type: 'pokemon', species: 'charizard' }],
    },
    {
      id: 'epic-venusaur', epic: 'v1', special: true, giver: 'npc', takeAt: 'celadon-city', claimAt: 'celadon-city', repeat: 'never', unlock: { badges: 3 },
      stages: [
        { objectives: [{ kind: 'show', types: ['grass'], count: 2, place: 'celadon-city' }] }, // a Grass Pokédex for Erika
        { objectives: [{ kind: 'challenge', place: 'celadon-city', name: "Erika's Gardener", archetype: 'picnicker', teams: [['oddish', 'bellsprout'], ['gloom', 'weepinbell'], ['gloom', 'weepinbell', 'tangela']] }] },
        { objectives: [{ kind: 'give', item: 'leafstone', count: 1, place: 'celadon-city' }] }, // a Leaf Stone for the garden (Celadon's shop sells it)
        { objectives: [{ kind: 'wait', ownTurns: 2 }] },
      ],
      reward: [{ type: 'pokemon', species: 'venusaur' }],
    },
    { id: 'epic-dojo-lee', epic: 'v1', special: true, exclusive: 'dojo', giver: 'npc', takeAt: 'saffron-city', claimAt: 'saffron-city', repeat: 'never', unlock: { badges: 2 }, stages: DOJO_STAGES, reward: [{ type: 'pokemon', species: 'hitmonlee' }] },
    { id: 'epic-dojo-chan', epic: 'v1', special: true, exclusive: 'dojo', giver: 'npc', takeAt: 'saffron-city', claimAt: 'saffron-city', repeat: 'never', unlock: { badges: 2 }, stages: DOJO_STAGES, reward: [{ type: 'pokemon', species: 'hitmonchan' }] },
    {
      id: 'epic-porygon', epic: 'v1', special: true, giver: 'npc', takeAt: 'celadon-city', claimAt: 'celadon-city', repeat: 'never', unlock: { badges: 3 },
      stages: [
        { objectives: [{ kind: 'explore', place: 'saffron-city', times: 1 }], gives: { keyItem: 'silphData' } }, // the disk, in Silph Co.
        { objectives: [{ kind: 'challenge', place: 'saffron-city', name: 'Silph Scientist', archetype: 'scientist', teams: [['magnemite'], ['magnemite', 'voltorb'], ['magneton', 'electrode']] }] },
        { objectives: [{ kind: 'bring', keyItem: 'silphData', place: 'celadon-city' }] },
        { objectives: [{ kind: 'wait', ownTurns: 1 }] }, // the program runs
      ],
      reward: [{ type: 'pokemon', species: 'porygon' }],
    },
    {
      id: 'epic-dratini', epic: 'v1', special: true, giver: 'npc', takeAt: 'fuchsia-city', claimAt: 'fuchsia-city', repeat: 'never', unlock: { badges: 4 },
      stages: [
        { objectives: [{ kind: 'explore', place: 'safari-zone', times: 2 }] },
        { objectives: [{ kind: 'challenge', place: 'safari-zone', name: 'Dragon Fisherman', archetype: 'fisherman', teams: [['magikarp', 'goldeen'], ['seaking', 'horsea'], ['seaking', 'seadra', 'gyarados']] }] },
        { objectives: [{ kind: 'encounter', place: 'safari-zone', species: 'dratini' }] }, // the Expedition step: caught = the Pokémon (not guaranteed; a new trail after a miss)
      ],
      reward: [{ type: 'money', amount: 2 }],
    },
    {
      id: 'epic-lapras', epic: 'v1', special: true, giver: 'npc', takeAt: 'saffron-city', claimAt: 'vermilion-city', repeat: 'never', unlock: { badges: 4 },
      stages: [
        { objectives: [{ kind: 'challenge', place: 'saffron-city', name: 'Rocket Grunt', archetype: 'jessie', teams: [['ekans', 'zubat'], ['ekans', 'koffing', 'zubat'], ['arbok', 'weezing']] }] }, // the defence of Silph Co.
        { objectives: [{ kind: 'challenge', place: 'saffron-city', name: 'Rocket Admin', archetype: 'james', teams: [['koffing', 'ekans'], ['weezing', 'arbok'], ['weezing', 'arbok', 'golbat']] }] },
        { objectives: [{ kind: 'explore', place: 'vermilion-city', times: 1 }] }, // the port: Silph's ship brings it
      ],
      reward: [{ type: 'pokemon', species: 'lapras' }],
    },
  ],
};

// NIGHTSHIFT_014 B (ChatGPT 19.10 23:30; rules.obtain151 'player' / 'world' — a PROTOTYPE, OFF in every set; ?dev=obtain151 /
// obtain151w): a way to each of the 7 species the full Pokédex had none for — Omanyte / Kabuto (and so Omastar / Kabutops by
// Growth), Ditto, Mr. Mime, Jynx. Existing steps only (challenge / bring / wait / show / explore / encounter) — no new
// mechanic, no Trading 2.0, no Transform. Each `repeat: 'never'`, a claim pays once; an `encounter` step is a catch
// attempt (not a gift — a miss opens a new trail, like the Dratini line). `epic: 'v1'`: the AI leaves them to the family
// (AI v2e frozen — it plans no new line). The Old Amber quest (mt-moon-fossil → Aerodactyl) stays as it is.
//   exclusive 'fossil'  one fossil per player (Helix OR Dome — canon: the Super Nerd's choice in Mt. Moon)
//   worldUnique         with rules.obtain151 'world' only: each fossil ONCE in the world — taken by one player, it is not
//                       offered to the others (given up: free again); 'player': every player may have their own
// Mr. Mime and Jynx: VARIANT A (a challenge of showing + an encounter); variant B (an NPC trade — give your Abra /
// Poliwhirl) is NOT built: it needs a new „give a Pokémon” step (docs/design/NIGHTSHIFT014_OBTAIN151.md).
// PROVISIONAL places, teams and badges — for Piotr's review.
const FOSSIL_STAGES = (keyItem) => [
  { objectives: [{ kind: 'challenge', place: 'mt-moon', name: 'Super Nerd', archetype: 'scientist', teams: [['grimer', 'koffing'], ['grimer', 'koffing', 'voltorb'], ['muk', 'weezing', 'electrode']] }], gives: { keyItem } }, // he guards the fossils
  { objectives: [{ kind: 'bring', keyItem, place: 'pewter-city' }] }, // the Museum of Science
  { objectives: [{ kind: 'wait', ownTurns: 2 }] }, // the revival
];
export const OBTAIN151_QUESTS = {
  v1: [
    { id: 'fossil-helix', epic: 'v1', special: true, exclusive: 'fossil', worldUnique: true, giver: 'npc', takeAt: 'pewter-city', claimAt: 'pewter-city', repeat: 'never', unlock: { badges: 1 }, stages: FOSSIL_STAGES('helixFossil'), reward: [{ type: 'pokemon', species: 'omanyte' }] },
    { id: 'fossil-dome', epic: 'v1', special: true, exclusive: 'fossil', worldUnique: true, giver: 'npc', takeAt: 'pewter-city', claimAt: 'pewter-city', repeat: 'never', unlock: { badges: 1 }, stages: FOSSIL_STAGES('domeFossil'), reward: [{ type: 'pokemon', species: 'kabuto' }] },
    {
      id: 'ditto-mansion', epic: 'v1', special: true, giver: 'npc', takeAt: 'cinnabar-island', claimAt: 'cinnabar-island', repeat: 'never', unlock: { badges: 5 },
      stages: [
        { objectives: [{ kind: 'explore', place: 'cinnabar-island', times: 2 }] }, // the burned Mansion: something copies the Pokémon
        { objectives: [{ kind: 'encounter', place: 'cinnabar-island', species: 'ditto' }] }, // a catch attempt (a miss: a new trail)
      ],
      reward: [{ type: 'money', amount: 2 }],
    },
    {
      id: 'mime-route2', epic: 'v1', special: true, giver: 'npc', takeAt: 'route-2', claimAt: 'route-2', repeat: 'never', unlock: { badges: 2 },
      stages: [
        { objectives: [{ kind: 'show', types: ['psychic'], count: 1, place: 'route-2' }] }, // the boy wanted an Abra: show him a Psychic Pokémon
        { objectives: [{ kind: 'encounter', place: 'route-2', species: 'mrmime' }] }, // the mime in the grass
      ],
      reward: [{ type: 'money', amount: 2 }],
    },
    {
      id: 'jynx-seafoam', epic: 'v1', special: true, giver: 'npc', takeAt: 'cerulean-city', claimAt: 'seafoam-islands', repeat: 'never', unlock: { badges: 3 },
      stages: [
        { objectives: [{ kind: 'show', types: ['water'], count: 2, place: 'cerulean-city' }] }, // the girl wanted a Poliwhirl: show her Water Pokémon
        { objectives: [{ kind: 'explore', place: 'seafoam-islands', times: 1 }] }, // a song in the icy caves
        { objectives: [{ kind: 'encounter', place: 'seafoam-islands', species: 'jynx' }] },
      ],
      reward: [{ type: 'money', amount: 2 }],
    },
  ],
};

// NIGHTSHIFT D (rules.worldIncidents 'pilot' — only with the living world): „Śpiący Snorlax” (PT006 Q4). Snorlax sleeps
// on Route 11 ↔ 12 from week 1 (data/worldIncidents.js); Mr. Fuji in Lavender gives the Poké Flute after the Tower's
// Rockets, and the flute played on Route 12 wakes it: the road opens for EVERY player (a world flag). Catching Snorlax is
// not here — DEC-01 / DEC-13 (Piotr): it walks away. `world`: the flag that ends the quest's offer for everyone.
export const INCIDENT_QUESTS = {
  pilot: [
    {
      id: 'epic-snorlax', epic: 'v1', world: 'snorlaxAwake', giver: 'npc', takeAt: 'lavender-town', claimAt: 'route-12', repeat: 'never',
      stages: [
        { objectives: [{ kind: 'explore', place: 'lavender-town', times: 1 }] }, // the Pokémon Tower
        { objectives: [{ kind: 'challenge', place: 'lavender-town', name: 'Tower Rocket', archetype: 'jessie', teams: [['zubat', 'ekans'], ['golbat', 'arbok'], ['golbat', 'arbok', 'weezing']] }], gives: { keyItem: 'pokeFlute' } }, // Mr. Fuji is free
        { objectives: [{ kind: 'bring', keyItem: 'pokeFlute', place: 'route-12' }] },
      ],
      reward: [{ type: 'worldFlag', flag: 'snorlaxAwake' }, { type: 'money', amount: 3 }],
    },
  ],
};

// NIGHTSHIFT E (rules.legendStory 'v1' — a PROTOTYPE, OFF in every set; ?dev=legends): the first two legends as STORY
// lines with an INACTIVE end. Zapdos — „Elektryczna burza” (docs/PHASE_3B_MACRO_02.md §11.1, stages 1–4); Mewtwo —
// „Notatki z Cinnabar” (§11.5): the trail to the Unknown Dungeon. The last step (the legendary encounter, a catch, an
// owner) is NOT in the game: the claim pays `storyEnd` — words only, no Pokémon, no item — until Piotr decides
// DEC-01 (one per world / per player, consolation) and DEC-13 (play on after the Champion). Never a random spawn.
//   unlock.orWeek   offered from this week even without the badges (§11.1: „from week 8 or 3 gym badges”)
//   badge {gym}     a step done while the player holds that gym's badge (§11.1 stage 3: Lt. Surge's key)
// The Zapdos trail (stages 1–3) — the same in the story line ('v1') and the legend line ('v2').
const ZAPDOS_TRAIL = [
  { objectives: [{ kind: 'explore', place: 'route-10-north', times: 2 }] }, // the storm's traces
  { objectives: [{ kind: 'visit', place: 'vermilion-city' }, { kind: 'badge', gym: 'vermilion' }], gives: { keyItem: 'plantKey' } }, // Lt. Surge's key
  { objectives: [{ kind: 'bring', keyItem: 'plantKey', place: 'power-plant' }, { kind: 'challenge', place: 'power-plant', name: 'Plant Guardians', archetype: 'scientist', teams: [['voltorb', 'voltorb'], ['electrode', 'voltorb'], ['electrode', 'electrode']] }] },
];
export const STORY_QUESTS = {
  v1: [
    {
      id: 'story-zapdos', epic: 'v1', special: true, legend: 'zapdos', giver: 'npc', takeAt: 'cerulean-city', claimAt: 'power-plant', repeat: 'never', unlock: { badges: 3, orWeek: 8 },
      stages: ZAPDOS_TRAIL,
      reward: [{ type: 'storyEnd', legend: 'zapdos' }],
    },
    {
      id: 'story-mewtwo', epic: 'v1', special: true, legend: 'mewtwo', giver: 'npc', takeAt: 'cinnabar-island', claimAt: 'unknown-dungeon', repeat: 'never', unlock: { badges: 5 },
      stages: [
        { objectives: [{ kind: 'explore', place: 'cinnabar-island', times: 1 }], gives: { keyItem: 'mansionNotes' } }, // the Mansion's diary
        { objectives: [{ kind: 'challenge', place: 'cinnabar-island', name: 'Mansion Scientist', archetype: 'scientist', teams: [['grimer', 'koffing'], ['muk', 'weezing'], ['muk', 'weezing', 'magmar']] }] },
        { objectives: [{ kind: 'bring', keyItem: 'mansionNotes', place: 'pallet-town' }] }, // to Professor Oak
        { objectives: [{ kind: 'wait', ownTurns: 2 }] }, // Oak reads them
        { objectives: [{ kind: 'visit', place: 'unknown-dungeon' }] }, // the cave's entrance — the trail ends here
      ],
      reward: [{ type: 'storyEnd', legend: 'mewtwo' }],
    },
  ],
  // DEC-01 (Piotr 20.10, ChatGPT 10:49 — rules.legendStory 'v2', a DEV pilot, OFF in every set; ?dev=legends2): the Zapdos
  // line with its END: after the trail, Zapdos waits in the Power Plant (an `encounter` step with `legend: true` —
  // engine/legendEngine.js): Ultra Ball only, never gone after a lost battle, one per world. Its reward is the Pokémon
  // caught (the occurrence closes on the catch, like an expedition). Mewtwo keeps its 'v1' line, inactive end (DEC-13 open).
  v2: [
    {
      id: 'legend-zapdos', epic: 'v1', special: true, legend: 'zapdos', giver: 'npc', takeAt: 'cerulean-city', claimAt: 'power-plant', repeat: 'never', unlock: { badges: 3, orWeek: 8 },
      stages: [...ZAPDOS_TRAIL, { objectives: [{ kind: 'encounter', place: 'power-plant', species: 'zapdos', legend: true }] }],
      reward: [],
    },
  ],
};
