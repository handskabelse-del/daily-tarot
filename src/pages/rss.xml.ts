import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE } from '../lib/i18n';

export async function GET(context: { site: URL | undefined }) {
  const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );
  return rss({
    title: `${SITE.name} — Blog`,
    description: 'Tarot readings, card meanings, and daily practice.',
    site: context.site || SITE.url,
    items: posts.map((p) => ({
      title: p.data.title,
      pubDate: p.data.date,
      description: p.data.description,
      link: `/blog/${p.slug}`,
    })),
  });
}
