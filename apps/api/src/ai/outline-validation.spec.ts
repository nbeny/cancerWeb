import { makeDomain } from './test-fixtures'
import { MAX_OUTLINE_LENGTH, validateOutline } from './outline-validation'

const VALID_MD = [
  "# Comprendre l'immunothérapie moderne",
  '',
  "## Qu'est-ce que l'immunothérapie ?",
  "Explique le mécanisme général en une phrase.",
  '',
  '## Les principaux types de traitements',
  'Présente les grandes familles de traitements.',
  '',
  '### Inhibiteurs de points de contrôle',
  'Détaille ce mécanisme précis.',
].join('\n')

describe('validateOutline', () => {
  it('accepte un plan valide (un H1, au moins deux H2, pas de saut de niveau)', () => {
    const result = validateOutline(VALID_MD, makeDomain())
    expect(result.valid).toBe(true)
    if (!result.valid) throw new Error('unreachable')
    expect(result.outline.h1).toBe("Comprendre l'immunothérapie moderne")
    expect(result.outline.sections).toEqual([
      { title: "Qu'est-ce que l'immunothérapie ?", depth: 2 },
      { title: 'Les principaux types de traitements', depth: 2 },
      { title: 'Inhibiteurs de points de contrôle', depth: 3 },
    ])
  })

  it("rejette un plan sans aucun titre H1, avec une raison actionnable", () => {
    const md = ['## Section A', 'Intention A.', '', '## Section B', 'Intention B.'].join('\n')
    const result = validateOutline(md, makeDomain())
    expect(result.valid).toBe(false)
    if (result.valid) throw new Error('unreachable')
    expect(result.reason).toMatch(/H1/)
  })

  it('rejette un plan avec deux titres H1', () => {
    const md = ['# Premier titre', '## Section A', '## Section B', '# Second titre'].join('\n')
    const result = validateOutline(md, makeDomain())
    expect(result.valid).toBe(false)
    if (result.valid) throw new Error('unreachable')
    expect(result.reason).toMatch(/deux titres|2 titres/i)
    expect(result.reason).toMatch(/H1/)
  })

  it("rejette un plan avec moins de deux titres H2", () => {
    const md = ['# Titre principal', '## Unique section'].join('\n')
    const result = validateOutline(md, makeDomain())
    expect(result.valid).toBe(false)
    if (result.valid) throw new Error('unreachable')
    expect(result.reason).toMatch(/H2/)
  })

  it('rejette un plan contenant un titre vide', () => {
    const md = ['# Titre principal', '## Section A', '##   ', '## Section B'].join('\n')
    const result = validateOutline(md, makeDomain())
    expect(result.valid).toBe(false)
    if (result.valid) throw new Error('unreachable')
    expect(result.reason).toMatch(/vide/i)
  })

  it('rejette un saut de niveau (H2 vers H4 sans H3)', () => {
    const md = ['# Titre principal', '## Section A', '## Section B', '#### Sous-section trop profonde'].join('\n')
    const result = validateOutline(md, makeDomain())
    expect(result.valid).toBe(false)
    if (result.valid) throw new Error('unreachable')
    expect(result.reason).toMatch(/saute|saut/i)
  })

  it('rejette un plan trop long (le modèle a rédigé un article, pas un plan)', () => {
    const paddingSection = (n: number) => `## Section ${n}\n${'Une phrase assez longue pour simuler du contenu rédigé plutôt qu\'une intention. '.repeat(10)}`
    const md = ['# Titre principal', ...Array.from({ length: 30 }, (_, i) => paddingSection(i + 1))].join('\n\n')
    expect(md.length).toBeGreaterThan(MAX_OUTLINE_LENGTH)

    const result = validateOutline(md, makeDomain())
    expect(result.valid).toBe(false)
    if (result.valid) throw new Error('unreachable')
    expect(result.reason).toMatch(/long/i)
  })

  it('rejette un plan qui aborde frontalement un sujet exclu du domaine', () => {
    const domain = makeDomain({ excludedTopics: ['Homéopathie'] })
    const md = ['# Traiter le cancer', '## Chimiothérapie classique', "## L'homéopathie comme complément"].join('\n')
    const result = validateOutline(md, domain)
    expect(result.valid).toBe(false)
    if (result.valid) throw new Error('unreachable')
    expect(result.reason).toMatch(/Homéopathie/)
  })

  it("détecte le sujet exclu \"IA\" jusque dans \"l'IA\" (élision française, mots entiers)", () => {
    const domain = makeDomain({ excludedTopics: ['IA'] })
    const md = ['# Le futur du diagnostic', '## Les biomarqueurs classiques', "## Comment l'IA change la donne"].join('\n')
    const result = validateOutline(md, domain)
    expect(result.valid).toBe(false)
    if (result.valid) throw new Error('unreachable')
    expect(result.reason).toMatch(/IA/)
  })

  it('ne confond pas un mot contenant la sous-chaîne du sujet exclu avec le sujet lui-même (pas de faux positif par sous-chaîne)', () => {
    // "diagnostic" contient la sous-chaîne "ia" ; un sujet exclu "IA" ne doit
    // matcher que le mot entier "IA", jamais une sous-chaîne d'un autre mot.
    const domain = makeDomain({ excludedTopics: ['IA'] })
    const md = ['# Le diagnostic précoce', '## Les biomarqueurs classiques', '## Le rôle du diagnostic génétique'].join('\n')
    const result = validateOutline(md, domain)
    expect(result.valid).toBe(true)
  })

  it('accepte un plan qui ne mentionne aucun sujet exclu du domaine', () => {
    const domain = makeDomain({ excludedTopics: ['Régimes miracle'] })
    const result = validateOutline(VALID_MD, domain)
    expect(result.valid).toBe(true)
  })
})
