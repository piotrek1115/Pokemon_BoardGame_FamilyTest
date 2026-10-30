// Phase 3 rule switches (docs/PHASE_3_POST_PLAYTEST_REDESIGN.md).
//
// Every rule Phase 3A changes sits behind one switch in CONFIG.rules. A game
// keeps the switches it was created with (they live in state.config), so a game
// started before a change plays on exactly as it began. Saves from before Phase
// 3 (schema 12) are migrated to the 'phase2' ruleset below: the Phase 2 game,
// byte for byte. The simulator's Phase 2 baseline uses the same ruleset
// (`npm run simulate -- --rules phase2`).
//
// Each 3A slice that implements a rule adds its value to SUPPORTED and flips
// the switch in CONFIG.rules for new games; PHASE2_RULES never changes.
//
// Gameplay P1 (schema 15; DQ-89…95) adds seven switches, the wild-encounter
// slice (09.10.2026) an eighth: wildTemperament. Every save made
// before schema 15 — a Phase 2 game or a Build 2 game — gets them at their old
// values (P1_OFF) when it loads, so it plays on exactly as it began; only new
// games get Gameplay P1.
//
// Phase 3B Macro 01 (10.10.2026, after the Build 3.0 family playtest) adds five
// switches — pokeStops, oakJobs, oakKit, catchDice, explorePools. A Build 3.0
// save (schema 16) has none of them: it gets their old values (M01_OFF, the
// same as PHASE2_RULES) when it loads and plays on exactly as it began; only
// new games get Macro 01. No schema bump: the new state (Oak's jobs, the
// emergency kit) exists only in games created with the switches on.
//
// Playtest 004 (11.10.2026, after the family's Build 3.1 game) adds two switches
// — evolutionGrowth, leadPick — and a third value of growthFainted ('battle').
// A Build 3.1 save has none of the new switches and growthFainted false: it
// gets PT4_OFF when it loads and plays on exactly as it began (its thresholds,
// its Growth, no lead pick); only new games get Playtest 004. No schema bump.
//
// Phase 3B Macro 02 slice M02-1 (12.10.2026) adds one switch — localPools ('v2'
// explicit per-place pools with the signature guarantee). An older save gets
// M021_OFF (biome pools). Content is NOT versioned (Piotr, 12.10 10:28: every
// family test starts a new game): the 55 new species are in every game's
// biome pools and trainer teams too, so an older save plays on with them.
// No schema bump.
//
// Slice M02-2 (12.10.2026) adds one switch — fatigue (exploration fatigue per
// player × place, engine/fatigueEngine.js) — and new games turn Vigilance off:
// fatigue takes its Catch Die step (§6.6). An older save has no fatigue switch
// and gets false; its Vigilance stays what it stored. No schema bump: the
// counters exist only in games created with the switch on.
//
// Build 3.3 (PLAYTEST_005, docs/BUILD_3_3_SPEC.md; Piotr's decisions 13.10.2026)
// adds switches slice by slice; every one is off in an older save (B33_OFF), so a
// Build 3.2 game plays on exactly as it began. Stage 1 (B33-1 combat):
// battleTempo ('v2': a healing item in battle costs the exchange and the
// opponent answers — no per-Pokémon cap, DEC-16 B), rocketMeowth ('always':
// Meowth fights with Jessie and James in every Rocket battle, DEC-15 M1),
// initiative ('fsB': First Strike „Szybkie wejście”, DEC-12). Stage 2 (A1
// sandbox foundations): starts ('character': Ash / Gary Pallet, Brock Pewter,
// Misty Cerulean), hometownGym (Brock's / Misty's first badge elsewhere — the
// gymUnlock credential), travelGraph ('v2': mission routing through the one
// effective graph, AUD-03). Stage 3 (B33-3): gymChallenge ('v2': a gym is a
// chain of gym trainer(s) → leader in one challenge, CONFIG.gyms.chainTrainers
// PROVISIONAL) and leagueChallenge ('v2': Lorelei → Bruno → Agatha → Lance, a
// full reset on a loss or exit, the ribbon never skips). Stage 4: rest 'v3'
// (Rest +2 on one chosen non-fainted Pokémon, 1 action; Build 3.2 keeps 'v2' = +1 —
// the value every Build 3.2 save stores). Correction batch (13.10): growthCredits
// (a gym / League opponent pays its Growth once per player, across attempts —
// no farming through resets). No schema bump.

// Every switch at the value the game had before Phase 3A.
export const PHASE2_RULES = Object.freeze({
  ruleset: 'phase2', // label only: which rules this game was started under
  evolution: 'stars', // 'stars': shared Evolution Stars (DQ-22 / DQ-35) → 3A-1 'growth' per Pokémon (DQ-74…79)
  questRewards: 'v1', // data/quests.js reward set → 3A-1 'v2' without ⭐ (DQ-87)
  counterattackOnStay: false, // 3A-2: a wild Pokémon that stays after a failed throw strikes back (DQ-80)
  battleItems: false, // 3A-2: Potion / Revive replace the attack in battle (DQ-81)
  trainerRetreat: false, // 3A-2: run from a trainer battle with a light penalty (DQ-82)
  gymRoster: 'v1', // data/gyms.js gym rosters (1/2/2) → 3A-3 'v2' (2/3/3, DQ-44 / DQ-83)
  gymReward: 'v1', // badge + money (+ ⭐ with stars) → 3A-3 'v2': + one thematic item (DQ-83)
  leagueRoster: 'v1', // data/gyms.js League teams → 3A-3 'v2' (Elite Four ≥ tier-3 gyms, DQ-83)
  rocketMobility: 'v1', // plots stay until beaten → 3A-4 'v2': plot age, escape and relocation (DQ-84)
  travelNetwork: 'v1', // the canonical map edges → 3A-5 'v2': + Underground Paths Route 5 ↔ 6 and 7 ↔ 8 (DQ-85)
  pokeStop: 'v1', // 1 action: full heal + the shop → P1 'v2': Leczenie and Sklep, 1 action each (DQ-89)
  rest: 'v1', // Rest +2 HP → P1 'v2': +1 HP (DQ-90) → Build 3.3 'v3': +2 HP on one chosen non-fainted Pokémon again (B33 stage 4, approved)
  healingItems: 'v1', // Potion / Revive (in battle: instead of the attack) → P1 'v2': + Super Potion, free in battle, 1 per Pokémon per battle (DQ-91)
  growthFainted: false, // true = the DQ-92 SOFT experiment (per opponent, rejected 09.10) → Playtest 004 'battle': no new Growth from a battle the Pokémon fainted in (DQ-105)
  selling: false, // P1: sell for half the price in the shop (DQ-94)
  oakBox: false, // P1: the reserve is Professor Oak's Box — a choice on a full-team catch, free swaps in Poké Stop cities (DQ-95)
  vigilance: false, // P1 (provisional balance): catches in one place make its Pokémon warier (DQ-93)
  wildTemperament: false, // wild-encounter slice: species temperament decides when the Escape Die is rolled (data/temperament.js)
  pokeStops: 'v1', // the 6 Poké Stop hubs → Macro 01 'v2': + Pewter, Saffron (every gym city) · 'v3': + Lavender, Cinnabar too · 'v2c' (NIGHTSHIFT_015 D, a DEV pilot): v2 + Cinnabar only (data/pokeStops.js)
  oakJobs: false, // Macro 01: Professor Oak's Research Jobs in Pallet Town (engine/oakEngine.js)
  oakKit: false, // Macro 01: Oak's emergency kit — 1 Poké Ball, once per game, for a player with no ball and no money for one
  catchDice: 'v1', // magenta 1/6 · purple 2/6 · blue 3/6 → Macro 01 'v2': + green 4/6 (exactly 1 HP visibly better)
  explorePools: 'v1', // pick a biome on every Explore → Macro 01 'v2': per place MIXED / CHOOSE / SINGLE (data/locations.js `explore`)
  evolutionGrowth: 'v1', // the Growth an evolution needs: the species data → Playtest 004 'v2': every edge +1 (DQ-106; growthEngine growthNeeded)
  leadPick: false, // Playtest 004: before a trainer / gym / Rocket / League battle the player picks a healthy lead, free (DQ-107)
  localPools: 'v1', // biome pools → M02-1 'v2': explicit per-place pools + the signature guarantee (data/pools.js)
  fatigue: false, // M02-2: exploration fatigue per player × place (engine/fatigueEngine.js); replaces vigilance in new games
  battleTempo: 'v1', // healing in battle per healingItems → Build 3.3 'v2': it costs the exchange, the opponent answers, no per-Pokémon cap (DQ-113)
  rocketMeowth: 'cards', // Meowth only on the plot cards marked `meowth` → Build 3.3 'always': the trio in every Rocket battle (DQ-115)
  initiative: false, // no First Strike → Build 3.3 'fsB': ⚡ „Szybkie wejście” on a Pokémon's first entry into a battle (DQ-114, engine/initiativeEngine.js)
  starts: 'pallet', // everyone starts at CONFIG.startLocation → Build 3.3 'character': each character's own start (data/characters.js, DQ-122)
  hometownGym: false, // → Build 3.3 true: Brock's / Misty's first badge must come from another gym (gymEngine.gymUnlock, DQ-123)
  travelGraph: 'v1', // missions route on the bare network → Build 3.3 'v2': through the one effective graph with today's closures (engine/graphEngine.js, AUD-03, DQ-121)
  gymChallenge: 'v1', // a gym = one battle with the leader → Build 3.3 'v2': gym trainer(s) → leader in one challenge, intermissions, a loss / exit resets the attempt (DQ-118)
  leagueChallenge: 'v1', // Elite Four (one battle) → Lance, the ribbon skips the Elite Four → Build 3.3 'v2': Lorelei → Bruno → Agatha → Lance, full reset, the ribbon never skips (DQ-118)
  gymTrials: false, // gyms open as before → Build 3.3 E5 'pilot': a trial drawn once for Pewter / Cerulean / Vermilion (OPEN / SHORT / SPECIAL; data/gymTrials.js, PROVISIONAL; needs questBook 'v2')
  hunts: false, // no rare hunts → Build 3.3 E4 'pilot': 3 curated hunts + personal clues (huntEngine.js; the clock is CONFIG.hunts.clock — DEC-30 open)
  stoneSources: false, // stones from shops, gym rewards and loot only → EREV MEASUREMENT 'explore' | 'quests' | 'mixed' (data/economy3.js STONE_SOURCES; never a default without Piotr) → KANTO WORLD DISTRIBUTION 25.10 'kanto' (a DEV pilot, OFF in every set; ?dev=stones): each stone where it belongs — Cerulean sells the Water Stone, Vermilion the Thunder Stone (Celadon its four, as before); one sure find of each stone per player at its places (data/economy3.js STONE_SOURCES.kanto)
  questAbandon: 'v1', // a „never” quest given up is gone for the game → EREV-02 'v2': it can be taken again as a new attempt (a new occurrence, from the start) until one is collected; the attempt's key items go back (questBookEngine.canTake / abandonQuest)
  bookRewards: 'v1', // a quest pays its reward lines as written → EREV-01 'v2': a line the game cannot use pays its stated alternative (a clue with no hunt to come → `otherwise`; questBookEngine.rewardLines)
  questBook: false, // only the two mission cards → Build 3.3 E3 'v2': + the quest book (Oak contracts, people's quests, quest challenges; questBookEngine.js, PROVISIONAL content)
  shopStock: 'global', // every Poké Stop sells the same → Build 3.3 E2 'regional': basics everywhere + city extras (data/economy3.js, PROVISIONAL)
  ultraBall: false, // → Build 3.3 E2 true: the Ultra Ball exists (regional shops, Rocket plot rewards; +2 Catch Die steps, never sure)
  loot: false, // → Build 3.3 E2 'v1': a loot d6 after a won random-trainer battle (lootEngine.js, PROVISIONAL)
  finalRarity: 'v1', // wild final forms as in the pools → E1 MEASUREMENT variants 'R1' | 'R2' | 'R3' | 'R4' (spec §6, localPoolEngine.isOrdinaryFinal; never a default without Piotr)
  exp: false, // every award = 1 Growth → Build 3.3 E1 'K5' | 'K4': EXP = 2 + (opponent's power class − receiver's), 0–4; a cocoon that did not fight 1 (data/powerClass.js, PROVISIONAL)
  growthCredits: false, // every defeat of a gym / League Pokémon pays Growth → Build 3.3 true: once per player per opponent across attempts (correction C1, growthEngine.creditKey)
  // PLAYTEST_006 C3 (14.10.2026) — MEASUREMENT switches only (tools/balance-pt006.js), never a default without Piotr:
  gymTeams: 'v1', // gym teams as in Build 3.3 → 'B' the gym trainer fields 2 Pokémon · 'C' B + the leader 3 / 3 / 4 · 'D' B + one coverage Pokémon (PT006-07, DEC-42)
  greatBall: 'v1', // the Great Ball is one Catch Die step → 'G1' a sure catch of a trivial Pokémon (common, 1 power dot) · 'G2' the same below full HP; never a hunted one (PT006-09)
  // PLAYTEST_006 DEV pilots (One Kanto: a developer URL, never a player's mode):
  expeditions: false, // → 'pilot': Rare Expeditions — the first medium expedition (an `encounter` quest step, retry R2 „Nowy trop”; PT006-04, C4)
  rumours: false, // → 'pilot': Kanto Rumours & Opportunities — a small seeded set of opportunities discovered at Poké Stops (PT006-11, C5)
  // One Kanto day 14.10 (DEV, the evening ruleset — ui/setup.js applyAdventure; never a default without Piotr):
  oakResearch: false, // Oak's jobs pay as today → 'v1': „Oak bada nowe gatunki” — full pay only for species new to the player's research ledger (DEC-43)
  trading: false, // → 'v1': two human players at the same Poké Stop swap one Pokémon each, both agree (MP-01)
  achievements: false, // → 'v1': trophies across the whole game (ACH-01), earned once, from the game state · 'v2' (bonus 14.10): + 8 early / mid trophies
  pvp: false, // → 'v1': a voluntary 1-vs-1 duel of two human players at the same place (MP-02)
  questPack: false, // → 'day14': four new quests with new small steps (observe / show / give) (DAY-02)
  eventPack: false, // → 'b4h2' (PLAYTEST_009 K-05 W1, 17.10): 'b4h' with „Szelest w plecaku” (rustling-backpack, 3 choices) in the old backpack's place · → 'b4h' (bonus 14.10): six more explore events (a backpack, a lost trainer, tracks, a bully, a stash, a local's rumour)
  signatureMoves: false, // → 'pilot' (bonus 2, 14.10, DQ-88): the four starter lines' moves, once per battle (data/signatureMoves.js)
  characterTraits: false, // → 'pilot' (bonus 2, 14.10, CHAR-01): one small power per character (data/characterTraits.js)
  eeveeBranch: false, // → 'v1' (bonus 2, 14.10): Eevee → Vaporeon / Jolteon / Flareon by the stone (data/pokemon.js BRANCH_EVOLUTIONS)
  fishing: false, // → 'v1' (bonus 14.10, M02-4 / DAY-03): the Old Rod (the sailor's quest reward, a lasting key item) and „Łów” at a place with water
  iconicWild: false, // Charizard / Blastoise / Venusaur never wild → 'w4' / 'd6': each on its route on a Super Rare roll, kept with weight ¼ / an extra d6 = 6 (PT006-02)
  koPick: false, // after a KO the next healthy Pokémon steps in (a free switch allowed) → PLAYTEST_007 'v1': a human player PICKS who comes in (encounter.leadPick 'ko'; the AI as before)
  combatMoves: false, // one attack per Pokémon → 'mvp1' (Combat MVP, 15.10, dev-1510-combat): named basic attacks, a Special / Powerful move an instance may know (once per battle), the S1 statuses in the arena (engine/combatMoves.js)
  aiPlan: false, // the AI v1 → 'v2' (SYS-01, docs/design/AI_V2_CONTRACT.md; dev-1610-ai2 only): the AI takes the day-14 pack quests it can finish (observe / evolve / show / give) and fishes with the Old Rod — AI behaviour only, the rules for people unchanged; old saves replay with AI v1 → 'v2b' (dev-1610-ai2b, docs/design/AI_V2B_CONTRACT.md): v2 + the sailor's water Pokémon → the Old Rod → fishing, and a League bar that rises after each lost League Challenge ('v2' keeps its meaning for its saves) → 'v2c' (dev-1610-ai2c, docs/design/AI_V2C_CONTRACT.md): v2b + Oak's Box (the best team of six), Research Jobs with Box Pokémon, evolution stones ('v2b' keeps its meaning) → 'v2d' (dev-1610-ai2d, docs/design/AI_V2D_CONTRACT.md): v2c + a free Box swap first, a 70 % League entry bar, one spare team Pokémon for a Research Job, the sailor on the way ('v2c' keeps its meaning) → 'v2e' (dev-1610-ai2e, docs/design/AI_V2E_CONTRACT.md): v2d + no futile catch without a Ball, a gym's bar learns from losses there, the last quest-book slot kept ('v2d' keeps its meaning)
  statusProc: false, // a status move's status lands on every hit → PT009-19 'd6' (OFF in every set until Piotr decides): a separate visible d6 after the hit, the status only on 3–6 (src/combat2/statuses.js STATUS_PROC)
  statusRules: false, // the Combat MVP statuses S1 (arena only, never the last heart) → COMBAT 2.1 'c21' (Piotr 16.10, dev-1610-c21): a status may knock out, poison stays after the battle (−1 at the start of the owner's turn), burn = a d6 1–2 → −2 (three rolls), the cure items, a Potion heals HP only (src/combat2/statuses.js C21) → 'c21b' (dev-1610-c21b, ChatGPT review 16.10): both end-of-exchange ticks settle before any faint, a double KO goes to the player, an unanswered ⚡ exchange ticks too (C21B) · 'c21b-o' (no set): the same, a double KO goes to the opponent
  eventActions: false, // an event's +N actions come at once → PLAYTEST_009 K-04 'nextTurn' (OFF until Piotr decides): +1 at the start of the player's next own turn (one waiting at most; a second → +1 money)
  livingKanto: false, // no offer boards → Living Kanto 2.0 'v1' (Piotr 17.10, dev-1610-lk2; docs/design/RUMOURS_LIVING_KANTO_DECISION_CARD.md): 7 Poké Stop boards × 4 generated offers (12 archetypes), a refresh every 3 weeks, staggered; a taken card is gone for the others; a generated ★★★ offer every 6 weeks (first come); no stones (3 💰 instead); the rumours and the expedition stay with rumourEngine; the AI ignores the boards
  gymSet: false, // the six gyms → NIGHTSHIFT 18.10 'kanto8': all 8 (Blaine / Cinnabar, Giovanni / Viridian from 7 badges) (data/gyms.js gymsOf)
  leagueBadges: false, // the League needs gyms.badgesForLeague (3) → NIGHTSHIFT 18.10: 8 (Piotr) — the engine, the AI and the table read gymEngine.leagueBadges
  roster: false, // the 129 of POKEMON → NIGHTSHIFT B 18.10 'kanto151': the Pokédex of 151 (the 19 never wild: data/pokemon.js dexSpecies)
  epicQuests: false, // NIGHTSHIFT C 18.10 'v1': four epic quest lines through the Quest Book / Rumours / Expedition (needs roster 'kanto151')
  worldIncidents: false, // NIGHTSHIFT D 18.10 'pilot': the living world's regional incidents (OFF — a developer pilot, engine/incidentEngine.js)
  legendStory: false, // NIGHTSHIFT E 18.10 'v1': the Zapdos / Mewtwo story lines, their end INACTIVE (DEC-01 / DEC-13 — a prototype)
  route23Gate: false, // NIGHTSHIFT A 18.10 'v1': the canonical Route 23 badge gate — a VARIANT for Piotr's decision, never on by itself
  balance013: false, // NIGHTSHIFT_014 A 20.10 'v1' (a PROPOSAL, OFF in every set; ?dev=pt013): PLAYTEST_013 — on a catch, the expedition's Scyther surely knows Slash, a Jigglypuff Sing (engine/combatMoves.js catchGuarantee)
  obtain151: false, // NIGHTSHIFT_014 B 20.10 (a PROTOTYPE, OFF in every set; ?dev=obtain151 / obtain151w): the 7 species without a way — Mt. Moon fossils (one per player 'player' / each once in the world 'world'), Ditto, Mr. Mime, Jynx (data/questBook.js OBTAIN151_QUESTS)
  expUx: false, // NIGHTSHIFT_015 A 20.10 'v2' (a DEV pilot, OFF in every set; ?dev=expux): PLAYTEST_014 PT014-09 — a Pokémon that would take 0 EXP is never offered / given an award (engine/growthEngine.js candidates); the EXP forecast and result cards are UI for every Growth game
  pokeCenter: false, // NIGHTSHIFT_015 D 20.10 'cinnabar' (variant B, a DEV pilot, OFF in every set; ?dev=cinnabarb): PLAYTEST_014 PT014-06 — a heal-only Poké Center on Cinnabar Island (Leczenie, 1 action, nothing else; engine/pokeStopEngine.js healOnlySpot). Variant A is rules.pokeStops 'v2c'
  oakHeal: false, // NIGHTSHIFT_015 E 20.10 'v1' (a DEV pilot, OFF in every set; ?dev=oakheal): PLAYTEST_014 PT014-05 — Professor Oak heals the active team in his lab in Pallet Town (Leczenie, 1 action, no shop; engine/pokeStopEngine.js healOnlySpot)
  questDist: false, // NIGHTSHIFT_015 B 20.10 'v2' (a DEV pilot, OFF in every set; ?dev=questdist): PLAYTEST_014 PT014-02 / 03 / 07 — Quest Distribution v2: two of Oak's four contracts in his lab in Pallet and two per land Poké Stop (a seeded deal), the Mt. Moon fossil from week 3, the Living Kanto boards with 3 cards (engine/questBookEngine.js takeHere, livingKantoBoard.js LK_RULES.v2) — WIP, not for release
  onixBalance: false, // NIGHTSHIFT_015 F 20.10 (DEV pilots, OFF in every set): PLAYTEST_014 PT014-04 — 'B' (?dev=onixb) before week 5 Pewter's guaranteed „Fresh tracks” encounter never brings Onix (Geodude instead; engine/encounterEngine.js) · 'C' (?dev=onixc) Onix one Catch Die step harder (engine/captureEngine.js HARD_CATCH — that species only)
  lkStagger: false, // NIGHTSHIFT_015 E1 21.10 'e1' (a DEV pilot, OFF in every set; ?dev=lke1): the Living Kanto boards open one slot a week — 1 card in week 1, +1 each week to full (LK_RULES v3 / v4)
  lkField: false, // NIGHTSHIFT_015 E2 22.10 'e2' (a DEV pilot, OFF in every set; ?dev=lke2): Living Kanto cards with ONE place hang there in the field (routes, forests, caves), at most 2 a place (the rest stay in the city), collected in their board's city (LK_RULES v5…v8)
  oakDeal: false, // NIGHTSHIFT_015 E2 22.10 'v2' (a DEV pilot, OFF in every set; ?dev=oakdeal): only Quest Distribution v2's Oak deal — two of his contracts in his lab, two per land Poké Stop (seeded) — without its fossil week and 3-card boards
  worldQuests: false, // KANTO WORLD DISTRIBUTION 25.10 'w1' (a DEV pilot, OFF in every set; ?dev=worldquests): seven side missions outside the big cities, each a different thing to do, their first week drawn by the seed (data/questBook.js WORLD_QUESTS)
  worldDist: false, // KANTO WORLD DISTRIBUTION 25.10 'w1' (a DEV pilot, OFF in every set; ?dev=worlddist): Oak's four contracts in his lab (a seeded pair) and at his aides' research posts on the routes — not in every city; the Living Kanto boards keep 2 cards in the city and hang 2 in its region (LK_RULES v9) (the Journal's groups and „Odbierz nagrody” are their own switches since the re-review 25.10 §5)
  stoneTrade: false, // KANTO WORLD DISTRIBUTION 25.10 'v1' (a DEV pilot, OFF in every set; ?dev=stonetrade): in a Poké Stop's shop, one Evolution Stone for another, 1:1, no money, once per own turn; the first transaction of an unpaid visit pays its action (engine/pokeStopEngine.js swapStone; re-review 25.10 P2)
  stoneShops: false, // KANTO WORLD re-review 25.10 DEC-4 's1' (a DEV pilot, OFF in every set; ?dev=stoneshops): Fuchsia sells the Leaf Stone, Cinnabar (with its Poké Stop, pokeStops 'v2c') the Fire Stone — two shops measured apart from the finds (data/economy3.js STONE_SOURCES.shops)
  journalGroups: false, // KANTO WORLD re-review 25.10 §5 'v1' (a DEV pilot, OFF in every set; ?dev=journalgroups): the Journal sorts „Moje misje” and „Dostępne tutaj” into groups — Do odbioru · Oak · regional missions · board · stories · other (table/journal.js JOURNAL_GROUPS); the table only, every entry kept
  claimAll: false, // KANTO WORLD re-review 25.10 §5 'v1' (a DEV pilot, OFF in every set; ?dev=claimall): a NEW ENGINE ACTION — with two or more rewards ready here, {type:'claimAll'} collects them all: exactly the single claims in the book's order, each idempotent and logged (questBookEngine.claimAll)
  catchGuard: false, // PLAYTEST_016 PT016-01 'v1' (a DEV pilot, OFF in every set; ?dev=catchguard): an expedition's encounter does not start where Team Rocket blocks catching (the Safari poachers) — the quest says why and points to „Wyzwij Team Rocket” (questBookEngine.stepBlock 'rocketCatch'); the old games start it and cannot throw
  rocketEntry: false, // PLAYTEST_016 PT016-11 'v1' (a DEV pilot, OFF in every set; ?dev=rocketentry): Team Rocket cannot be walked past — entering the balloon's place with a healthy Pokémon starts a Rocket battle (every plot kind; a pitfall's lost battle also ends the turn), and a player who stands there when the balloon arrives meets them at the start of their own turn, once (rocketEngine.rocketOnArrive / rocketTurnStart)
  safariGrind: false, // PLAYTEST_016 PT016-05 's1' (a DEV pilot, OFF in every set; ?dev=safari1): in the Safari Zone each Rare / Super Rare this player already caught there makes the next one there one Catch Die step harder, at most 2 — local only, the first catch as today, the Scyther expedition and hunts untouched (captureEngine.safariSteps)
  magikarpGrowth: false, // PLAYTEST_016 PT016-09 (DEV pilots, OFF in every set; ?dev=karp8 / karp10 / karp12): Magikarp's base Growth 8 / 10 / 12 instead of 5 (T0: 14 / 17 / 20 EXP to Gyarados instead of 9) — Magikarp only (growthEngine.MAGIKARP_GROWTH)
  powerPlant: false, // PLAYTEST_016 PT016-07 'v2' (a DEV pilot, OFF in every set; ?dev=powerplant): the Power Plant fault in three steps — the trail (Route 10 north + the Plant), Grimer in the pipes, the Chief Engineer — the same rumour and stone, +1 money; a new quest id that takes the old one's place (data/questBook.js PT016_QUESTS)
  twoDecks: false, // PLAYTEST_016 PT016-03 'v1' (a DEV pilot, OFF in every set; ?dev=twodecks): the table shows TWO decks — MISJE (everything taken or to take: personal mission cards, Oak, regional, board, stories, expeditions; inside: Aktywne / Dostępne / Ukończone) and PLOTKI (heard, not taken) — one frame and colour per deck, a small tag (Zwykła · Miejsce · Fabuła · Epicka); the table only, every quest's rules unchanged (table/journal.js)
  questStart: false, // PLAYTEST_016 PT016-02 (DEV pilots, OFF in every set): the start's local offers — 'w4' (?dev=questw4) no local quest (Oak's contracts, the authored / pack quests, the regional missions, the Living Kanto boards) before week 4 for anyone: two personal missions each, the same for all · 'e1' (?dev=queste1) one local offer at every start place in weeks 1–3: Oak's lab only its short contract, the regional missions from week 4 · 'eq' (?dev=questeq, ChatGPT review 27.10) the same first offer for all: Oak's short contract on each player's own start place in weeks 1–2, every other local quest and the boards from week 3 (questBookEngine.questStartBlock)
  fossilOnly: false, // PLAYTEST_016 PT016-06 'v1' (a DEV pilot, OFF in every set; ?dev=fossilonly): Aerodactyl is not in Pewter City's wild pool — only the Old Amber (Mt. Moon fossil quest) brings it; Pewter's Super Rare roll then falls back to Common, not to Onix (localPoolEngine / data/pools.js FOSSIL_ONLY)
  rumourSlots: false, // one quest-book slot for a rumour / expedition (RUMOURS.maxActive) → PLAYTEST_009 K-07 'unlimited' (OFF until Piotr decides): rumours without a limit, the ordinary book quests stay at 2
  shopCharge: false, // the Sklep visit costs its action on entering → PLAYTEST_009 'transaction' (PT009-06, dev-1610): entering, looking and the mission swap are free; the FIRST buy or sell of the visit pays the visit's one action (pokeStopEngine.chargeShop)
  gameMode: false, // label only, like `ruleset`: a game started before One Kanto (Build 3.3 „rodzinna” / „sandbox (pilotaż)” and older) → 'adventure': the one new-game mode „Pokémon Kanto — Przygoda” (PT006-10, Piotr 13–14.10.2026)
});

// The Gameplay P1 switches at their values before schema 15.
export const P1_OFF = Object.freeze({
  pokeStop: 'v1', rest: 'v1', healingItems: 'v1', growthFainted: false, selling: false, oakBox: false, vigilance: false,
  wildTemperament: false,
});

// The Macro 01 switches at their values before Macro 01 (Build 3.0, schema 16).
export const M01_OFF = Object.freeze({ pokeStops: 'v1', oakJobs: false, oakKit: false, catchDice: 'v1', explorePools: 'v1' });

// The Playtest 004 switches at their values before Playtest 004 (Build 3.1).
export const PT4_OFF = Object.freeze({ growthFainted: false, evolutionGrowth: 'v1', leadPick: false });

// The M02-1 switches at their values before Macro 02 (every older game).
export const M021_OFF = Object.freeze({ localPools: 'v1' });

// The M02-2 switches at their values before M02-2 (the M02-1 game): no fatigue,
// Vigilance on — vigilance is not new, every save since schema 15 stores it.
export const M022_OFF = Object.freeze({ fatigue: false, vigilance: true });

// The PLAYTEST_006 switches (measurement variants and DEV pilots) at their values before them — every older
// game, and the default of a new one.
export const PT6_OFF = Object.freeze({ gymTeams: 'v1', greatBall: 'v1', iconicWild: false, expeditions: false, rumours: false, oakResearch: false, trading: false, achievements: false, pvp: false, questPack: false, fishing: false, eventPack: false, eeveeBranch: false, characterTraits: false, signatureMoves: false });

// The PLAYTEST_007 switches (Build 3.5 DEV, dev-1510) at their values before them — every older game.
// (+ the Combat MVP, 15.10, and PLAYTEST_009's shop, 16.10 — the switches added since Build 3.5 DEV)
export const PT7_OFF = Object.freeze({ koPick: false, combatMoves: false, shopCharge: false, eventActions: false, rumourSlots: false, statusRules: false, statusProc: false, aiPlan: false, livingKanto: false });

// NIGHTSHIFT 18.10 (ChatGPT 22:50): the content pack's switches at their values before it (every older game).
export const NS_OFF = Object.freeze({ gymSet: false, leagueBadges: false, roster: false, epicQuests: false, worldIncidents: false, legendStory: false, route23Gate: false });

// NIGHTSHIFT_014 20.10 (ChatGPT 19.10 23:30): the content closeout's switches at their values before it (every older
// game, also the public 3.8.1 one, dev-1910-epic-ai2e).
export const NS14_OFF = Object.freeze({ balance013: false, obtain151: false });

// NIGHTSHIFT_015 20.10 (ChatGPT 22:21): the night's DEV pilots at their values before them (every older game, also the
// public Family Test 3.9 one, dev-2010-fam39). New values of older switches (pokeStops) are not listed here.
export const NS15_OFF = Object.freeze({ expUx: false, pokeCenter: false, oakHeal: false, questDist: false, onixBalance: false, lkStagger: false, lkField: false, oakDeal: false });

// KANTO WORLD DISTRIBUTION 25.10 (ChatGPT 14:10): its DEV pilots at their values before them (every older game, also the
// public Family Test 3.9 one). The new value of an older switch (stoneSources 'kanto') is not listed here.
export const KWD_OFF = Object.freeze({ worldQuests: false, worldDist: false, stoneTrade: false, journalGroups: false, claimAll: false, stoneShops: false }); // + re-review 25.10: §5 the Journal's groups and claimAll split from worldDist; DEC-4 the two stone shops

// PLAYTEST_016 26.10 (ChatGPT 21:57, after the family's Build 3.10 game): its DEV pilots at their values before them
// (every older game, also the public Family Test 3.10 one, dev-2610-fam310). 28.10: the next DEV candidate dev-2810-fam311
// turns the eight on at their approved values (ui/setup.js).
export const PT16_OFF = Object.freeze({ catchGuard: false, rocketEntry: false, fossilOnly: false, questStart: false, twoDecks: false, powerPlant: false, magikarpGrowth: false, safariGrind: false });

// The Build 3.3 switches at their values before Build 3.3 (every older game).
export const B33_OFF = Object.freeze({ battleTempo: 'v1', rocketMeowth: 'cards', initiative: false, starts: 'pallet', hometownGym: false, travelGraph: 'v1', gymChallenge: 'v1', leagueChallenge: 'v1', growthCredits: false, exp: false, finalRarity: 'v1', shopStock: 'global', ultraBall: false, loot: false, questBook: false, hunts: false, gymTrials: false, bookRewards: 'v1', questAbandon: 'v1', stoneSources: false });

// The family's Build 2 game (3A-1 Growth + the 3A-2 battle loop, schema 14):
// the baseline Gameplay P1 is compared with.
export const BUILD2_RULES = Object.freeze({
  ...PHASE2_RULES,
  ruleset: 'phase3a',
  evolution: 'growth',
  questRewards: 'v2',
  counterattackOnStay: true,
  battleItems: true,
  trainerRetreat: true,
  ...P1_OFF,
});

// Values this engine can play, per switch.
export const SUPPORTED = Object.freeze({
  ruleset: ['phase2', 'phase3a', 'p1', 'm01', 'p4', 'm02', 'b33'],
  evolution: ['stars', 'growth'],
  questRewards: ['v1', 'v2'],
  counterattackOnStay: [false, true],
  battleItems: [false, true],
  trainerRetreat: [false, true],
  gymRoster: ['v1', 'v2'],
  gymReward: ['v1', 'v2'],
  leagueRoster: ['v1', 'v2'],
  rocketMobility: ['v1', 'v2'],
  travelNetwork: ['v1', 'v2'],
  pokeStop: ['v1', 'v2'],
  rest: ['v1', 'v2', 'v3'],
  healingItems: ['v1', 'v2'],
  growthFainted: [false, true, 'battle'],
  selling: [false, true],
  oakBox: [false, true],
  vigilance: [false, true],
  wildTemperament: [false, true],
  pokeStops: ['v1', 'v2', 'v3', 'v2c'], // 'v2c' NIGHTSHIFT_015 D 20.10: v2 + Cinnabar Island (a DEV pilot: no set turns it on)
  oakJobs: [false, true],
  oakKit: [false, true],
  catchDice: ['v1', 'v2'],
  explorePools: ['v1', 'v2'],
  evolutionGrowth: ['v1', 'v2', 'T0', 'T1', 'T2', 'T3'],
  leadPick: [false, true],
  localPools: ['v1', 'v2'],
  fatigue: [false, true],
  battleTempo: ['v1', 'v2'],
  rocketMeowth: ['cards', 'always'],
  initiative: [false, 'fsB'],
  starts: ['pallet', 'character'],
  hometownGym: [false, true],
  travelGraph: ['v1', 'v2'],
  gymChallenge: ['v1', 'v2'],
  leagueChallenge: ['v1', 'v2'],
  growthCredits: [false, true],
  exp: [false, 'K5', 'K4'],
  finalRarity: ['v1', 'R1', 'R2', 'R3', 'R4'],
  shopStock: ['global', 'regional'],
  ultraBall: [false, true],
  loot: [false, 'v1'],
  questBook: [false, 'v2'],
  bookRewards: ['v1', 'v2'],
  questAbandon: ['v1', 'v2'],
  stoneSources: [false, 'explore', 'quests', 'mixed', 'kanto'], // + KANTO WORLD DISTRIBUTION 25.10 'kanto' (a DEV pilot, ?dev=stones)
  hunts: [false, 'pilot'],
  gymTrials: [false, 'pilot'],
  gymTeams: ['v1', 'B', 'C', 'D'],
  greatBall: ['v1', 'G1', 'G2'],
  iconicWild: [false, 'w4', 'd6'],
  expeditions: [false, 'pilot'],
  rumours: [false, 'pilot'],
  oakResearch: [false, 'v1'],
  trading: [false, 'v1'],
  achievements: [false, 'v1', 'v2', 'v3', 'v4', 'v5'], // 'v3': ACHIEVEMENTS 3.0 — FIRST PLAYER WINS (18.10, dev-1610-ach3); 'v4': TROFEA KANTO — 8 of the 20 drawn per game (18.10, dev-1610-ach4); 'v5': + a trainer = type, name and place (18.10, dev-1610-ach5)
  pvp: [false, 'v1'],
  questPack: [false, 'day14'],
  fishing: [false, 'v1'],
  eventPack: [false, 'b4h', 'b4h2'],
  eeveeBranch: [false, 'v1'],
  characterTraits: [false, 'pilot'],
  signatureMoves: [false, 'pilot'],
  gameMode: [false, 'adventure'],
  koPick: [false, 'v1'],
  combatMoves: [false, 'mvp1'],
  shopCharge: [false, 'transaction'],
  statusRules: [false, 'c21', 'c21b', 'c21b-o', 'c22'], // 'c22': COMBAT 2.2 (18.10, dev-1610-c22)
  statusProc: [false, 'd6'],
  aiPlan: [false, 'v2', 'v2b', 'v2c', 'v2d', 'v2e'],
  eventActions: [false, 'nextTurn'],
  rumourSlots: [false, 'unlimited'],
  livingKanto: [false, 'v1'],
  gymSet: [false, 'kanto8'], // NIGHTSHIFT 18.10 (dev-1810-kanto8)
  leagueBadges: [false, 8],
  roster: [false, 'kanto151'], // NIGHTSHIFT B 18.10
  epicQuests: [false, 'v1'], // NIGHTSHIFT C 18.10
  worldIncidents: [false, 'pilot'], // NIGHTSHIFT D 18.10 (a pilot: no set turns it on)
  legendStory: [false, 'v1', 'v2', 'v3'], // NIGHTSHIFT E 18.10 (a prototype: no set turns it on); 'v2' DEC-01 20.10: legendary persistence, Zapdos first (a DEV pilot); 'v3' = 'v2' + every legend one Catch Die step harder (DEC-01 balance)
  route23Gate: [false, 'v1'], // NIGHTSHIFT A 18.10 (a variant: no set turns it on)
  balance013: [false, 'v1', 'v2'], // NIGHTSHIFT_014 A 20.10 (a proposal: no set turns it on); 'v2' = the Scyther variant of the review (keeps Wing Attack)
  obtain151: [false, 'player', 'world'], // NIGHTSHIFT_014 B 20.10 (a prototype: no set turns it on)
  expUx: [false, 'v2'], // NIGHTSHIFT_015 A 20.10 (a DEV pilot: no set turns it on)
  pokeCenter: [false, 'cinnabar'], // NIGHTSHIFT_015 D 20.10 variant B (a DEV pilot: no set turns it on)
  oakHeal: [false, 'v1'], // NIGHTSHIFT_015 E 20.10 (a DEV pilot: no set turns it on)
  questDist: [false, 'v2'], // NIGHTSHIFT_015 B 20.10 (a DEV pilot: no set turns it on)
  onixBalance: [false, 'B', 'C'], // NIGHTSHIFT_015 F 20.10 (DEV pilots: no set turns them on)
  lkStagger: [false, 'e1'], // NIGHTSHIFT_015 E1 21.10 (a DEV pilot: no set turns it on)
  lkField: [false, 'e2'], // NIGHTSHIFT_015 E2 22.10 (a DEV pilot: no set turns it on)
  oakDeal: [false, 'v2'], // NIGHTSHIFT_015 E2 22.10 (a DEV pilot: no set turns it on)
  worldQuests: [false, 'w1'], // KANTO WORLD DISTRIBUTION 25.10 (a DEV pilot: no set turns it on)
  worldDist: [false, 'w1'], // KANTO WORLD DISTRIBUTION 25.10 (a DEV pilot: no set turns it on)
  stoneTrade: [false, 'v1'], // KANTO WORLD DISTRIBUTION 25.10 (a DEV pilot: no set turns it on)
  stoneShops: [false, 's1'], // KANTO WORLD re-review 25.10 DEC-4 (a DEV pilot: no set turns it on)
  journalGroups: [false, 'v1'], // KANTO WORLD re-review 25.10 §5 (a DEV pilot: no set turns it on)
  claimAll: [false, 'v1'], // KANTO WORLD re-review 25.10 §5 (a DEV pilot: no set turns it on)
  catchGuard: [false, 'v1'], // PLAYTEST_016 PT016-01 (a DEV pilot; on only in the next DEV candidate dev-2810-fam311)
  rocketEntry: [false, 'v1'], // PLAYTEST_016 PT016-11 (a DEV pilot; on only in dev-2810-fam311)
  fossilOnly: [false, 'v1'], // PLAYTEST_016 PT016-06 (a DEV pilot; on only in dev-2810-fam311)
  safariGrind: [false, 's1'], // PLAYTEST_016 PT016-05 (a DEV pilot; on only in dev-2810-fam311)
  magikarpGrowth: [false, 'g8', 'g10', 'g12'], // PLAYTEST_016 PT016-09 (three exclusive DEV pilots; g8 only in dev-2810-fam311, g10 / g12 in no set)
  powerPlant: [false, 'v2'], // PLAYTEST_016 PT016-07 (a DEV pilot; on only in dev-2810-fam311)
  twoDecks: [false, 'v1'], // PLAYTEST_016 PT016-03 (a DEV pilot; on only in dev-2810-fam311)
  questStart: [false, 'w4', 'e1', 'eq'], // PLAYTEST_016 PT016-02 (three exclusive DEV pilots; 'eq' only in dev-2810-fam311, w4 / e1 in no set)
});

// Why these switches can't be played here (a newer version of the game made
// them), or null when they can.
export function rulesProblem(rules) {
  if (!rules || typeof rules !== 'object') return 'no rule switches';
  for (const [key, value] of Object.entries(rules)) {
    if (!Object.hasOwn(SUPPORTED, key)) return `unknown rule switch "${key}"`;
    if (!SUPPORTED[key].includes(value)) return `rule ${key} = ${JSON.stringify(value)} is not supported by this version`;
  }
  const missing = Object.keys(SUPPORTED).filter((key) => !Object.hasOwn(rules, key));
  return missing.length ? `missing rule switches: ${missing.join(', ')}` : null;
}

export function validateRules(config) {
  const problem = rulesProblem(config.rules);
  if (problem) throw new Error(`Rules: ${problem}`);
}

// The family's Build 3.0 game (Phase 3A complete, schema 16): the baseline
// Macro 01 is compared with.
export const BUILD30_RULES = Object.freeze({
  ...PHASE2_RULES,
  ruleset: 'p1',
  evolution: 'growth',
  questRewards: 'v2',
  counterattackOnStay: true,
  battleItems: true,
  trainerRetreat: true,
  gymRoster: 'v2',
  gymReward: 'v2',
  leagueRoster: 'v2',
  rocketMobility: 'v2',
  travelNetwork: 'v2',
  pokeStop: 'v2',
  rest: 'v2',
  healingItems: 'v2',
  growthFainted: false,
  selling: true,
  oakBox: true,
  vigilance: true,
  wildTemperament: true,
  ...M01_OFF,
});

// The family's Build 3.1 game (Macro 01, LIVE 11.10.2026): the baseline
// Playtest 004 is compared with. It plays on the board of new games (kanto45).
export const BUILD31_RULES = Object.freeze({
  ...BUILD30_RULES,
  ruleset: 'm01',
  pokeStops: 'v2',
  oakJobs: true,
  oakKit: true,
  catchDice: 'v2',
  explorePools: 'v2',
  ...PT4_OFF,
});

// The Playtest 004 game (DQ-105 … DQ-108, approved technically 11.10.2026, not
// published): the baseline M02-1 is compared with. The board of new games.
export const P4_RULES = Object.freeze({
  ...BUILD31_RULES,
  ruleset: 'p4',
  growthFainted: 'battle',
  evolutionGrowth: 'v2',
  leadPick: true,
  ...M021_OFF,
  ...M022_OFF,
});

// The M02-1 game (local pools v2 and wave 1, approved 12.10.2026, not
// published): the baseline M02-2 is compared with.
export const M021_RULES = Object.freeze({
  ...P4_RULES,
  ruleset: 'm02',
  localPools: 'v2',
});

// The M02-2 game — Family Playtest Build 3.2 (LIVE 12.10.2026): the baseline
// Build 3.3 is compared with.
export const BUILD32_RULES = Object.freeze({
  ...M021_RULES,
  fatigue: true,
  vigilance: false,
  ...B33_OFF,
});

// A copy of `config` that plays the named ruleset: 'phase2' (the Phase 2
// baseline), 'build2' (the family's Build 2 game, before Gameplay P1),
// 'build30' (the family's Build 3.0 game, before Macro 01), 'build31' (the
// family's Build 3.1 game, before Playtest 004), 'p4' (Playtest 004, before
// Macro 02 M02-1), 'm021' (M02-1, before fatigue), 'build32' (Build 3.2, before
// Build 3.3) or 'current' (CONFIG.rules as passed in, unchanged).
export function withRuleset(config, name) {
  const copy = structuredClone(config);
  if (name === 'phase2') copy.rules = { ...PHASE2_RULES };
  else if (name === 'build2') copy.rules = { ...BUILD2_RULES };
  else if (name === 'build30') copy.rules = { ...BUILD30_RULES };
  else if (name === 'build31') copy.rules = { ...BUILD31_RULES };
  else if (name === 'p4') copy.rules = { ...P4_RULES };
  else if (name === 'm021') copy.rules = { ...M021_RULES };
  else if (name === 'build32') copy.rules = { ...BUILD32_RULES };
  else if (name !== 'current') throw new Error(`Unknown ruleset: ${name} (phase2 | build2 | build30 | build31 | p4 | m021 | build32 | current)`);
  // An older game plays on the board it had: the Build 3.0 family board (games
  // saved before the merge move to it when they load) — DQ-104. Build 3.1 has
  // the board of new games already (kanto45).
  if (!['current', 'build31', 'p4', 'm021', 'build32'].includes(name)) copy.map = { ...copy.map, topology: 'kanto43' };
  validateRules(copy);
  return copy;
}

export function isPhase2Game(state) {
  return state.config.rules.ruleset === 'phase2';
}

// Data that changed between rule versions holds { v1: …, v2: … }; the game's
// switch names the version it plays with, so a saved game keeps its data.
export function pickVersion(table, version, what) {
  if (!table || !Object.hasOwn(table, version)) throw new Error(`No ${what} for version ${version}`);
  return table[version];
}
