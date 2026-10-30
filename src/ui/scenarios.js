// One Kanto day 14.10 — DEV TEST SCENARIOS for the evening playtest (ChatGPT canonical full-day handoff, „Evening
// preparation”). FIXTURES, not saves and not rules: each builds a NEW game of the evening ruleset (applyAdventure)
// and puts the table in one test situation. The table opens one only from a developer URL (`table.html?scenario=D`)
// and keeps it in its OWN save keys (scenarioStorage: kanto.table.scenario.<X>.v2 …) — the family's game slot is
// never read or written; `&fresh` builds it again. Nothing here is reachable from the game's menus.
//   A  a normal start — two players, the evening ruleset
//   B  a rumour heard and its quest taken (Ash: the Lost Parcel, at Viridian)
//   C  the Scyther expedition at its encounter step (Ash in the Safari Zone)
//   D  two players at one Poké Stop (Pewter), ready to trade
//   E  two players at one place (Route 2), ready for a friendly duel
//   F  one step from the first achievement (Ash in Cerulean, 9 places visited — any new place next door: EXPLORER)
//   G  fishing (dev-1410b): Ash on Route 6 with the sailor's quest and two Water Pokémon — into Vermilion →
//      collect the reward (the Old Rod) → „🎣 Łów” there (the sea)
//   H  bonus 2 (dev-1410c): Ash on Route 2 — an Eevee READY to evolve and a Water, Thunder and Fire Stone (pick the
//      form in the Pokémon's card), Pikachu in the lead with „✨ Piorun” in the next battle; the 👤 card shows Ash's trait
// PLAYTEST_008 preparation (ChatGPT morning review 15.10 §10–11) — one situation per thing to check on the iPad:
//   I  the Scyther expedition from the start: the rumour heard, Ash in Fuchsia, nothing taken yet (take → the warden
//      → the trail → the encounter → again after a miss → caught)
//   J  ⚡ First Strike: the Power Plant quest taken, Ash there with two badges — the Engineer's team is Electrode ⚡ +
//      Magneton („⚔️ Wyzwanie” → the arena first, then ⚡)
//   K  a KO: a wild Raticate already out, Ash's lead Magikarp at 1 ❤, Pidgey and Rattata healthy (the pick after the KO)
//   L  type +/−: both in Pewter — Ash's Squirtle for Brock's gym, Misty's Charmander for a duel, Sandshrew for Team
//      Rocket at Mt. Moon (its plot revealed: exploring Mt. Moon finds only them), trainers on Route 3
//   M  an important notice: Ash in Viridian with no action left, the Lost Parcel rumour open but not heard — „Koniec”
//      for Ash and Misty, and Ash's next turn starts with „ROZUMIEM”
//   N  the Trainer Journal: the Scyther expedition and Oak's water research taken, Bill's rumour heard (the slot is full —
//      the Journal says why), Ash at Bill's cottage (its next step: Route 25)
//   O  the HUD's activity cards from three systems (ChatGPT review 15.10, P1): Ash in Fuchsia — the Scyther
//      expedition (its warden here: an action now), „Iskra w Vermilion” done (its reward waits in Vermilion), the mission
//      card „Dwóch nowych przyjaciół” started (1/2), and two more taken (not shown: three at most)
// PLAYTEST_009 (night shift 15.10 — the family's Combat MVP feedback, one situation per fix to check):
//   Q  O's three activity cards + a Team Rocket plot on the map: the cards and the Rocket card never cover each other
//      (PT009-09); the cards' pictures 3 : 4 (PT009-01); a card → its Journal card → ✕ / Escape / the map (PT009-02)
//   R  an event with a choice on the table (the Lost backpack, Route 1): the card art left, the text and the choices
//      right (PT009-03); the player popup's missions → the Journal (PT009-08)
//   S  Ash in Pewter's Poké Stop with money and two actions: in the dev-1610 set (`&dev=1610`) entering the Sklep,
//      looking and leaving cost nothing; the first purchase pays its one action (PT009-06); older sets: as before
// COMBAT 2.1 (Piotr 16.10 — open with `&dev=c21` / `&dev=c21b` or in the dev-1610-c21 / dev-1610-c21b package):
//   T  Ash's Pikachu poisoned at 2 ❤ (an Antidote in the bag), no action left: „Koniec” for Ash and Misty → Ash's turn
//      starts with „Pikachu traci 1 HP od trucizny!” (ROZUMIEM); the ☠️ on the card / the widget; the Antidote cures it
//   U  a wild Pidgeotto poisoned at 1 ❤: „Zmiana” → it strikes back → its poison roll (1–2) knocks it out — the battle's
//      own end („zemdlał od trucizny”)
// PLAYTEST_016 (26.10 night — the family's Build 3.10 game; DEV pilots from the URL, e.g. `&dev=fam310,catchguard`):
//   V  the Safari poachers (Team Rocket: no catching) and Ash's Scyther expedition at its encounter step in the Safari
//      Zone — 3.10: the encounter starts, the balls say why they are off; catchguard: the encounter waits, „Wyzwij”
//   W  Team Rocket's fossil thieves at Mt. Moon, Ash on Route 3, Misty in Mt. Moon — 3.10: walk through; rocketentry: a
//      battle on entry (Ash) and at Misty's turn start (she stood there when Rocket came)
//   P  the Combat MVP (its package, dev-1510-combat): Ash's Pikachu (Fala elektryczna — paraliż), Bulbasaur (Trujący pył,
//      Liście brzytwy), Charmander (Żar — oparzenie) against a wild Pidgeotto that knows a Special and a Powerful
// Positions, teams and quest stages are SET (a fixture); everything afterwards is the real game.
import { CONFIG } from '../config.js';
import { createGame, createPokemonInstance } from '../engine/gameState.js';
import { dispatch } from '../engine/turnEngine.js';
import { appearWild } from '../engine/encounterEngine.js';
import { recordQuestEvent } from '../engine/questEngine.js';
import { debugSetPlot } from '../engine/rocketEngine.js';
import { getSpecies } from '../data/pokemon.js';
import { applyAdventure, applyDevPilots } from './setup.js';

export const SCENARIOS = {
  A: 'Normalny start',
  B: 'Plotka usłyszana + aktywna misja',
  C: 'Wyprawa: Scyther',
  D: 'Dwóch graczy w Poké Stopie — wymiana',
  E: 'Dwóch graczy w jednym miejscu — pojedynek',
  F: 'Krok od pierwszego osiągnięcia',
  G: 'Stara wędka i łowienie',
  H: 'Eevee, ruch specjalny i cecha postaci',
  I: 'Wyprawa Scyther od początku',
  J: '⚡ Szybkie wejście (Elektrownia)',
  K: 'KO — kto walczy dalej?',
  L: 'Przewaga typów: sala, pojedynek, Team Rocket',
  M: 'Plotka — ważny komunikat (ROZUMIEM)',
  N: 'Dziennik Trenera',
  O: 'Kafelki obok profilu: trzy rodzaje zadań',
  P: 'Ataki i statusy (Combat MVP)',
  Q: 'PT009: kafelki zadań i Team Rocket',
  R: 'PT009: wydarzenie (obrazek po lewej)',
  S: 'PT009: sklep — oglądanie bez akcji',
  T: 'Combat 2.1: trucizna po walce',
  U: 'Combat 2.1: KO od trucizny w walce',
  V: 'PT016: Safari — Team Rocket blokuje łapanie (Scyther)',
  W: 'PT016: Team Rocket w Mt. Moon — wejście',
};

const team = (s, ids) => ids.map((id) => createPokemonInstance(s, id));
const must = (s, action) => {
  const r = dispatch(s, action);
  if (!r.ok) throw new Error(`scenario: ${action.type} — ${r.error}`);
};
// a rumour open from week 1 and heard by the player (the fixture moves only that opportunity's weeks)
function hearNow(s, player, id) {
  const e = s.rumours.schedule.find((x) => x.id === id);
  if (!e) throw new Error(`scenario: rumour ${id} is not in this game`);
  const span = e.closes - e.appears;
  Object.assign(e, { appears: 1, closes: 1 + span });
  player.rumours.heard[id] = { week: s.turn.round, from: 'pokeStop' };
}

// The scenario tab's storage: the table's save keys (kanto.table.v1 / v2 and their backups) become the scenario's
// own keys; anything else (this device's picture crops) passes through unchanged.
export function scenarioStorage(storage, id) {
  const own = (key) => (/^kanto\.table\.v/.test(key) ? `kanto.table.scenario.${id}.${key.slice('kanto.table.'.length)}` : key);
  return {
    getItem: (key) => storage.getItem(own(key)),
    setItem: (key, value) => storage.setItem(own(key), value),
    removeItem: (key) => storage.removeItem(own(key)),
  };
}

export function buildScenario(id, seed = `SCENARIO-${id}`, options = [], pilots = []) {
  if (!SCENARIOS[id]) throw new Error(`Unknown scenario ${id}`);
  const config = applyDevPilots(applyAdventure(structuredClone(CONFIG), options), pilots); // the package's set (the Combat MVP package: 'combat'); PT016: the URL's DEV pilots too
  config.dice.mode = 'playerDice';
  const s = createGame({ seed, players: [{ character: 'ash', controller: 'human' }, { character: 'misty', controller: 'human' }], config });
  const [ash, misty] = s.players;
  if (id === 'B') {
    hearNow(s, ash, 'opp-parcel');
    ash.location = 'viridian-city';
    must(s, { type: 'takeQuest', quest: 'viridian-parcel' });
  } else if (id === 'C' || id === 'V') {
    hearNow(s, ash, 'opp-scyther');
    ash.location = 'fuchsia-city';
    ash.team = team(s, ['pikachu', 'pidgeotto', 'ivysaur']);
    ash.pokeballs = 5;
    must(s, { type: 'takeQuest', quest: 'safari-scyther' });
    const a = ash.questBook.active.find((x) => x.questId === 'safari-scyther');
    a.stage = 2; // the warden beaten and the trail found: the encounter step
    a.progress = {};
    ash.location = 'safari-zone';
    if (id === 'V') debugSetPlot(s, 'safari-poachers'); // PT016-01: Team Rocket's net over the Safari's grass
  } else if (id === 'D') {
    ash.team = team(s, ['pikachu', 'pidgey', 'rattata']);
    misty.team = team(s, ['staryu', 'psyduck', 'goldeen']);
    misty.reserve = team(s, ['horsea']);
    for (const p of s.players) p.location = 'pewter-city';
  } else if (id === 'E') {
    ash.team = team(s, ['pikachu', 'pidgey']);
    misty.team = team(s, ['staryu', 'psyduck']);
    for (const p of s.players) p.location = 'route-2';
  } else if (id === 'F') {
    ash.location = 'cerulean-city';
    ash.visited = ['pallet-town', 'route-1', 'viridian-city', 'route-2', 'pewter-city', 'route-3', 'mt-moon', 'route-4', 'cerulean-city'];
  } else if (id === 'G') {
    ash.location = 'cerulean-city';
    must(s, { type: 'takeQuest', quest: 'sailor-water-show' });
    ash.team = team(s, ['pikachu', 'staryu', 'psyduck']);
    ash.pokeballs = 5;
    ash.location = 'route-6';
  } else if (id === 'H') {
    const eevee = createPokemonInstance(s, 'eevee');
    eevee.growth = 99; // READY (capped to its threshold on the card)
    ash.team = [team(s, ['pikachu'])[0], eevee, team(s, ['pidgey'])[0]];
    Object.assign(ash.items, { waterstone: 1, thunderstone: 1, firestone: 1 });
    ash.location = 'route-2';
  } else if (id === 'I') {
    hearNow(s, ash, 'opp-scyther');
    ash.team = team(s, ['pikachu', 'pidgeotto', 'ivysaur']);
    ash.pokeballs = 5;
    ash.location = 'fuchsia-city';
  } else if (id === 'J') {
    hearNow(s, ash, 'opp-power-plant');
    ash.badges = ['boulder', 'cascade']; // a quest trainer's team grows with the badges: two → his strongest
    ash.team = team(s, ['pikachu', 'pidgeotto', 'ivysaur']);
    ash.location = 'power-plant';
    must(s, { type: 'takeQuest', quest: 'power-plant-fault' });
    s.turn.actionsRemaining = Math.max(s.turn.actionsRemaining, 1);
  } else if (id === 'K') {
    ash.team = team(s, ['magikarp', 'pidgey', 'rattata']);
    ash.team[0].hp = 1;
    ash.location = 'route-1';
    appearWild(s, getSpecies('raticate'), 'grass'); // the engine's own „a wild … appears”
  } else if (id === 'L') {
    ash.team = team(s, ['squirtle', 'sandshrew', 'pikachu']);
    misty.team = team(s, ['charmander', 'goldeen']);
    ash.pokeballs = 5;
    for (const p of s.players) p.location = 'pewter-city';
    debugSetPlot(s, 'fossil-thieves');
  } else if (id === 'M') {
    const e = s.rumours.schedule.find((x) => x.id === 'opp-parcel');
    const span = e.closes - e.appears;
    Object.assign(e, { appears: 1, closes: 1 + span });
    ash.rumours.lastHeardRound = 0;
    ash.location = 'viridian-city';
    misty.location = 'route-11'; // no Poké Stop, far from Viridian (its rumour reaches 4 steps): Ash hears it, not Misty
    s.turn.actionsRemaining = 0; // „Koniec” ends Ash's turn at once
  } else if (id === 'N') {
    hearNow(s, ash, 'opp-scyther');
    hearNow(s, ash, 'opp-bill');
    ash.team = team(s, ['pikachu', 'pidgeotto', 'ivysaur']);
    ash.location = 'fuchsia-city';
    must(s, { type: 'takeQuest', quest: 'safari-scyther' });
    must(s, { type: 'takeQuest', quest: 'oak-water' });
    ash.location = 'bills-cottage';
    s.turn.actionsRemaining = Math.max(s.turn.actionsRemaining, 1);
  } else if (id === 'P') {
    const [pika, bulba, charm] = team(s, ['pikachu', 'bulbasaur', 'charmander']);
    pika.moves = { special: 'thunderWave', powerful: 'thunderbolt' };
    bulba.moves = { special: 'poisonPowder', powerful: 'razorLeaf' };
    charm.moves = { special: 'ember', powerful: null };
    ash.team = [pika, bulba, charm];
    ash.location = 'route-1';
    const wild = appearWild(s, getSpecies('pidgeotto'), 'grass');
    wild.moves = { special: 'quickAttack', powerful: 'wingAttack' };
  } else if (id === 'S') {
    ash.location = 'pewter-city';
    ash.money = 10;
    s.turn.actionsRemaining = 2;
  } else if (id === 'T') {
    const [pika, rat] = team(s, ['pikachu', 'rattata']);
    pika.hp = 2;
    pika.status = { id: 'poison', ticks: 0 }; // a Combat 2.1 poison that outlived its battle (in an S1 set it simply never ticks)
    ash.team = [pika, rat];
    ash.items.antidote = 1;
    ash.location = 'route-1';
    misty.location = 'route-11';
    s.turn.actionsRemaining = 0;
  } else if (id === 'W') {
    ash.team = team(s, ['pikachu', 'pidgeotto', 'ivysaur']);
    ash.location = 'route-3';
    misty.team = team(s, ['staryu', 'psyduck']);
    misty.location = 'mt-moon'; // with rocketentry: Rocket lands where Misty stands — she meets them at her turn start
    debugSetPlot(s, 'fossil-thieves'); // PT016-11: Team Rocket at Mt. Moon, one step ahead
  } else if (id === 'U') {
    ash.team = team(s, ['pikachu', 'bulbasaur']);
    ash.location = 'route-1';
    const wild = appearWild(s, getSpecies('pidgeotto'), 'grass');
    wild.hp = 1;
    if (['c21', 'c21b'].includes(s.config.rules.statusRules)) wild.status = { id: 'poison', ticks: 0 };
    else (s.encounter.status ??= {})[wild.uid] = { id: 'poison', ticks: 0 };
  } else if (id === 'R') {
    ash.location = 'route-1';
    s.phase = 'event'; // as drawEvent leaves it after an Explore found this card
    s.pendingEvent = { id: s.config.rules.eventPack === 'b4h2' ? 'rustling-backpack' : 'lost-backpack', biome: 'grass' }; // K-05 W1: the set's own backpack
  } else if (id === 'O' || id === 'Q') {
    ash.team = team(s, ['pikachu', 'pidgeotto', 'ivysaur']);
    ash.location = 'vermilion-city';
    must(s, { type: 'takeQuest', quest: 'vermilion-spark' });
    recordQuestEvent(s, ash, { kind: 'catch', species: 'pikachu', location: 'route-11', biome: 'grass' }); // done: collect in Vermilion
    ash.location = 'fuchsia-city';
    must(s, { type: 'takeQuest', quest: 'oak-water' });
    hearNow(s, ash, 'opp-scyther');
    must(s, { type: 'takeQuest', quest: 'safari-scyther' });
    // the mission cards after the catch (it would count for „Złap 2 Pokémony”): one started, one only taken
    ash.quests = [{ questId: 'oak-two', progress: 1, acquiredRound: s.turn.round }, { questId: 'jenny-trainer', progress: 0, acquiredRound: s.turn.round }];
    s.turn.actionsRemaining = Math.max(s.turn.actionsRemaining, 2);
    if (id === 'Q') debugSetPlot(s, 'fossil-thieves'); // the Team Rocket card on the map with the HUD's three cards
  }
  s.scenario = id; // a marker for the table (the settings say it is a test scenario)
  return s;
}
