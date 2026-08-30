import { Injectable } from '@nestjs/common'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { AIProvider, CompletionRequest, CompletionResult, ProviderHealth } from '../ai.types'

/**
 * Contrat établi empiriquement (`docs/ai-cli-smoke-test.md`) : `opencode`
 * n'expose ni `--prompt-file` ni `--output`. Pour un job donné :
 *
 *   <AI_WORKSPACE_DIR>/<jobId>/
 *     ├── prompt.md   — écrit par nous, ET transmis par stdin
 *     ├── output.md   — écrit par l'agent, sur instruction explicite du prompt
 *     └── stderr.log  — diagnostic uniquement, jamais parsé comme résultat
 *
 * Décisions et leurs raisons, pour ne pas les redécouvrir plus tard :
 * - `spawn` avec un tableau d'arguments, jamais `shell: true` : le prompt
 *   contient du contenu utilisateur, une interpolation dans une chaîne de
 *   shell serait une injection de commande directe.
 * - Le prompt passe par stdin, jamais en argument : la ligne de commande est
 *   limitée à ~8 Ko sous Windows, un contexte d'article la dépasse.
 * - Le résultat vient exclusivement du fichier `output.md` : stdout contient
 *   des séquences ANSI et le commentaire d'exécution de l'agent.
 */

const OUTPUT_FILE_NAME = 'output.md'
const PROMPT_FILE_NAME = 'prompt.md'
const STDERR_FILE_NAME = 'stderr.log'
const DEFAULT_TIMEOUT_MS = 300_000
const MAX_RAW_LENGTH = 8_000
// Intervalle de surveillance de `output.md` (existence + taille stable sur
// deux relevés consécutifs). Choix de 250 ms : assez fréquent pour qu'une
// génération de plusieurs secondes à plusieurs minutes ne perde au pire que
// quelques centaines de ms après sa fin réelle (négligeable), assez espacé
// pour qu'un `statSync` quatre fois par seconde ne pèse pas sur le CPU du
// worker. Configurable via `AI_CLI_POLL_INTERVAL_MS` si un déploiement a
// besoin d'un autre compromis latence/CPU.
const DEFAULT_POLL_INTERVAL_MS = 250

export class CliProviderError extends Error {
  /** Sortie brute (tronquée) conservée pour diagnostic, jamais réutilisée comme résultat. */
  readonly raw?: string

  constructor(message: string, raw?: string) {
    super(message)
    this.name = 'CliProviderError'
    this.raw = raw
  }
}

interface CliConfig {
  command: string
  argsTemplate: string[]
  workspaceDir: string
  timeoutMs: number
  pollIntervalMs: number
  model: string
}

function readCliConfig(req: CompletionRequest): CliConfig {
  const command = process.env.AI_CLI_COMMAND
  if (!command) {
    throw new Error('AI_CLI_COMMAND doit être défini pour utiliser CliAgentProvider.')
  }

  const workspaceDir = process.env.AI_WORKSPACE_DIR
  if (!workspaceDir) {
    throw new Error('AI_WORKSPACE_DIR doit être défini pour utiliser CliAgentProvider.')
  }

  const promptVia = process.env.AI_CLI_PROMPT_VIA ?? 'stdin'
  if (promptVia !== 'stdin') {
    throw new Error(`AI_CLI_PROMPT_VIA="${promptVia}" n'est pas pris en charge : seul "stdin" l'est actuellement.`)
  }

  const rawArgs = process.env.AI_CLI_ARGS ?? '[]'
  let argsTemplate: unknown
  try {
    argsTemplate = JSON.parse(rawArgs)
  } catch {
    throw new Error(`AI_CLI_ARGS doit être un tableau JSON de chaînes (reçu : ${rawArgs}).`)
  }
  if (!Array.isArray(argsTemplate) || !argsTemplate.every((a): a is string => typeof a === 'string')) {
    throw new Error(`AI_CLI_ARGS doit être un tableau JSON de chaînes (reçu : ${rawArgs}).`)
  }

  const timeoutMs = req.timeoutMs ?? Number(process.env.AI_CLI_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)
  const pollIntervalMs = Number(process.env.AI_CLI_POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS)
  const model = req.model ?? process.env.AI_MODEL ?? ''

  return { command, argsTemplate, workspaceDir, timeoutMs, pollIntervalMs, model }
}

/**
 * Tue le processus et tous ses descendants. Un `kill` sur le seul parent
 * laisserait l'agent CLI tourner en arrière-plan.
 *
 * - Windows : `taskkill /T` parcourt l'arbre des processus tenu par le
 *   noyau à partir du PID donné, indépendamment de `detached`.
 * - POSIX : le process est lancé en tant que chef d'un nouveau groupe
 *   (`detached: true` dans `spawnCli`), donc envoyer le signal à `-pid`
 *   l'envoie à tout le groupe plutôt qu'au seul enfant direct.
 *
 * Volontairement synchrone et silencieuse sur l'échec : au moment où on
 * l'appelle, le process a pu mourir de lui-même entre-temps, ce n'est pas
 * une erreur.
 */
function killProcessTree(pid: number): void {
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    } catch {
      // Processus déjà terminé, ou introuvable : rien à faire.
    }
    return
  }

  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Processus déjà terminé.
    }
  }
}

function truncate(text: string): string {
  return text.length > MAX_RAW_LENGTH ? `${text.slice(0, MAX_RAW_LENGTH)}\n[...tronqué...]` : text
}

/**
 * Trois issues distinctes, jamais confondues :
 * - `exited`   : le process s'est terminé de lui-même (code de sortie connu).
 *                `complete()` décide ensuite du succès selon le code et la
 *                présence du fichier — comportement inchangé.
 * - `stable`   : `output.md` est apparu et sa taille n'a plus bougé sur deux
 *                relevés consécutifs — l'agent a terminé d'écrire, même s'il
 *                ne se termine jamais lui-même (cas réel d'`opencode`, voir
 *                cli-provider.smoke-spec.ts). Toujours un succès.
 * - `timeout`  : `AI_CLI_TIMEOUT_MS` écoulé sans sortie stable détectée : le
 *                timeout redevient ici ce qu'il aurait toujours dû être, un
 *                filet de sécurité contre un agent qui ne produit rien —
 *                pas le mode de fonctionnement nominal.
 */
type CliOutcome = 'exited' | 'stable' | 'timeout'

interface CliRunResult {
  outcome: CliOutcome
  code: number | null
  stdout: string
  stderr: string
}

function runCliProcess(opts: {
  command: string
  args: string[]
  cwd: string
  outputPath: string
  prompt: string
  timeoutMs: number
  pollIntervalMs: number
}): Promise<CliRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(opts.command, opts.args, {
      cwd: opts.cwd,
      windowsHide: true,
      detached: process.platform !== 'win32',
      // `opencode` (compilé avec Bun) résout son répertoire de travail via
      // la variable d'environnement `PWD` héritée, pas via le répertoire
      // courant réel du process — constaté empiriquement (voir
      // cli-provider.smoke-spec.ts) : sans ce correctif, l'agent écrit
      // `output.md` dans le PWD hérité du process parent (souvent sans
      // rapport avec `cwd`) plutôt que dans le répertoire isolé du job.
      env: { ...process.env, PWD: opts.cwd },
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    // `null` distingue "le fichier n'existe pas encore" de "il fait 0 octet" :
    // dans les deux cas on ne doit pas conclure à une stabilité.
    let lastSeenSize: number | null = null

    // Toute résolution/rejet passe par ici : garantit qu'on ne règle jamais
    // le sort du job deux fois (ex. le timeout tue l'arbre, ce qui déclenche
    // ensuite un `close` qu'il faut alors ignorer).
    const settle = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearInterval(pollTimer)
      clearTimeout(timeoutTimer)
      fn()
    }

    const pollTimer = setInterval(() => {
      let size: number
      try {
        size = statSync(opts.outputPath).size
      } catch {
        lastSeenSize = null
        return
      }
      if (size > 0 && size === lastSeenSize) {
        settle(() => {
          if (child.pid) killProcessTree(child.pid)
          resolve({ outcome: 'stable', code: null, stdout, stderr })
        })
        return
      }
      lastSeenSize = size
    }, opts.pollIntervalMs)

    const timeoutTimer = setTimeout(() => {
      settle(() => {
        if (child.pid) killProcessTree(child.pid)
        resolve({ outcome: 'timeout', code: null, stdout, stderr })
      })
    }, opts.timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    // Le process peut mourir avant d'avoir consommé tout stdin (EPIPE) :
    // sans conséquence, c'est l'événement `close` (ou la détection de
    // stabilité, ou le timeout) qui fait foi.
    child.stdin?.on('error', () => undefined)

    child.on('error', (err) => {
      settle(() => reject(new CliProviderError(`Impossible de démarrer le CLI IA (${opts.command}) : ${err.message}`)))
    })

    child.on('close', (code) => {
      settle(() => resolve({ outcome: 'exited', code, stdout, stderr }))
    })

    child.stdin?.write(opts.prompt, 'utf8')
    child.stdin?.end()
  })
}

/**
 * Provider bas niveau au-dessus d'un agent CLI local (`opencode`). Aucune
 * dépendance NestJS au-delà de `@Injectable` : ni Prisma, ni logique
 * métier — testable en isolation contre un faux binaire.
 */
@Injectable()
export class CliAgentProvider implements AIProvider {
  readonly key = 'cli'

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const start = Date.now()
    const config = readCliConfig(req)

    const jobId = `${req.correlationId ?? 'job'}-${randomUUID()}`
    const jobDir = join(config.workspaceDir, jobId)
    await mkdir(jobDir, { recursive: true })

    const fullPrompt = `${req.prompt}\n\nÉcris intégralement ta réponse finale dans un fichier nommé "${OUTPUT_FILE_NAME}", à la racine de ton répertoire de travail courant. N'écris rien d'autre après avoir créé ce fichier.`
    await writeFile(join(jobDir, PROMPT_FILE_NAME), fullPrompt, 'utf8')

    const outputPath = join(jobDir, OUTPUT_FILE_NAME)
    const args = config.argsTemplate.map((a) => a.replace('{model}', config.model))
    const result = await runCliProcess({
      command: config.command,
      args,
      cwd: jobDir,
      outputPath,
      prompt: fullPrompt,
      timeoutMs: config.timeoutMs,
      pollIntervalMs: config.pollIntervalMs,
    })

    const succeed = async (raw: string): Promise<CompletionResult> => {
      const text = await readFile(outputPath, 'utf8')
      // Répertoire de travail supprimé après succès seulement : après un
      // échec, il reste sur disque pour permettre le diagnostic.
      await rm(jobDir, { recursive: true, force: true }).catch(() => undefined)
      return { text, raw: truncate(raw), durationMs: Date.now() - start }
    }

    switch (result.outcome) {
      case 'stable':
        // `output.md` est apparu et stable : l'agent a terminé son travail,
        // qu'il se termine lui-même ou non (cas réel d'`opencode`). `start`
        // à `Date.now()` reflète le temps de travail réel, à au plus un
        // `pollIntervalMs` près (le délai entre l'écriture réelle et sa
        // détection) — sans commune mesure avec l'ancien comportement qui
        // attendait systématiquement `AI_CLI_TIMEOUT_MS` en entier.
        return succeed(
          `[Note : le CLI ne s'est pas terminé de lui-même, mais output.md était stable — traité comme un succès.]\n${result.stdout}${result.stderr}`,
        )

      case 'timeout':
        // Aucune sortie stable détectée avant l'échéance : le timeout a
        // joué son rôle de filet de sécurité contre un agent qui ne produit
        // rien (ou qui écrit encore au moment où on abandonne — on ne peut
        // alors pas garantir un fichier complet, donc on ne le lit pas).
        await writeFile(join(jobDir, STDERR_FILE_NAME), result.stderr, 'utf8').catch(() => undefined)
        throw new CliProviderError(
          `Le CLI IA a dépassé le délai de ${config.timeoutMs} ms sans produire de résultat exploitable et a été arrêté (job ${jobId}).`,
          truncate(result.stdout + result.stderr),
        )

      case 'exited':
        if (result.code !== 0) {
          await writeFile(join(jobDir, STDERR_FILE_NAME), result.stderr, 'utf8').catch(() => undefined)
          throw new CliProviderError(
            `Le CLI IA a échoué (code de sortie ${String(result.code)}, job ${jobId}).`,
            truncate(result.stderr),
          )
        }
        if (!existsSync(outputPath)) {
          await writeFile(join(jobDir, STDERR_FILE_NAME), result.stderr, 'utf8').catch(() => undefined)
          throw new CliProviderError(
            `Le CLI IA a terminé sans produire ${OUTPUT_FILE_NAME} : aucun résultat exploitable (job ${jobId}).`,
            truncate(result.stdout + result.stderr),
          )
        }
        return succeed(result.stdout + (result.stderr ? `\n--- stderr ---\n${result.stderr}` : ''))
    }
  }

  async health(): Promise<ProviderHealth> {
    if (!process.env.AI_CLI_COMMAND) {
      return { ok: false, detail: 'AI_CLI_COMMAND non défini' }
    }
    return { ok: true }
  }
}
