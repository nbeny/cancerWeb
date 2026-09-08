import { describe, expect, it } from 'vitest'
import { domainSlugFromHost } from './subdomain'

describe('domainSlugFromHost', () => {
  const root = 'localhost'

  it.each([
    ['cybersecurite.localhost', 'cybersecurite'],
    ['cybersecurite.localhost:3000', 'cybersecurite'],
    ['Cybersecurite.LOCALHOST:3000', 'cybersecurite'],
  ])('extrait le slug de %s', (host, expected) => {
    expect(domainSlugFromHost(host, root)).toBe(expected)
  })

  it.each([
    ['localhost', "l'hôte nu sert le back-office"],
    ['localhost:3000', "l'hôte nu avec port sert le back-office"],
    ['127.0.0.1:3000', 'une IP ne porte aucun sous-domaine'],
    ['exemple.com', "un hôte hors du domaine racine n'est pas reconnu"],
    ['', 'un en-tête Host vide'],
  ])('renvoie null pour %s (%s)', (host) => {
    expect(domainSlugFromHost(host, root)).toBeNull()
  })

  it('renvoie null quand Host est absent', () => {
    expect(domainSlugFromHost(null, root)).toBeNull()
  })

  it('ne retient que le premier label sur un sous-domaine imbriqué', () => {
    expect(domainSlugFromHost('a.b.localhost', root)).toBeNull()
  })

  it('fonctionne avec un domaine racine de production', () => {
    expect(domainSlugFromHost('cybersecurite.exemple.com', 'exemple.com')).toBe('cybersecurite')
    expect(domainSlugFromHost('exemple.com', 'exemple.com')).toBeNull()
  })

  // Cas limites ajoutés au-delà de la table du plan : cette fonction est la
  // porte d'entrée du routage (Task 2 rewrite vers le blog ou laisse passer
  // vers le back-office), donc un cas mal géré ici se traduit soit par un
  // blog servi à la mauvaise adresse, soit par un blog inatteignable.

  it("renvoie null pour un label vide devant le domaine racine (host commençant par un point)", () => {
    // `.localhost` n'est pas un hôte qu'un navigateur envoie jamais, mais rien
    // n'empêche un client de le forger. `suffix` (`.localhost`) matche la
    // chaîne entière, laissant un slug vide — sans ce test, un slug vide
    // franchirait la vérification `!slug` de justesse si elle était retirée
    // par erreur lors d'une future modification.
    expect(domainSlugFromHost('.localhost', root)).toBeNull()
  })

  it('renvoie null pour un Host avec un point final (FQDN DNS valide)', () => {
    // `cybersecurite.localhost.` est un nom de domaine pleinement qualifié
    // valide en DNS (le point final désigne la racine). Sans normalisation
    // explicite, ce point final resterait accroché au dernier label du slug
    // extrait (`localhost.` ne matchant pas le suffixe `.localhost`), et la
    // requête tomberait à tort sur le back-office plutôt que sur le blog.
    // On documente ce choix : l'implémentation ne le gère pas nativement,
    // ce test sert de garde-fou explicite plutôt que de silencieusement
    // espérer un comportement.
    expect(domainSlugFromHost('cybersecurite.localhost.', root)).toBeNull()
  })

  it('tolère les espaces parasites autour du Host', () => {
    // Un serveur HTTP conforme normalise déjà l'en-tête `Host` (l'espace
    // entourant sa valeur fait partie du « optional whitespace » retiré à
    // l'analyse de la requête) : ce cas ne peut donc pas se présenter via un
    // vrai en-tête. Le `.trim()` de l'implémentation est une hygiène
    // défensive plutôt qu'une protection contre une attaque — ce test fige
    // cette intention pour qu'un futur retrait accidentel du `.trim()` soit
    // détecté, sans pour autant faire retomber ce cas sur le back-office.
    expect(domainSlugFromHost(' cybersecurite.localhost ', root)).toBe('cybersecurite')
  })
})
