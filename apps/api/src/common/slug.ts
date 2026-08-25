const COMBINING_DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')

export function slugify(input: string): string {
  const slug = input
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '') // supprime les diacritiques isoles par NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
  return slug || 'n-a'
}
