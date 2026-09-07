import type { Queue } from 'bullmq'
import { BullPipelineQueue } from './pipeline-queue'

// Ids réels : Prisma génère des cuid (`@default(cuid())`), jamais des uuid —
// donc pas de `-` non plus dans les identifiants eux-mêmes.
const RUN_ID = 'clxq1run00000abcdefghijk'
const STEP_ID = 'clxq1step0000abcdefghijk'

/**
 * BullMQ 6 valide l'id personnalisé au moment du `add` (voir
 * `Job.prototype.validateOptions`) : il refuse un id entièrement numérique et
 * tout id contenant `:` — `:` est le séparateur des clés Redis, et seule la
 * forme héritée à trois segments des jobs répétables y échappe encore.
 * Ces deux règles sont reproduites ici pour que le test échoue à l'endroit du
 * bug plutôt que sur une connexion Redis absente.
 */
function assertValidBullJobId(jobId: string): void {
  expect(`${parseInt(jobId, 10)}`).not.toBe(jobId)
  expect(jobId).not.toContain(':')
}

/** `noUncheckedIndexedAccess` : lit l'id du n-ième `add` en échouant clairement s'il manque. */
function jobIdAt(added: { opts: { jobId?: string } }[], index: number): string {
  const jobId = added[index]?.opts.jobId
  if (jobId === undefined) throw new Error(`Aucun jobId pour l'appel #${index} à queue.add.`)
  return jobId
}

function fakeQueue() {
  const added: { name: string; data: unknown; opts: { jobId?: string } }[] = []
  const looked: string[] = []
  const queue = {
    add: jest.fn(async (name: string, data: unknown, opts: { jobId?: string }) => {
      if (opts?.jobId) assertValidBullJobId(opts.jobId)
      added.push({ name, data, opts })
      return { id: opts?.jobId }
    }),
    getJob: jest.fn(async (id: string) => {
      looked.push(id)
      return undefined
    }),
  } as unknown as Queue
  return { queue, added, looked }
}

describe('BullPipelineQueue', () => {
  it("enfile un job avec un id que BullMQ accepte (pas de ':')", async () => {
    const { queue, added } = fakeQueue()

    await new BullPipelineQueue(queue).enqueueStep({
      runId: RUN_ID,
      stepId: STEP_ID,
      correlationId: 'corr-1',
    })

    expect(added).toHaveLength(1)
    assertValidBullJobId(jobIdAt(added, 0))
  })

  it('recherche exactement le même id pour annuler un job en attente', async () => {
    const { queue, added, looked } = fakeQueue()
    const sut = new BullPipelineQueue(queue)

    await sut.enqueueStep({ runId: RUN_ID, stepId: STEP_ID, correlationId: 'corr-1' })
    await sut.cancelPendingJob(RUN_ID, STEP_ID)

    expect(looked).toEqual([jobIdAt(added, 0)])
  })

  it('donne des ids distincts à deux étapes du même run', async () => {
    const { queue, added } = fakeQueue()
    const sut = new BullPipelineQueue(queue)

    await sut.enqueueStep({ runId: RUN_ID, stepId: STEP_ID, correlationId: 'corr-1' })
    await sut.enqueueStep({ runId: RUN_ID, stepId: 'clxq1step0001abcdefghijk', correlationId: 'corr-2' })

    expect(jobIdAt(added, 0)).not.toBe(jobIdAt(added, 1))
  })
})
