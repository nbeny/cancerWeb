/**
 * Habillage typographique du corps d'un article rendu depuis du Markdown.
 *
 * PARTAGÉ entre le blog public (`app/blog/[domainSlug]/[articleSlug]/
 * article-view.tsx`, qui injecte `renderedHtml`) et l'aperçu du back-office
 * (`components/editor/preview.tsx`, qui rend le Markdown côté client). C'est
 * ce partage qui donne son sens au mot « aperçu » : sans lui, les deux
 * surfaces divergeraient au premier ajustement fait d'un seul côté, et le
 * rédacteur verrait autre chose que ce qu'il publie.
 *
 * Écrit en variantes arbitraires (`[&_h2]:...`) et non en classes `prose` :
 * `@tailwindcss/typography` n'est pas installé dans ce projet. Surtout, ces
 * règles doivent s'appliquer à des balises qu'on ne peut pas décorer une à
 * une — le HTML public est généré côté API, et l'aperçu est produit par
 * `react-markdown`.
 */
export const STYLE_CORPS_MARKDOWN = [
  // Le blog public n'a jamais de `<h1>` dans le corps (`normaliserTitresCorps`
  // le retire ou le rétrograde pour réserver ce niveau au titre de la page) :
  // cette règle ne sert donc qu'à l'aperçu, où le `# Titre` de tête est bien
  // rendu. Inerte côté public, elle y reste par symétrie.
  '[&_h1]:mt-0 [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-slate-900',
  '[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-slate-900',
  '[&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-slate-900',
  '[&_p]:my-4 [&_p]:leading-7',
  '[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1',
  '[&_a]:text-blue-600 [&_a]:underline [&_a]:underline-offset-2',
  '[&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-200 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-slate-600',
  '[&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em]',
  '[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-slate-900 [&_pre]:p-4 [&_pre]:text-sm [&_pre]:text-slate-100',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit',
  '[&_img]:my-4 [&_img]:rounded-md',
  '[&_table]:my-4 [&_table]:w-full [&_table]:text-left [&_th]:border-b [&_th]:border-slate-200 [&_th]:py-2 [&_td]:border-b [&_td]:border-slate-100 [&_td]:py-2',
  '[&_hr]:my-8 [&_hr]:border-slate-200',
].join(' ')
