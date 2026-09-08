/**
 * Page provisoire : elle prouve que le routage par sous-domaine aboutit
 * (voir `proxy.ts`). Le Lot 3 la remplace par le vrai sommaire du blog,
 * qui interrogera l'API et répondra 404 sur un slug inconnu.
 */
export default async function BlogAccueilPage({
  params,
}: {
  params: Promise<{ domainSlug: string }>
}) {
  const { domainSlug } = await params
  return <p>Blog : {domainSlug}</p>
}
