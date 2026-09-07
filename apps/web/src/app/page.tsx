import { redirect } from 'next/navigation'

/**
 * La racine appartiendra au blog public (Lot 3). En attendant, elle redirige
 * vers le tableau de bord plutôt que d'afficher la page d'accueil par défaut
 * du scaffold Next.js : un visiteur qui ouvre l'application doit atterrir sur
 * quelque chose d'utile, pas sur « Create Next App ».
 *
 * `proxy.ts` protège `/dashboard` : un visiteur non authentifié est renvoyé
 * vers `/auth/login`, un visiteur authentifié arrive sur son tableau de bord.
 */
export default function RacinePage(): never {
  redirect('/dashboard')
}
