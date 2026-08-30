import { expect, test } from '@playwright/test'

// Généreux : deux inscriptions, une création de domaine, un aller-retour
// Prisma, un sujet créé/sélectionné/converti en article, deux cycles complets
// de sauvegarde temporisée (1,5 s) + réanalyse SEO, une soumission, puis une
// deuxième session (l'éditeur) qui approuve et publie — le tout contre une
// pile Docker en production (pas de HMR). Une première exécution a atteint
// le plafond de 120 s sans qu'aucune assertion individuelle n'échoue :
// c'est la somme des étapes qui dépasse ce budget, pas un blocage réel.
test.setTimeout(240_000)

const PASSWORD = 'Sup3r-Secret-2026!'

const unique = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 100_000)}`

// ---------------------------------------------------------------------------
// Aucune mutation GraphQL n'ajoute un membre à un domaine avec un rôle choisi
// (voir `DomainsResolver` : uniquement create/update/delete/domain(s)) : pour
// établir qu'un second compte appartient au même domaine que le premier, ce
// test insère directement en base via le client Prisma déjà généré
// d'`apps/api` (monorepo, même dépôt) — c'est le choix documenté ici plutôt
// qu'un contournement muet.
// ---------------------------------------------------------------------------

interface PrismaClientLike {
  user: { findUniqueOrThrow: (args: { where: { email: string } }) => Promise<{ id: string }> }
  domainMember: {
    update: (args: {
      where: { userId_domainId: { userId: string; domainId: string } }
      data: { role: string }
    }) => Promise<unknown>
    create: (args: { data: { userId: string; domainId: string; role: string } }) => Promise<unknown>
  }
  $disconnect: () => Promise<void>
}

/**
 * Charge le client Prisma généré d'`apps/api` par un chemin CALCULÉ (jointure
 * de segments), jamais un littéral `import('../../api/.../client')` :
 * TypeScript tente de résoudre STATIQUEMENT tout littéral passé à `import()`
 * (comme il l'aurait fait pour un `import … from …` en tête de fichier), ce
 * qui fait échouer `next build` — qui type-vérifie tout le projet, `e2e/`
 * compris (constaté en écrivant ce test : la construction de l'image Docker
 * `web` a échoué avec `Cannot find module '../../api/node_modules/@prisma/client'`,
 * cette image ne copiant jamais `apps/api/node_modules`, voir
 * `docker/web.Dockerfile`). Un chemin non littéral est traité comme `any`
 * par TypeScript : aucune résolution tentée à la compilation, seulement à
 * l'exécution — où le fichier existe bel et bien (voir la jsdoc de
 * `withPrisma`).
 *
 * Le `require` global de CommonJS, pas `import()` dynamique : constaté en
 * exécutant ce test, `import()` applique TOUJOURS l'algorithme de résolution
 * ESM de Node, même appelé depuis un module CommonJS — et cet algorithme
 * refuse un « directory import » (`.../@prisma/client` sans fichier
 * explicite) au lieu de consulter le `package.json` (`exports`/`main`) du
 * paquet cible comme le ferait `require()`. Playwright exécute ce fichier de
 * test en CommonJS (`apps/web/package.json` n'a pas `"type": "module"`) :
 * `require` y est déjà disponible sans import (`createRequire` — qui suppose
 * un contexte ESM avec `import.meta.url` — casserait justement cette
 * exécution, constaté à l'essai).
 */
function loadPrismaClient(): new (opts: { datasourceUrl: string }) => PrismaClientLike {
  const modulePath = ['..', '..', 'api', 'node_modules', '@prisma', 'client'].join('/')
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- volontaire, voir la jsdoc ci-dessus (résolution de répertoire CommonJS, chemin calculé non statique)
  const mod = require(modulePath) as {
    PrismaClient: new (opts: { datasourceUrl: string }) => PrismaClientLike
  }
  return mod.PrismaClient
}

/**
 * Connexion directe à la même base Postgres que la pile Docker (voir
 * `docker-compose.yml`, service `postgres`, publié sur `127.0.0.1:5432`) —
 * jamais celle de `postgres-test` (5434), qui n'a rien à voir avec la pile
 * que Playwright pilote via `baseURL`.
 *
 * Couplage assumé : ce test exige que `apps/api` ait déjà tourné
 * `prisma generate` (le client de `apps/api/node_modules/@prisma/client`
 * doit exister sur disque) — c'est déjà le cas dans ce dépôt et dans le job
 * CI `verify` (qui régénère avant ce job `e2e`, voir `.github/workflows/ci.yml`),
 * mais un clone tout neuf qui lancerait UNIQUEMENT `pnpm --filter
 * @cancerweb/web e2e` sans être jamais passé par l'API devrait d'abord
 * lancer `pnpm --filter @cancerweb/api prisma:generate`.
 */
async function withPrisma<T>(fn: (prisma: PrismaClientLike) => Promise<T>): Promise<T> {
  const PrismaClient = loadPrismaClient()
  const prisma = new PrismaClient({
    datasourceUrl:
      process.env.E2E_DATABASE_URL ?? 'postgresql://cancerweb:cancerweb@127.0.0.1:5432/cancerweb?schema=public',
  })
  try {
    return await fn(prisma)
  } finally {
    await prisma.$disconnect()
  }
}

/** Une phrase simple et courte (12 mots), répétée pour produire un corps
 * d'article dépassant largement les 300 mots bloquants de `LENGTH`
 * (`apps/api/src/seo/criteria/length.ts`) sans avoir à taper un vrai texte
 * médical. Les mots courts et les phrases courtes maximisent aussi le score
 * de lisibilité (Kandel-Moles), sans que le test en dépende : les marges
 * calculées dans le rapport de tâche tiennent même à lisibilité nulle.
 */
const SENTENCE = 'Le traitement cible précisément les cellules malades sans abîmer les tissus sains.'
const PARAGRAPH = Array.from({ length: 12 }, () => SENTENCE).join(' ')

/**
 * Corps Markdown complet : un seul H1, ~600 mots, un lien interne et un lien
 * externe (critère LINKS), aucune image (IMAGES note plein sans image). Ne
 * fixe NI `seoTitle` NI `focusKeyword` : ce test porte sur le plafonnement
 * par faute bloquante (meta description absente), pas sur l'exhaustivité du
 * barème SEO — déjà couverte par `apps/api/src/seo/analyzer.spec.ts`.
 */
function fullArticleBody(): string {
  return [
    '# Les traitements ciblés du cancer du poumon',
    '',
    PARAGRAPH,
    '',
    '## Comprendre les traitements ciblés',
    '',
    PARAGRAPH,
    '',
    '## Les bénéfices pour les patients',
    '',
    PARAGRAPH,
    '',
    '## Liens utiles',
    '',
    'Consultez notre [guide des essais cliniques](/dashboard/articles) et la ressource externe [Institut National du Cancer](https://www.e-cancer.fr).',
    '',
    '## Conclusion',
    '',
    PARAGRAPH,
  ].join('\n')
}

// Entre 120 et 158 caractères (bornes de `criteria/meta-description.ts`) :
// retire la faute BLOQUANTE `META_DESCRIPTION_MISSING` sans introduire
// l'avertissement de longueur hors-plage (non bloquant, mais autant l'éviter
// pour ne pas polluer la liste des problèmes affichés).
const META_DESCRIPTION =
  'Guide complet sur les traitements ciblés du cancer du poumon, leurs bénéfices concrets pour les patients et les ressources cliniques de référence.'

/** Remplace tout le contenu de l'éditeur CodeMirror en une seule opération
 * (`insertText`, pas une frappe caractère par caractère) : rapide, et génère
 * un seul événement `input` natif que CodeMirror reconcilie correctement
 * avec son état interne (voir `EditorView.contentAttributes` posé par le
 * correctif d'accessibilité de `markdown-editor.tsx`, sans quoi
 * `getByRole('textbox', ...)` ne trouverait rien).
 */
async function setEditorContent(page: import('@playwright/test').Page, content: string) {
  const editor = page.getByRole('textbox', { name: 'Contenu Markdown de l’article' })
  await editor.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
  await page.keyboard.insertText(content)
}

/** Attend le cycle complet sauvegarde temporisée (1,5 s, voir
 * `article-editor.tsx`, `SAVE_DEBOUNCE_MS`) → réanalyse SEO déclenchée par
 * `doSave`. On observe d'abord "Modifications non enregistrées" (pour ne
 * pas confondre avec le "Enregistré" déjà affiché AVANT la modification),
 * puis "Enregistré" à nouveau une fois le cycle terminé.
 */
async function waitForAutosave(page: import('@playwright/test').Page) {
  await expect(page.getByRole('status').filter({ hasText: 'Modifications non enregistrées' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Enregistré' })).toBeVisible({ timeout: 10_000 })
}

/**
 * `doSave` déclenche `runAnalyze()` APRÈS avoir affiché "Enregistré" (voir
 * `article-editor.tsx`) : `waitForAutosave` seule ne garantit donc pas que le
 * score affiché reflète le contenu qui vient d'être sauvegardé, seulement
 * que la sauvegarde a réussi. Tant que l'analyse est en vol, `SeoPanel`
 * affiche "Recalcul en cours…" (et l'ancien score reste visible, en
 * transparence) : attendre sa disparition avant de lire le score évite de
 * lire une valeur périmée.
 */
async function waitForFreshSeoAnalysis(page: import('@playwright/test').Page) {
  await expect(page.getByText('Recalcul en cours…')).toHaveCount(0, { timeout: 15_000 })
}

async function register(page: import('@playwright/test').Page, email: string, name: string) {
  await page.goto('/auth/register')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Nom').fill(name)
  await page.getByLabel('Mot de passe').fill(PASSWORD)
  await page.getByRole('button', { name: 'Créer mon compte' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

test('parcours éditorial complet : l’auteur rédige, l’éditeur relit et publie', async ({ browser }) => {
  const runId = unique()
  const authorEmail = `${runId}-author@example.com`
  const editorEmail = `${runId}-editor@example.com`
  const domainName = `Domaine éditorial ${runId}`
  const topicTitle = 'Les traitements ciblés du cancer du poumon'

  const authorCtx = await browser.newContext()
  const editorCtx = await browser.newContext()
  const authorPage = await authorCtx.newPage()
  const editorPage = await editorCtx.newPage()

  try {
    // --- 1a. L'auteur s'inscrit et crée le domaine ------------------------
    // `createDomain` fait automatiquement de son appelant un OWNER (voir
    // `domains.service.ts`) : aucune mutation ne permet de choisir un autre
    // rôle à la création. Le rôle est corrigé à AUTHOR juste après, via
    // Prisma (étape 1c) — ce compte ne doit PAS rester OWNER, sans quoi la
    // vérification centrale de ce test (un AUTHOR ne peut ni approuver ni
    // publier) serait vide de sens : un OWNER a tous les droits d'un EDITOR.
    await register(authorPage, authorEmail, 'Auteur E2E')
    await authorPage.getByRole('link', { name: 'Créer un domaine' }).click()
    await authorPage.getByLabel('Nom du domaine').fill(domainName)
    await authorPage.getByLabel('Description').fill('Domaine du parcours éditorial E2E (Task 19)')
    await authorPage.getByRole('button', { name: 'Créer le domaine' }).click()
    await expect(authorPage).toHaveURL(/\/dashboard\/domains/)
    await expect(authorPage.getByText(domainName)).toBeVisible()

    // Le `domainId` n'apparaît dans aucun lien de `/dashboard/domains` : on
    // le récupère depuis le lien du `DomainPicker` de `/dashboard/topics`,
    // qui le porte explicitement dans son `href` (`?domainId=...`).
    await authorPage.goto('/dashboard/topics')
    await authorPage.getByRole('link', { name: domainName }).click()
    await expect(authorPage).toHaveURL(/domainId=/)
    const domainId = new URL(authorPage.url()).searchParams.get('domainId')
    if (!domainId) throw new Error('domainId introuvable dans l’URL après sélection du domaine')

    // --- 1b. L'éditeur s'inscrit, sans domaine -----------------------------
    await register(editorPage, editorEmail, 'Éditeur E2E')
    await expect(editorPage.getByText('Aucun domaine éditorial')).toBeVisible()

    // --- 1c. Établir l'appartenance des deux comptes au même domaine ------
    // Aucune mutation GraphQL n'ajoute un membre à un domaine avec un rôle
    // choisi : insertion directe en base via le client Prisma de l'API (voir
    // la jsdoc de `withPrisma`). L'auteur redescend d'OWNER (posé par
    // `createDomain`) à AUTHOR ; l'éditeur est ajouté directement en EDITOR.
    await withPrisma(async (prisma) => {
      const author = await prisma.user.findUniqueOrThrow({ where: { email: authorEmail } })
      const editor = await prisma.user.findUniqueOrThrow({ where: { email: editorEmail } })
      await prisma.domainMember.update({
        where: { userId_domainId: { userId: author.id, domainId } },
        data: { role: 'AUTHOR' },
      })
      await prisma.domainMember.create({
        data: { userId: editor.id, domainId, role: 'EDITOR' },
      })
    })

    // --- 2. L'auteur crée un sujet, le sélectionne, lance la rédaction ----
    await authorPage.goto(`/dashboard/topics?domainId=${domainId}`)
    // Un domaine tout neuf n'a aucun sujet : le lien "Nouvelle idée" apparaît
    // deux fois (action d'en-tête + action de l'état vide de la table, voir
    // `topics/page.tsx`) — `.first()` cible l'action d'en-tête, toujours
    // présente qu'il y ait ou non des sujets.
    await authorPage.getByRole('link', { name: 'Nouvelle idée' }).first().click()
    await authorPage.getByLabel('Titre').fill(topicTitle)
    await authorPage.getByRole('button', { name: 'Créer l’idée' }).click()
    await expect(authorPage).toHaveURL(/\/dashboard\/topics/)

    const topicRow = authorPage.getByRole('row', { name: new RegExp(topicTitle) })
    await topicRow.getByRole('button', { name: 'Sélectionner' }).click()
    await expect(topicRow.getByRole('button', { name: 'Rédiger l’article' })).toBeVisible()
    await topicRow.getByRole('button', { name: 'Rédiger l’article' }).click()

    await authorPage.waitForURL(/\/dashboard\/articles\/[^/?]+\?domainId=/)
    const articleId = new URL(authorPage.url()).pathname.split('/').pop()
    if (!articleId) throw new Error('articleId introuvable dans l’URL après création de l’article')

    // --- 2a. Le score SEO apparaît dès l'ouverture (analyse au montage,
    // voir `article-editor.tsx`, sur le contenu de départ minimal issu du
    // sujet) --------------------------------------------------------------
    await authorPage.getByRole('button', { name: 'SEO', exact: true }).click()
    const seoStatus = authorPage.getByRole('status', { name: /Score SEO : \d+ sur 100/ })
    await expect(seoStatus).toBeVisible({ timeout: 15_000 })

    // --- 2b. L'auteur rédige l'article dans l'éditeur ----------------------
    // Le corps est complet (un seul H1, ~600 mots, un lien interne et un
    // lien externe) mais NE renseigne PAS encore la meta description : une
    // seule faute bloquante subsiste (`META_DESCRIPTION_MISSING`), pour une
    // démonstration nette du plafonnement plutôt que d'empiler plusieurs
    // fautes corrigées à la fois.
    await setEditorContent(authorPage, fullArticleBody())
    await waitForAutosave(authorPage)

    await authorPage.getByRole('button', { name: 'SEO', exact: true }).click()
    await waitForFreshSeoAnalysis(authorPage)
    await expect(seoStatus).toBeVisible({ timeout: 15_000 })
    const cappedLabel = await seoStatus.getAttribute('aria-label')
    const cappedScore = Number(cappedLabel?.match(/Score SEO : (\d+) sur 100/)?.[1])
    expect(cappedScore).toBeGreaterThan(0)
    expect(cappedScore).toBeLessThanOrEqual(60)
    await expect(authorPage.getByText(/Score plafonné à \d+ — 1 faute bloquante/)).toBeVisible()

    // --- 2c. Il corrige la faute bloquante : le score franchit le plafond -
    await authorPage.getByRole('button', { name: 'Métadonnées' }).click()
    await authorPage.getByLabel('Meta description').fill(META_DESCRIPTION)
    await waitForAutosave(authorPage)

    await authorPage.getByRole('button', { name: 'SEO', exact: true }).click()
    await waitForFreshSeoAnalysis(authorPage)
    await expect(seoStatus).toBeVisible({ timeout: 15_000 })
    await expect(authorPage.getByText(/Score plafonné/)).toHaveCount(0)
    const finalLabel = await seoStatus.getAttribute('aria-label')
    const finalScore = Number(finalLabel?.match(/Score SEO : (\d+) sur 100/)?.[1])
    expect(finalScore).toBeGreaterThan(60)

    // --- 3. L'auteur soumet en revue : aucune action de publication ------
    await authorPage.getByRole('button', { name: 'Soumettre pour relecture' }).click()
    await expect(authorPage.getByText('En revue')).toBeVisible()

    // Le bouton d'approbation EXISTE mais est désactivé, avec sa raison :
    // c'est la vérification centrale de ce test (voir la preuve par mutation
    // du rapport de tâche, qui confirme que ce garde-fou tient réellement).
    const approveButton = authorPage.getByRole('button', { name: 'Approuver' })
    await expect(approveButton).toBeVisible()
    await expect(approveButton).toBeDisabled()
    const rejectButton = authorPage.getByRole('button', { name: 'Rejeter (renvoyer en brouillon)' })
    await expect(rejectButton).toBeVisible()
    await expect(rejectButton).toBeDisabled()
    await expect(authorPage.getByText(/Rôle EDITOR requis pour cette action \(rôle actuel : AUTHOR\)/)).toHaveCount(2)
    // Aucune action de publication n'est jamais accessible depuis REVIEW,
    // pour aucun rôle (elle n'existe qu'à partir d'APPROVED) : le bouton
    // n'existe même pas, contrairement à Approuver/Rejeter qui existent mais
    // sont désactivés.
    await expect(authorPage.getByRole('button', { name: 'Publier' })).toHaveCount(0)

    // Un bouton désactivé ne prouve que l'INTERFACE respecte la règle —
    // `TransitionBar` porte sa PROPRE copie codée en dur du barème des rôles
    // (voir sa jsdoc : dupliquée depuis `transitions.ts`, jamais dérivée du
    // serveur à l'exécution). Elle resterait grisée même si le SERVEUR,
    // lui, se mettait à autoriser la transition — ce que ce clic seul ne
    // peut donc jamais détecter. La garantie réelle du projet (« IA → revue
    // humaine → publication ») tient au serveur, pas au bouton : on l'attaque
    // donc ICI directement, en contournant l'interface, avec la session de
    // l'auteur (mêmes cookies httpOnly que `authorPage`, partagés par
    // `APIRequestContext` — voir la doc Playwright de `browserContext.request`).
    const forbiddenApprove = await authorPage.request.post('/graphql', {
      data: {
        query: 'mutation($domainId: ID!, $id: ID!) { approveArticle(domainId: $domainId, id: $id) { id status } }',
        variables: { domainId, id: articleId },
      },
    })
    const forbiddenApproveBody = await forbiddenApprove.json()
    expect(forbiddenApproveBody.data?.approveArticle ?? null).toBeNull()
    expect(forbiddenApproveBody.errors?.[0]?.extensions?.code ?? forbiddenApproveBody.errors?.[0]?.code).toBe(
      'FORBIDDEN',
    )

    // --- 4. L'éditeur approuve puis publie --------------------------------
    await editorPage.goto(`/dashboard/articles/${articleId}?domainId=${domainId}`)
    await expect(editorPage.getByText('En revue')).toBeVisible()
    await editorPage.getByRole('button', { name: 'Approuver' }).click()
    await expect(editorPage.getByText('Approuvé')).toBeVisible()

    await editorPage.getByRole('button', { name: 'Publier' }).click()
    await editorPage.getByRole('dialog').getByRole('button', { name: 'Publier' }).click()
    await expect(editorPage.getByText('Publié')).toBeVisible()

    // --- 5. L'article apparaît PUBLISHED dans la liste, avec son score ----
    await editorPage.goto(`/dashboard/articles?domainId=${domainId}`)
    const articleRow = editorPage.getByRole('row', { name: new RegExp(topicTitle) })
    await expect(articleRow.getByText('Publié')).toBeVisible()
    await expect(articleRow.getByText('Non analysé')).toHaveCount(0)
    await expect(articleRow.getByText(String(finalScore), { exact: true })).toBeVisible()
  } finally {
    await authorCtx.close()
    await editorCtx.close()
  }
})
