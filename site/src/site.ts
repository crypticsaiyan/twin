export const REPO = 'https://github.com/crypticsaiyan/twin';
export const ISSUE = 'https://github.com/apache/echarts/issues/21538';
export const EXAMPLE = `${REPO}/tree/main/examples/echarts-21538`;
export const SOLARI = 'https://getsolari.com';

/** Build an internal link that respects the configured `base` (see astro.config.mjs). */
export function link(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/${path.replace(/^\//, '')}`;
}
