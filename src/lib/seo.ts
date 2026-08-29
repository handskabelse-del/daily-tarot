import { SITE, type Locale, LOCALES } from './i18n';

export type SeoInput = {
  title: string;
  description?: string;
  path?: string;
  locale?: Locale;
  type?: 'website' | 'article';
  image?: string;
  noindex?: boolean;
};

export function buildMeta(input: SeoInput) {
  const title = input.title.includes(SITE.name) ? input.title : `${input.title} | ${SITE.name}`;
  const description = input.description || SITE.description;
  const url = `${SITE.url}${input.path || '/'}`;
  const locale = input.locale || 'en';
  const image = input.image || '/og/default.png';
  const type = input.type || 'website';

  return {
    title,
    description,
    canonical: url,
    openGraph: {
      type,
      url,
      title,
      description,
      siteName: SITE.name,
      images: [{ url: `${SITE.url}${image}`, width: 1200, height: 630 }],
      locale: LOCALES[locale].hreflang,
    },
    twitter: {
      card: 'summary_large_image',
      site: SITE.twitterHandle,
      title,
      description,
      images: [`${SITE.url}${image}`],
    },
  };
}

export function buildHreflangs(
  path: string,
  availableLocales: Array<'en' | 'es' | 'fr'> = ['en', 'es', 'fr'],
): Array<{ hreflang: string; href: string }> {
  const clean = path.startsWith('/') ? path : `/${path}`;
  const tail = clean === '/' ? '/' : clean;
  const out: Array<{ hreflang: string; href: string }> = [];
  for (const loc of availableLocales) {
    const prefix = loc === 'en' ? '' : `/${loc}`;
    out.push({
      hreflang: LOCALES[loc].hreflang,
      href: `${SITE.url}${prefix}${tail}`,
    });
  }
  out.push({ hreflang: 'x-default', href: `${SITE.url}${tail}` });
  return out;
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    inLanguage: ['en-US', 'es-ES', 'fr-FR'],
  };
}

export function articleJsonLd(input: { title: string; description: string; path: string; date: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description,
    datePublished: input.date,
    dateModified: input.date,
    author: { '@type': 'Organization', name: SITE.name },
    publisher: {
      '@type': 'Organization',
      name: SITE.name,
      url: SITE.url,
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE.url}${input.path}` },
  };
}

export function faqJsonLd(faqs: Array<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

export function breadcrumbJsonLd(
  items: Array<{ name: string; path: string }>,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE.url}${item.path}`,
    })),
  };
}

export function webApplicationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    applicationCategory: 'LifestyleApplication',
    operatingSystem: 'Any',
    inLanguage: ['en-US', 'es-ES', 'fr-FR'],
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };
}
