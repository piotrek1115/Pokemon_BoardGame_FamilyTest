// One Kanto day 14.10 — ACHIEVEMENTS (rules.achievements 'v1', ACH-01 / ACH-02; audit of M02-5, SBX-12, WIN-02,
// WIN-04, SYS-19): trophies for the WHOLE game — not gym badges (they stay in the badge case), not the Hall of
// Fame (the end screen's titles). ONE registry. Each is earned once per player, read from the game state (the
// engine's own counters — never a UI animation), so a reload or a replay gives the same trophies.
//   measure   what is counted (engine/achievementEngine.js MEASURES)
//   target    how much of it
//   chainId   the chain it belongs to (one measure, tiers 1 / 2 …): a chain scores ONLY its highest earned tier —
//             FIRST WIN 10 + HAT TRICK 20 = 20, not 30 (ChatGPT review 14.10); every earned trophy stays visible
//   tier      its step in the chain
//   points    PROVISIONAL — for a future score (WIN-NEW); the end of the game does not change today
// Names and numbers are PROPOSALS for Piotr (balance data, not rules).
export const ACHIEVEMENTS = Object.freeze([
  { id: 'first-win', chainId: 'pvp-wins', category: 'pvp', name: 'FIRST WIN', pl: 'Pierwsza wygrana', text: 'Wygraj pierwszy pojedynek z innym graczem.', measure: 'pvpWins', target: 1, tier: 1, points: 10, icon: '⚔️' },
  { id: 'hat-trick', chainId: 'pvp-wins', category: 'pvp', name: 'HAT TRICK', pl: 'Hat trick', text: 'Trzy zaliczone wygrane pojedynki.', measure: 'pvpWins', target: 3, tier: 2, points: 20, icon: '⚔️' },
  { id: 'great-trade', chainId: 'trades', category: 'trading', name: 'GREAT TRADE', pl: 'Pierwsza wymiana', text: 'Wymień się Pokémonem z innym graczem.', measure: 'trades', target: 1, tier: 1, points: 10, icon: '🔄' },
  { id: 'oak-is-proud', chainId: 'oak-jobs', category: 'research', name: 'OAK IS PROUD', pl: 'Oak jest dumny', text: 'Ukończ pięć zadań badawczych u Profesora Oaka.', measure: 'oakJobs', target: 5, tier: 1, points: 15, icon: '🔬' },
  { id: 'rocket-hates-it', chainId: 'rocket-plots', category: 'rocket', name: 'ROCKET HATES IT', pl: 'Rocket tego nie znosi', text: 'Pokonaj trzy spiski Team Rocket.', measure: 'rocketPlots', target: 3, tier: 1, points: 15, icon: '🎈' },
  { id: 'explorer', chainId: 'places', category: 'exploration', name: 'EXPLORER', pl: 'Odkrywca', text: 'Odwiedź dziesięć różnych miejsc.', measure: 'places', target: 10, tier: 1, points: 10, icon: '📍' },
  { id: 'globetrotter', chainId: 'places', category: 'exploration', name: 'GLOBETROTTER', pl: 'Obieżyświat', text: 'Odwiedź dwadzieścia pięć różnych miejsc.', measure: 'places', target: 25, tier: 2, points: 20, icon: '📍' },
  { id: 'collector', chainId: 'collection', category: 'collection', name: 'POKÉMON COLLECTOR', pl: 'Kolekcjoner', text: 'Miej w Pokédexie piętnaście złapanych gatunków.', measure: 'species', target: 15, tier: 1, points: 15, icon: '📕' },
  { id: 'evolution-expert', chainId: 'evolutions', category: 'collection', name: 'EVOLUTION EXPERT', pl: 'Ekspert ewolucji', text: 'Pięć ewolucji Twoich Pokémonów.', measure: 'evolutions', target: 5, tier: 1, points: 15, icon: '✨' },
  { id: 'quest-hunter', chainId: 'quests', category: 'quests', name: 'QUEST HUNTER', pl: 'Łowca zadań', text: 'Ukończ pięć różnych zadań z księgi.', measure: 'quests', target: 5, tier: 1, points: 15, icon: '📜' },
  { id: 'champion', chainId: 'champion', category: 'champion', name: 'CHAMPION', pl: 'Mistrz Ligi', text: 'Zostań Mistrzem Ligi Pokémon.', measure: 'champion', target: 1, tier: 1, points: 30, icon: '👑' },
]);

// Bonus 14.10 (rules.achievements 'v2', the next DEV ruleset): the 11 above + 8 trophies of the EARLY and MIDDLE
// game, each from a real engine counter (never a tap): the first wild catch, the first places, a team of 4, the
// first Research Job back, the first win over Team Rocket, the first quest, the first Super Rare met, the first
// Pokémon caught on the Old Rod. Chains get a lower tier (FIRST STEPS → EXPLORER → GLOBETROTTER, RESEARCH
// ASSISTANT → OAK IS PROUD, QUEST STARTER → QUEST HUNTER) — still one score per chain: its highest tier earned.
// 'v1' games (dev-1410) keep the list above exactly.
const by = (id) => ACHIEVEMENTS.find((a) => a.id === id);
export const ACHIEVEMENTS_V2 = Object.freeze([
  { id: 'first-catch', chainId: 'wild-catches', category: 'collection', name: 'FIRST CATCH', pl: 'Pierwsze złapanie', text: 'Złap pierwszego dzikiego Pokémona.', measure: 'wildCatches', target: 1, tier: 1, points: 5, icon: '🎯' },
  { id: 'first-steps', chainId: 'places', category: 'exploration', name: 'FIRST STEPS', pl: 'Pierwsze kroki', text: 'Odwiedź trzy różne miejsca.', measure: 'places', target: 3, tier: 1, points: 5, icon: '👣' },
  { ...by('explorer'), tier: 2 },
  { ...by('globetrotter'), tier: 3 },
  { id: 'team-builder', chainId: 'team-size', category: 'collection', name: 'TEAM BUILDER', pl: 'Drużyna', text: 'Miej w drużynie cztery Pokémony.', measure: 'teamSize', target: 4, tier: 1, points: 5, icon: '👥' },
  { id: 'research-assistant', chainId: 'oak-jobs', category: 'research', name: 'RESEARCH ASSISTANT', pl: 'Asystent Oaka', text: 'Pierwsze zadanie badawcze u Profesora Oaka ukończone.', measure: 'oakJobs', target: 1, tier: 1, points: 5, icon: '🔬' },
  { ...by('oak-is-proud'), tier: 2 },
  { id: 'rocket-trouble', chainId: 'rocket-wins', category: 'rocket', name: 'ROCKET TROUBLE', pl: 'Kłopoty dla Rocket', text: 'Pierwsza wygrana walka z Team Rocket.', measure: 'rocketWins', target: 1, tier: 1, points: 5, icon: '🎈' },
  by('rocket-hates-it'),
  { id: 'quest-starter', chainId: 'quests', category: 'quests', name: 'QUEST STARTER', pl: 'Pierwsze zadanie', text: 'Ukończ pierwsze zadanie z księgi.', measure: 'quests', target: 1, tier: 1, points: 5, icon: '📜' },
  { ...by('quest-hunter'), tier: 2 },
  { id: 'rare-discovery', chainId: 'super-rare', category: 'exploration', name: 'RARE DISCOVERY', pl: 'Rzadkie odkrycie', text: 'Spotkaj pierwszego bardzo rzadkiego dzikiego Pokémona.', measure: 'superRareMet', target: 1, tier: 1, points: 10, icon: '◆' },
  { id: 'fishing-rookie', chainId: 'fishing', category: 'fishing', name: 'FISHING ROOKIE', pl: 'Młody wędkarz', text: 'Złap pierwszego Pokémona na Starą wędkę.', measure: 'fishCaught', target: 1, tier: 1, points: 10, icon: '🎣' },
  by('first-win'), by('hat-trick'), by('great-trade'), by('collector'), by('evolution-expert'), by('champion'),
].map((a) => Object.freeze(a)));
// ACHIEVEMENTS 3.0 (rules.achievements 'v3' — Piotr's approval, ChatGPT 18.10 12:21; the set dev-1610-ach3): 20 trophies,
// FIRST PLAYER WINS — each trophy is unique in a game: the first player (the AI too) to meet its condition owns it
// (state.trophies — engine/achievementEngine.js), nobody else can ever earn it. Their own ids (`t3-…`): an old id never
// takes a new condition (FIRST WIN is not POGROMCA TRENERÓW). `done`: the condition as a noun phrase for the notice
// („Ash — pierwszy w tej grze: 15 różnych złapanych gatunków!”). Points: the list's; one chain only (`places`:
// ODKRYWCA 10 → OBIEŻYŚWIAT 20 — one owner of both scores 20, two owners each their own). They never change the end
// of the game, its winners, the time limit or the Hall of Fame. 'v1' / 'v2' games keep their lists exactly.
const t3 = (id, name, icon, points, text, done, measure, target, extra = {}) => Object.freeze({ id: `t3-${id}`, chainId: extra.chainId ?? `t3-${id}`, tier: extra.tier ?? 1, category: extra.category ?? 'v3', name, pl: name, icon, points, text, done, measure, target });
export const ACHIEVEMENTS_V3 = Object.freeze([
  t3('explorer', 'ODKRYWCA', '🧭', 10, 'Odwiedź 10 różnych lokacji.', '10 różnych odwiedzonych lokacji', 'places', 10, { chainId: 't3-places', tier: 1 }),
  t3('rocket-trouble', 'KŁOPOTY DLA ROCKET', '🎈', 10, 'Wygraj walkę z Team Rocket.', 'wygrana walka z Team Rocket', 'rocketWins', 1),
  t3('trainer-tamer', 'POGROMCA TRENERÓW', '⚔️', 10, 'Pokonaj 3 różnych trenerów NPC.', '3 różnych pokonanych trenerów', 'trainersBeaten', 3),
  t3('fishing-rookie', 'MŁODY WĘDKARZ', '🎣', 10, 'Złap Pokémona na Starą wędkę.', 'Pokémon złapany na Starą wędkę', 'fishCaught', 1),
  t3('rare-find', 'RZADKI OKAZ', '◆', 15, 'Złap Pokémona Super Rare (samo spotkanie nie wystarczy).', 'złapany Pokémon Super Rare', 'superRareCaught', 1),
  t3('collector', 'KOLEKCJONER', '📕', 15, 'Złap 15 różnych gatunków Pokémonów.', '15 różnych złapanych gatunków Pokémonów', 'speciesCaught', 15),
  t3('quest-hunter', 'ŁOWCA ZADAŃ', '📜', 15, 'Ukończ 5 różnych rodzajów zadań.', '5 różnych rodzajów ukończonych zadań', 'quests', 5),
  t3('oak-is-proud', 'OAK JEST DUMNY', '🔬', 15, 'Ukończ 5 badań Profesora Oaka.', '5 ukończonych badań Profesora Oaka', 'oakJobs', 5),
  t3('rocket-hates-it', 'ROCKET TEGO NIE ZNOSI', '🎈', 15, 'Powstrzymaj 3 spiski Team Rocket.', '3 powstrzymane spiski Team Rocket', 'rocketPlots', 3),
  t3('evolution-expert', 'EKSPERT EWOLUCJI', '✨', 15, 'Przeprowadź 5 ewolucji.', '5 ewolucji', 'evolutions', 5),
  t3('globetrotter', 'OBIEŻYŚWIAT', '🌍', 20, 'Odwiedź 25 różnych lokacji.', '25 różnych odwiedzonych lokacji', 'places', 25, { chainId: 't3-places', tier: 2 }),
  t3('hat-trick', 'HAT TRICK', '⚔️', 20, 'Wygraj 3 zaliczone pojedynki z innymi graczami.', '3 zaliczone wygrane pojedynki', 'pvpWins', 3),
  t3('first-champion', 'PIERWSZY MISTRZ LIGI', '👑', 30, 'Jako pierwszy pokonaj Lance’a i zostań Mistrzem Ligi.', 'pierwsze Mistrzostwo Ligi', 'champion', 1),
  t3('gym-conqueror', 'ZDOBYWCA AREN', '🏅', 20, 'Zdobądź 3 odznaki sal.', '3 odznaki sal', 'badges', 3),
  t3('unbreakable', 'NIEZŁOMNY', '🛡️', 20, 'Wygraj 3 walki z różnymi trenerami NPC bez żadnego KO swoich Pokémonów w tych walkach.', '3 wygrane z różnymi trenerami bez KO', 'flawlessTrainers', 3),
  t3('biome-explorer', 'BADACZ BIOMÓW', '🌿', 15, 'Złap Pokémony w 5 różnych biomach.', 'złapania w 5 różnych biomach', 'catchBiomes', 5),
  t3('element-team', 'DRUŻYNA ŻYWIOŁÓW', '🌈', 20, 'Skompletuj drużynę 6 Pokémonów o różnych głównych typach.', 'drużyna 6 Pokémonów o różnych głównych typach', 'elementTeam', 1),
  t3('board-master', 'MISTRZ ZLECEŃ', '📋', 20, 'Ukończ 2 różne zlecenia Living Kanto ★★★.', '2 ukończone zlecenia ★★★', 'boardStars3', 2),
  t3('stone-master', 'MISTRZ KAMIENI', '💠', 20, 'Przeprowadź 2 ewolucje różnymi kamieniami.', '2 ewolucje różnymi kamieniami', 'stoneEvolutions', 2),
  t3('rare-hunter', 'ŁOWCA RZADKOŚCI', '🔴', 20, 'Złap 3 różne gatunki Pokémonów klasy Rare.', '3 różne złapane gatunki klasy Rare', 'rareSpecies', 3),
]);
// ACHIEVEMENTS 4.0 — TROFEA KANTO (rules.achievements 'v4' — Piotr's decision, wariant A, ChatGPT 18.10 13:04; the set
// dev-1610-ach4): the SAME 20 cards (their ids, conditions and points unchanged), but a new game shuffles them and lays
// out 8 — fully at random: no categories, no guaranteed card, no difficulty balancing, no replacement when one is won,
// no filter for what this table can reach (as the physical board game: shuffle 20, lay out 8). Only those 8 can be won
// and score; the other 12 are out of this game (engine/achievementEngine.js — state.trophies.active).
export const KANTO_TROPHY_CARDS = 8;
// ACHIEVEMENTS 5.0 (rules.achievements 'v5' — Piotr's final decisions A–E, ChatGPT 18.10 15:24; the set dev-1610-ach5):
// TROFEA KANTO as 'v4' (the same 20 cards and ids, 8 drawn, thresholds, points) — only the two trainer trophies' words:
// „TRENERZY Z EKSPLORACJI” (a trainer met while exploring, or a quest's challenge) instead of „trenerzy NPC”. Their
// count changes in the engine: a trainer is its type, name AND place (engine/achievementEngine.js trainerIdentity).
const TEXTS_V5 = {
  't3-trainer-tamer': { text: 'Pokonaj 3 różnych trenerów spotkanych podczas Eksploracji lub wyzwań zadań.' },
  't3-unbreakable': { text: 'Pokonaj 3 różnych trenerów z Eksploracji lub wyzwań zadań, nie dopuszczając do omdlenia żadnego ze swoich Pokémonów podczas tych walk.' }, // P2 (ChatGPT 18.10 16:19): a KO is a faint, not a lost Pokémon — was „bez utraty żadnego własnego Pokémona w tych walkach”
};
export const ACHIEVEMENTS_V5 = Object.freeze(ACHIEVEMENTS_V3.map((a) => (TEXTS_V5[a.id] ? Object.freeze({ ...a, ...TEXTS_V5[a.id] }) : a)));
export const ACHIEVEMENT_SETS = Object.freeze({ v1: ACHIEVEMENTS, v2: ACHIEVEMENTS_V2, v3: ACHIEVEMENTS_V3, v4: ACHIEVEMENTS_V3, v5: ACHIEVEMENTS_V5 });
// Every trophy of every set (a note on the table finds its name by id).
export const ALL_ACHIEVEMENTS = Object.freeze([...ACHIEVEMENTS, ...ACHIEVEMENTS_V2.filter((a) => !ACHIEVEMENTS.some((b) => b.id === a.id)), ...ACHIEVEMENTS_V3]);

export const ACHIEVEMENT_CATEGORIES_PL = { pvp: 'Pojedynki', trading: 'Wymiana', research: 'Badania', rocket: 'Team Rocket', exploration: 'Podróże', collection: 'Kolekcja', quests: 'Zadania', fishing: 'Wędkowanie', champion: 'Liga' };
