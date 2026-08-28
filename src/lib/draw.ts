import type { Card } from './cards';
import { DECK } from './cards';

export type Position = {
  index: number;
  name: string;
  prompt: string;
};

export const POSITIONS: Position[] = [
  { index: 1, name: 'The Present', prompt: 'What is happening right now in your situation' },
  { index: 2, name: 'The Challenge', prompt: 'The immediate obstacle or tension you face' },
  { index: 3, name: 'The Foundation', prompt: 'The underlying cause or past influence' },
  { index: 4, name: 'The Recent Past', prompt: 'An energy that is just departing' },
  { index: 5, name: 'The Crown', prompt: 'The conscious goal or best possible outcome' },
  { index: 6, name: 'The Near Future', prompt: 'What is approaching within days or weeks' },
  { index: 7, name: 'The Self', prompt: 'Your current attitude or inner state' },
  { index: 8, name: 'The Environment', prompt: 'How others or your surroundings are influencing you' },
  { index: 9, name: 'The Outcome', prompt: 'The likely resolution if the current path continues' },
];

export type DrawCard = {
  id: string;
  orientation: 'upright' | 'reversed';
  position: Position;
  card: Card;
};

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function drawNine(): DrawCard[] {
  const shuffled = fisherYates(DECK).slice(0, 9);
  return shuffled.map((card, i) => {
    const reversed = Math.random() < 0.5;
    return {
      id: card.id,
      card,
      position: POSITIONS[i],
      orientation: reversed ? 'reversed' : 'upright',
    };
  });
}

export function deterministicDrawForDate(seed: string): DrawCard[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const idx = [...Array(DECK.length).keys()];
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, 9).map((deckIdx, i) => {
    const card = DECK[deckIdx];
    const reversed = rand() < 0.5;
    return {
      id: card.id,
      card,
      position: POSITIONS[i],
      orientation: reversed ? 'reversed' : 'upright',
    };
  });
}
