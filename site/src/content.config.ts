import { defineCollection } from 'astro:content';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  // UI string overrides (src/content/i18n/en.json, empty for now). Declared so Starlight's lookup is quiet.
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
};
