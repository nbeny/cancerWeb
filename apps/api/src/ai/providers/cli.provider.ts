import { Injectable } from '@nestjs/common'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
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
// Marge après le timeout demandé, pour ne jamais rester bloqué indéfiniment
// si `killProcessTree` ne parvenait pas à faire converger le processus.
const HARD_STOP_GRACE_MS = 5_000

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
  const model = req.model ?? process.env.AI_MODEL ?? ''

  return { command, argsTemplate, workspaceDir, timeoutMs, model }
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

interface CliRunResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

function runCliProcess(opts: { command: string; args: string[]; cwd: string; prompt: string; timeoutMs: number }): Promise<CliRunResult> {
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
    let timedOut = false
    let settled = false

    const timeoutTimer = setTimeout(() => {
      timedOut = true
      if (child.pid) killProcessTree(child.pid)
    }, opts.timeoutMs)

    // Filet de sécurité : si le kill ne fait pas converger le process (cas
    // qu'on ne veut jamais rencontrer, mais qu'on refuse de faire pendre
    // indéfiniment), on abandonne quand même après une marge raisonnable.
    const hardStopTimer = setTimeout(
      () => {
        if (settled) return
        settled = true
        clearTimeout(timeoutTimer)
        reject(
          new CliProviderError(
            "Le CLI IA n'a pas répondu après l'arrêt forcé de son arbre de processus : abandon.",
            truncate(stdout + stderr),
          ),
        )
      },
      opts.timeoutMs + HARD_STOP_GRACE_MS,
    )

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    // Le process peut mourir avant d'avoir consommé tout stdin (EPIPE) :
    // sans conséquence, c'est l'événement `close` qui fait foi.
    child.stdin?.on('error', () => undefined)

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      clearTimeout(hardStopTimer)
      reject(new CliProviderError(`Impossible de démarrer le CLI IA (${opts.command}) : ${err.message}`))
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      clearTimeout(hardStopTimer)
      resolve({ code, stdout, stderr, timedOut })
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

    const args = config.argsTemplate.map((a) => a.replace('{model}', config.model))
    const result = await runCliProcess({
      command: config.command,
      args,
      cwd: jobDir,
      prompt: fullPrompt,
      timeoutMs: config.timeoutMs,
    })

    if (result.timedOut) {
      // Constaté empiriquement sur le vrai `opencode` (voir
      // cli-provider.smoke-spec.ts) : l'agent écrit `output.md` puis reste
      // vivant indéfiniment (connexion interne non refermée), sans jamais
      // sortir de lui-même. Si le fichier existe malgré le kill forcé, le
      // travail est bel et bien terminé : le traiter comme un échec ferait
      // perdre un résultat valide à chaque exécution réelle.
      const outputPath = join(jobDir, OUTPUT_FILE_NAME)
      if (existsSync(outputPath)) {
        const text = await readFile(outputPath, 'utf8')
        await rm(jobDir, { recursive: true, force: true }).catch(() => undefined)
        return {
          text,
          raw: truncate(
            `[Note : le CLI a été arrêté après le délai de ${config.timeoutMs} ms car il ne se termine pas de lui-même, mais avait déjà écrit son résultat.]\n${result.stdout}${result.stderr}`,
          ),
          durationMs: Date.now() - start,
        }
      }

      throw new CliProviderError(
        `Le CLI IA a dépassé le délai de ${config.timeoutMs} ms et a été arrêté (job ${jobId}).`,
        truncate(result.stdout + result.stderr),
      )
    }

    if (result.code !== 0) {
      await writeFile(join(jobDir, STDERR_FILE_NAME), result.stderr, 'utf8').catch(() => undefined)
      throw new CliProviderError(
        `Le CLI IA a échoué (code de sortie ${String(result.code)}, job ${jobId}).`,
        truncate(result.stderr),
      )
    }

    const outputPath = join(jobDir, OUTPUT_FILE_NAME)
    if (!existsSync(outputPath)) {
      await writeFile(join(jobDir, STDERR_FILE_NAME), result.stderr, 'utf8').catch(() => undefined)
      throw new CliProviderError(
        `Le CLI IA a terminé sans produire ${OUTPUT_FILE_NAME} : aucun résultat exploitable (job ${jobId}).`,
        truncate(result.stdout + result.stderr),
      )
    }

    const text = await readFile(outputPath, 'utf8')
    // Répertoire de travail supprimé après succès seulement : après un
    // échec, il reste sur disque pour permettre le diagnostic.
    await rm(jobDir, { recursive: true, force: true })

    return {
      text,
      raw: truncate(result.stdout + (result.stderr ? `\n--- stderr ---\n${result.stderr}` : '')),
      durationMs: Date.now() - start,
    }
  }

  async health(): Promise<ProviderHealth> {
    if (!process.env.AI_CLI_COMMAND) {
      return { ok: false, detail: 'AI_CLI_COMMAND non défini' }
    }
    return { ok: true }
  }
}
