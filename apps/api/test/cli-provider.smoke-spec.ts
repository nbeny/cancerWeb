/**
 * Test de fumée réel de `CliAgentProvider` contre le vrai binaire `opencode`.
 *
 * VOLONTAIREMENT EXCLU DE LA CI : lent (le modèle libre répond en 10-30 s),
 * dépendant d'un binaire installé localement, et dépendant d'un service
 * distant (les modèles `*-free` d'opencode). Ce fichier finit par
 * `.smoke-spec.ts`, que ni `jest.config.js` (rootDir `src`, en dehors de
 * `test/`) ni `jest.int.config.js` (`testRegex: '.*\.int-spec\.ts$'`) ne
 * ramassent : `pnpm test` et `pnpm test:int` l'ignorent tous les deux.
 *
 * LANCEMENT MANUEL — depuis `apps/api` :
 *
 *   npx jest --config "{\"preset\":\"ts-jest\",\"testEnvironment\":\"node\",\"rootDir\":\".\",\"testMatch\":[\"<rootDir>/test/cli-provider.smoke-spec.ts\"],\"testTimeout\":340000}"
 *
 * Prérequis : `opencode` installé et accessible (`opencode --version`).
 * Aucune authentification n'est nécessaire pour les modèles `opencode/*-free`
 * utilisés ici (voir docs/ai-cli-smoke-test.md).
 *
 * DÉCOUVERTE EMPIRIQUE IMPORTANTE (2026-08-30, Windows 11, opencode 1.18.18) :
 *
 * 1. Le nom de commande `opencode` seul ne fonctionne PAS sous Windows sans
 *    `shell: true`. `npm install -g` y installe un shim `.cmd` (et un script
 *    shell POSIX sans extension, inutilisable par `CreateProcess`) ; Node a
 *    bloqué le spawn direct de fichiers `.cmd`/`.bat` sans shell explicite
 *    depuis le correctif de la CVE-2024-27980 (spawn lève `EINVAL`). Puisque
 *    `CliAgentProvider` s'interdit `shell: true` par conception (c'est le
 *    test le plus important de `cli.provider.spec.ts`), ce test résout et
 *    invoque directement le binaire réel que le shim enveloppe
 *    (`.../node_modules/opencode-ai/bin/opencode.exe`), qui est un vrai
 *    exécutable Windows lançable sans shell. Sur Linux/macOS, `opencode` est
 *    un vrai script exécutable (shebang) et `AI_CLI_COMMAND=opencode`
 *    fonctionne tel quel — ce contournement n'est nécessaire que sur
 *    Windows, et seulement pour ce test manuel : en conteneur/CI Linux, la
 *    configuration standard de `.env` (`AI_CLI_COMMAND=opencode`) suffit.
 *
 * 2. Le vrai `opencode` NE SE TERMINE JAMAIS DE LUI-MÊME après avoir écrit
 *    `output.md` (observé : toujours vivant après 25 s d'observation passive
 *    une fois "Wrote file successfully" affiché). Une première version de
 *    `CliAgentProvider` attendait donc systématiquement `AI_CLI_TIMEOUT_MS`
 *    en entier avant de constater que le fichier existait — soit 5 minutes
 *    PAR APPEL en configuration réelle, quel que soit le temps de travail
 *    réel de l'agent (quelques secondes à quelques dizaines de secondes).
 *    `CliAgentProvider` surveille désormais l'apparition de `output.md` et
 *    sa stabilité (taille inchangée sur deux relevés espacés de
 *    `AI_CLI_POLL_INTERVAL_MS`) pendant l'attente, et rend la main dès que
 *    détectée, sans attendre le timeout — qui redevient un pur filet de
 *    sécurité. Ce test tourne avec `AI_CLI_TIMEOUT_MS=300000` (valeur de
 *    production) et mesure la durée réelle : elle doit rester de l'ordre de
 *    quelques dizaines de secondes, pas de 5 minutes.
 *
 * 3. `opencode` (compilé avec Bun) résout son répertoire de travail via la
 *    variable d'environnement `PWD` héritée du process parent, pas via le
 *    `cwd` réel passé à `spawn()`. Sans correctif, chaque job écrivait son
 *    résultat hors de son répertoire isolé (constaté : dans le `PWD` hérité
 *    d'un shell ancêtre sans rapport). `CliAgentProvider` fixe désormais
 *    `PWD` sur le répertoire du job à chaque spawn.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { CliAgentProvider } from '../src/ai/providers/cli.provider'

const FREE_MODEL = 'opencode/nemotron-3.5-lightning-free'

/**
 * Localise le shim npm `<shimName>.cmd` via l'utilitaire Windows `where`,
 * sans jamais passer par un interpréteur de commandes (tableau d'arguments,
 * pas de `shell: true`) — même discipline que `CliAgentProvider` lui-même.
 */
function locateShim(shimName: string): string {
  const result = spawnSync('where', [`${shimName}.cmd`], { encoding: 'utf8' })
  const firstLine = result.stdout.split(/\r?\n/)[0]
  const shimPath = firstLine?.trim()
  if (result.status !== 0 || !shimPath) {
    throw new Error(`Impossible de localiser ${shimName}.cmd via "where" — opencode est-il installé ?`)
  }
  return shimPath
}

/**
 * Sous Windows, `opencode` est installé par npm comme un shim `.cmd` qui
 * enveloppe le vrai exécutable. Node ne peut pas lancer un `.cmd` sans
 * `shell: true` (voir note ci-dessus) : on résout donc ici le binaire réel
 * qu'il enveloppe, pour ce test manuel uniquement — la configuration de
 * production (`.env`, Linux) n'a pas besoin de ce contournement.
 */
function resolveRealCliCommand(shimName: string): string {
  if (process.platform !== 'win32') return shimName

  const shimPath = locateShim(shimName)
  const shimContent = readFileSync(shimPath, 'utf8')
  const match = /"%dp0%\\(.+?)"/.exec(shimContent)
  if (!match?.[1]) {
    throw new Error(`Format de shim npm inattendu pour ${shimPath} : impossible d'extraire le binaire réel.`)
  }
  return join(dirname(shimPath), match[1])
}

describe('CliAgentProvider — test de fumée réel (opencode)', () => {
  let workspaceDir: string
  const originalEnv = { ...process.env }

  beforeAll(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'cli-provider-smoke-'))
    process.env.AI_CLI_COMMAND = resolveRealCliCommand('opencode')
    process.env.AI_CLI_ARGS = JSON.stringify(['run', '-m', '{model}'])
    process.env.AI_CLI_PROMPT_VIA = 'stdin'
    process.env.AI_WORKSPACE_DIR = workspaceDir
    process.env.AI_MODEL = FREE_MODEL
  })

  afterAll(() => {
    process.env = originalEnv
    rmSync(workspaceDir, { recursive: true, force: true })
  })

  it(
    'génère un paragraphe Markdown via le vrai CLI, sans jamais recevoir le prompt en argument, ' +
      'et rend la main bien avant AI_CLI_TIMEOUT_MS (valeur de production)',
    async () => {
      // Valeur de PRODUCTION, pas une valeur réduite pour le test : c'est la
      // mesure de durée ci-dessous qui doit prouver que la surveillance de
      // output.md évite d'attendre les 5 minutes en entier, pas un timeout
      // artificiellement bas qui masquerait le problème (voir note 2).
      process.env.AI_CLI_TIMEOUT_MS = '300000'

      const provider = new CliAgentProvider()
      const start = Date.now()
      const result = await provider.complete({
        prompt: 'Écris un court paragraphe en Markdown sur le Zero Trust (3-4 phrases suffisent).',
      })
      const elapsedMs = Date.now() - start
      console.log(`[smoke] durée réelle de complete() : ${elapsedMs} ms (timeout configuré : 300000 ms)`)

      expect(result.text.trim().length).toBeGreaterThan(0)
      expect(result.text.toLowerCase()).toContain('zero trust')
      // La preuve du correctif : on rend la main très en-dessous du timeout.
      // Une régression vers "attendre tout AI_CLI_TIMEOUT_MS" ferait échouer
      // cette assertion (elapsedMs friserait 300000), pas seulement ralentir
      // silencieusement le test.
      expect(elapsedMs).toBeLessThan(60_000)
      // Le workspace du job a été nettoyé : succès par détection de stabilité.
      expect(existsSync(workspaceDir)).toBe(true)
    },
    320_000,
  )
})
