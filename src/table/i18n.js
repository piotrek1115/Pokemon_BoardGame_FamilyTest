// Polish family copy for the digital tabletop. Species, places, leaders and
// mission texts come from the data files (English for now).
import { statusProcFaces, statusRulesOf } from '../engine/combatMoves.js';
import { statusRules } from '../combat2/statuses.js';
export const RARITY_PL = { common: 'Pospolity', rare: 'Rzadki', superRare: 'Bardzo rzadki' };

export const TYPE_PL = {
  normal: 'Normalny', fire: 'Ognisty', water: 'Wodny', electric: 'Elektryczny', grass: 'Trawiasty', ice: 'Lodowy',
  fighting: 'Walczący', poison: 'Trujący', ground: 'Ziemny', flying: 'Latający', psychic: 'Psychiczny',
  bug: 'Robak', rock: 'Skalny', ghost: 'Duch', dragon: 'Smok',
};

export const BIOME_PL = {
  grass: 'Trawa', forest: 'Las', water: 'Jezioro', sea: 'Morze', beach: 'Plaża', cave: 'Jaskinia',
  haunted: 'Nawiedzone', city: 'Miasto', air: 'Niebo',
};

export const OUTCOME_PL = {
  nothing: 'Cisza… nic się nie dzieje',
  event: 'Wydarzenie!',
  trainer: 'Trener wyzywa cię!',
  pokemon: 'Dziki Pokémon!',
  pokemonBonus: 'Dziki Pokémon! (+1 do rzadkości)',
};

export const DICE_MODE_PL = {
  playerDice: { name: 'Kości gracza', hint: 'Rzucasz fizycznie: atak i kostka łapania. Resztę rzuca gra.' },
  allPhysical: { name: 'Wszystkie fizyczne', hint: 'Każdy rzut wpisujecie z prawdziwych kości, także za świat i AI.' },
  digital: { name: 'Cyfrowe', hint: 'Gra rzuca wszystkimi kośćmi.' },
};

// Catch Dice: colour + secondary identity (● = Poké Ball faces).
export const CATCH_DIE = {
  blue: { name: 'Niebieska', icon: '🔵', dots: '●●●', word: 'łatwa' },
  purple: { name: 'Fioletowa', icon: '🟣', dots: '●●', word: 'średnia' },
  magenta: { name: 'Magenta', icon: '🩷', dots: '●', word: 'trudna' },
  // Macro 01 (rules.catchDice 'v2'): the fourth, easiest Catch Die
  green: { name: 'Zielona', icon: '🟢', dots: '●●●●', word: 'najłatwiejsza' },
};

// Escape Dice: colour + secondary identity (🌬️ = flee faces).
export const ESCAPE_DIE = {
  red: { name: 'Czerwona', icon: '🔴', wind: '🌬️🌬️🌬️', flee: 3, zone: 'czerwona strefa' },
  yellow: { name: 'Żółta', icon: '🟡', wind: '🌬️🌬️', flee: 2, zone: 'żółta strefa' },
  green: { name: 'Zielona', icon: '🟢', wind: '🌬️', flee: 1, zone: 'zielona strefa' },
};

// Playtest 004 (DQ-108): the ball with id `superball` is called Great Ball at the
// table (every game; the id and the engine's English name stay for saves / replays).
export const BALL_PL = { pokeball: 'Poké Ball', superball: 'Great Ball', ultraball: 'Ultra Ball' };
// Canonical item names stay (DQ-73), stones included.
export const ITEM_PL = {
  pokeball: 'Poké Ball', superball: 'Great Ball', ultraball: 'Ultra Ball', potion: 'Potion', superpotion: 'Super Potion', revive: 'Revive',
  thunderstone: 'Thunder Stone', waterstone: 'Water Stone', firestone: 'Fire Stone', leafstone: 'Leaf Stone', moonstone: 'Moon Stone',
  antidote: 'Antidote', burnheal: 'Burn Heal', paralyzeheal: 'Paralyze Heal', awakening: 'Awakening', fullheal: 'Full Heal', // COMBAT 2.1
};

export function stageLabel(stage) {
  return ['', 'I', 'II', 'III'][stage] ?? String(stage);
}

// What a d6 is for, from the engine's roll label.
// Combat MVP / Combat 2.1: a status die asked for at the table (dice mode „wszystkie fizyczne”) in the game's own words
// and numbers — the engine's label („Status: Pidgeotto: poison”) is never shown. `config`: the game (its status rules).
const STATUS_DIE_PL = Object.freeze({ poison: ['☠️', 'Trucizna'], burn: ['♨️', 'Oparzenie'], paralysis: ['⚡', 'Paraliż'], sleep: ['💤', 'Sen'] });
const facesPl = (faces) => (faces.length > 1 && faces.at(-1) - faces[0] === faces.length - 1 ? `${faces[0]}–${faces.at(-1)}` : faces.join(', '));
function statusDiePurpose(label, config) {
  const proc = /^Status proc: (.+): (\w+)$/.exec(label);
  const tick = /^Status: (.+): (\w+)$/.exec(label);
  const m = proc ?? tick;
  const pl = m && STATUS_DIE_PL[m[2]];
  if (!pl) return null;
  const [icon, name] = pl;
  if (proc) return `${icon} ${name} na ${m[1]}? ${config ? facesPl(statusProcFaces(config) ?? [3, 4, 5, 6]) : '3–6'} = wchodzi`;
  const R = config ? statusRulesOf(config) : statusRules('S1');
  if (m[2] === 'paralysis') return `${icon} ${name}: ${m[1]} — ${facesPl(R.paralysis.blockFaces)} = nie atakuje`;
  if (m[2] === 'sleep') return `${icon} ${name}: ${m[1]} — ${facesPl(R.sleep.wakeFaces)} = budzi się`;
  const r = R[m[2]];
  return `${icon} ${name}: ${m[1]} — ${r.faces ? facesPl(r.faces) : '1–6'} = −${r.amount} ❤`;
}

export function d6Purpose(label, config = null) {
  const status = /^Status/.test(label) ? statusDiePurpose(label, config) : null;
  if (status) return status;
  if (label === 'Encounter') return 'Eksploracja';
  if (label === 'Rarity') return 'Rzadkość';
  if (label === 'Team Rocket') return 'Team Rocket — początek tygodnia';
  if (/Meowth/i.test(label)) return 'Meowth';
  if (/difficulty/i.test(label)) return 'Trudność trenera';
  if (label === 'Trainer type') return 'Rodzaj trenera';
  if (label === 'Loot') return 'Łup od trenera'; // Build 3.3 E2
  if (label === 'Fishing') return '🎣 Łowienie — bierze? (3–6)'; // bonus 14.10
  const m = /^(.+) attacks (.+)$/.exec(label);
  if (m) return `Atak: ${m[1]} → ${m[2]}`;
  return label;
}

export const D6_FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export function plural(n, one, few, many) {
  if (n === 1) return one;
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
}

// „za 1 turę / 2 tury / 5 tur” (Macro 01: Professor Oak's Research Jobs).
export function turnsPl(n) {
  const word = n === 1 ? 'turę' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'tury' : 'tur';
  return `${n} ${word}`;
}
