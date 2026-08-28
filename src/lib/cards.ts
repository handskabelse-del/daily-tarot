import cardsData from '../content/cards.json';

export type Card = {
  id: string;
  name: string;
  arcana: 'major' | 'minor';
  suit?: 'wands' | 'cups' | 'swords' | 'pentacles';
  number: number;
  keywords: string[];
  image?: string;
};

export const DECK: Card[] = (cardsData as { deck: Card[] }).deck;

const IMAGE_MAP: Record<string, string> = {
  'major-0': '/assets/cards/0-The-Fool.jfif',
  'major-1': '/assets/cards/1-the-magician.jfif',
  'major-2': '/assets/cards/2-the-high-priestess.jfif',
  'major-3': '/assets/cards/3-the-empress.jfif',
  'major-4': '/assets/cards/4-the-emperor.jfif',
  'major-5': '/assets/cards/5-hierophant.jfif',
  'major-6': '/assets/cards/6-the-lovers.jfif',
  'major-7': '/assets/cards/7-the-chariot.jfif',
  'major-8': '/assets/cards/8-Strength.jfif',
  'major-9': '/assets/cards/9-The-Hermit.jfif',
};

export function getCard(id: string): Card | undefined {
  return DECK.find((c) => c.id === id);
}

export function imageFor(card: Card): string | undefined {
  return IMAGE_MAP[card.id];
}

export function slugify(card: Card): string {
  return card.name
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function cardSuitSymbol(suit?: string): string {
  switch (suit) {
    case 'wands':
      return '🜂';
    case 'cups':
      return '🜄';
    case 'swords':
      return '🜁';
    case 'pentacles':
      return '🜃';
    default:
      return '✶';
  }
}
