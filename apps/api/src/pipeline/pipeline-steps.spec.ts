import { StepType } from '@prisma/client'
import { getStepDefinition, STEP_DEFINITIONS } from './pipeline-steps'

const ALL_STEP_TYPES: StepType[] = [
  StepType.RESEARCH,
  StepType.ANALYSIS,
  StepType.OUTLINE,
  StepType.DRAFT,
  StepType.FACT_CHECK,
  StepType.SEO,
  StepType.QUALITY,
]

describe('STEP_DEFINITIONS', () => {
  it('déclare exactement les 7 étapes du pipeline automatisé (ni REVIEW ni PUBLISH, pilotées par un humain)', () => {
    expect(STEP_DEFINITIONS.map((s) => s.type).sort()).toEqual([...ALL_STEP_TYPES].sort())
  })

  it('toute étape non exécutable a une raison de saut non vide', () => {
    for (const definition of STEP_DEFINITIONS) {
      if (!definition.executable) {
        expect(definition.skipReason).toBeDefined()
        expect(definition.skipReason?.trim().length ?? 0).toBeGreaterThan(0)
      }
    }
  })

  it('OUTLINE, DRAFT et SEO sont exécutables', () => {
    for (const type of [StepType.OUTLINE, StepType.DRAFT, StepType.SEO]) {
      expect(getStepDefinition(type).executable).toBe(true)
    }
  })

  it('RESEARCH, ANALYSIS, FACT_CHECK et QUALITY ne sont pas exécutables', () => {
    for (const type of [StepType.RESEARCH, StepType.ANALYSIS, StepType.FACT_CHECK, StepType.QUALITY]) {
      expect(getStepDefinition(type).executable).toBe(false)
    }
  })

  it('les étapes exécutables ne portent pas de skipReason', () => {
    for (const definition of STEP_DEFINITIONS) {
      if (definition.executable) {
        expect(definition.skipReason).toBeUndefined()
      }
    }
  })

  it("l'ordre des étapes est strictement croissant et sans doublon", () => {
    const orders = STEP_DEFINITIONS.map((s) => s.order)
    const sorted = [...orders].sort((a, b) => a - b)
    expect(orders).toEqual(sorted)
    expect(new Set(orders).size).toBe(orders.length)
  })

  it('respecte la séquence RESEARCH -> ANALYSIS -> OUTLINE -> DRAFT -> FACT_CHECK -> SEO -> QUALITY', () => {
    expect(STEP_DEFINITIONS.map((s) => s.type)).toEqual(ALL_STEP_TYPES)
  })
})

describe('getStepDefinition', () => {
  it("échoue explicitement pour un type d'étape non déclaré", () => {
    expect(() => getStepDefinition('REVIEW' as StepType)).toThrow(/REVIEW/)
  })
})
