export const SITE = {
  name: 'Daily Tarot',
  url: 'https://dailytarot.example.com',
  description: 'Free daily tarot reading with 9 cards. Get a personalized, AI-generated interpretation each day. Discover what the cards say about your path.',
  locale: 'en',
  twitterHandle: '@dailytarot',
};

export type Locale = 'en' | 'es' | 'fr';

export const LOCALES: Record<Locale, { code: string; label: string; hreflang: string }> = {
  en: { code: 'en', label: 'English', hreflang: 'en-US' },
  es: { code: 'es', label: 'Español', hreflang: 'es-ES' },
  fr: { code: 'fr', label: 'Français', hreflang: 'fr-FR' },
};

type Dict = {
  heroTitle: string;
  heroSubtitle: string;
  ctaGetReading: string;
  ctaReject: string;
  ctaAccept: string;
  ctaShare: string;
  remainingLabel: (n: number) => string;
  lockedTitle: string;
  lockedSubtitle: string;
  acceptKeyPrompt: string;
  acceptKeyLabel: string;
  reading: string;
  advice: string;
  enterKeyTitle: string;
  enterKeyHelp: string;
};

const dicts: Record<Locale, Dict> = {
  en: {
    heroTitle: 'Your Daily Tarot Reading',
    heroSubtitle:
      'Draw nine cards and receive a personal interpretation. Refresh your perspective in under a minute.',
    ctaGetReading: 'Get my reading',
    ctaReject: 'Reject & draw again',
    ctaAccept: 'Accept this reading',
    ctaShare: 'Share',
    remainingLabel: (n) => `Rejections remaining: ${n}/2`,
    lockedTitle: 'Your daily reading is set',
    lockedSubtitle: 'Come back tomorrow for a fresh perspective. The cards will be waiting.',
    acceptKeyPrompt: 'Want to keep this reading?',
    acceptKeyLabel: 'Save it',
    reading: 'Reading',
    advice: 'Guidance',
    enterKeyTitle: 'OpenRouter API key required',
    enterKeyHelp:
      'We use your own OpenRouter key to generate readings. The key is stored only in this browser and sent only to OpenRouter.',
  },
  es: {
    heroTitle: 'Tu lectura de tarot diaria',
    heroSubtitle:
      'Saca nueve cartas y recibe una interpretación personal. Renueva tu perspectiva en menos de un minuto.',
    ctaGetReading: 'Recibir mi lectura',
    ctaReject: 'Rechazar y sacar de nuevo',
    ctaAccept: 'Aceptar esta lectura',
    ctaShare: 'Compartir',
    remainingLabel: (n) => `Rechazos restantes: ${n}/2`,
    lockedTitle: 'Tu lectura diaria está lista',
    lockedSubtitle: 'Vuelve mañana para una nueva perspectiva. Las cartas te esperarán.',
    acceptKeyPrompt: '¿Quieres guardar esta lectura?',
    acceptKeyLabel: 'Guardar',
    reading: 'Lectura',
    advice: 'Consejo',
    enterKeyTitle: 'Se requiere clave de OpenRouter',
    enterKeyHelp:
      'Usamos tu propia clave de OpenRouter para generar lecturas. La clave solo se guarda en este navegador.',
  },
  fr: {
    heroTitle: 'Votre tirage de tarot quotidien',
    heroSubtitle:
      'Tirez neuf cartes et recevez une interprétation personnelle. Renouvelez votre perspective en moins d’une minute.',
    ctaGetReading: 'Recevoir mon tirage',
    ctaReject: 'Refuser et retirer',
    ctaAccept: 'Accepter ce tirage',
    ctaShare: 'Partager',
    remainingLabel: (n) => `Refus restants : ${n}/2`,
    lockedTitle: 'Votre tirage du jour est prêt',
    lockedSubtitle: 'Revenez demain pour une nouvelle perspective. Les cartes vous attendront.',
    acceptKeyPrompt: 'Voulez-vous garder ce tirage ?',
    acceptKeyLabel: 'Enregistrer',
    reading: 'Tirage',
    advice: 'Conseil',
    enterKeyTitle: 'Clé API OpenRouter requise',
    enterKeyHelp:
      'Nous utilisons votre propre clé OpenRouter pour générer les tirages. La clé n’est stockée que dans ce navigateur.',
  },
};

export function t(locale: Locale): Dict {
  return dicts[locale] || dicts.en;
}

export function pathFor(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (locale === 'en') return clean;
  return `/${locale}${clean}`;
}
