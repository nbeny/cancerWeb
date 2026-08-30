import { z } from 'zod'

// Bornes partagées pour Topic, consommées directement par les décorateurs
// class-validator de apps/api/src/topics/topic.types.ts (voir auth.ts pour
// le même motif : une seule source de vérité, importée telle quelle côté
// API plutôt que dupliquée).
export const TOPIC_TITLE_MIN_LENGTH = 3
export const TOPIC_TITLE_MAX_LENGTH = 200
export const TOPIC_DESCRIPTION_MAX_LENGTH = 2000
export const TOPIC_SUGGESTED_ANGLE_MAX_LENGTH = 2000
export const TOPIC_KEYWORDS_MAX_SIZE = 30
export const TOPIC_DIFFICULTY_MIN = 1
export const TOPIC_DIFFICULTY_MAX = 10
export const TOPIC_INTEREST_MIN = 1
export const TOPIC_INTEREST_MAX = 10

// `estimatedDifficulty`/`estimatedInterest` viennent d'un <input type="number">
// HTML enregistré via react-hook-form : la valeur brute transite en chaîne
// (vide si l'utilisateur n'a rien saisi, ces deux champs étant facultatifs
// côté API). On garde volontairement le type de sortie `string | undefined`
// ici plutôt que `z.coerce.number()` : ce dernier fait dépendre le type
// TypeScript inféré de `CreateTopicValues` d'un mécanisme de coercition zod
// dont l'inférence ne s'accorde pas proprement avec le générique `Resolver`
// de react-hook-form (voir échec de build initial). La conversion en nombre
// est faite explicitement au moment de l'appel à la mutation
// (`components/dashboard/topic-form.tsx`).
const optionalScale = (min: number, max: number, label: string) =>
  z
    .string()
    .optional()
    .refine((value) => {
      if (!value) return true
      const parsed = Number(value)
      return Number.isInteger(parsed) && parsed >= min && parsed <= max
    }, `${label} doit être un entier entre ${min} et ${max}`)

export const createTopicSchema = z.object({
  title: z
    .string()
    .min(TOPIC_TITLE_MIN_LENGTH, `Le titre doit faire au moins ${TOPIC_TITLE_MIN_LENGTH} caractères`)
    .max(TOPIC_TITLE_MAX_LENGTH, `Le titre doit faire au plus ${TOPIC_TITLE_MAX_LENGTH} caractères`),
  description: z
    .string()
    .max(TOPIC_DESCRIPTION_MAX_LENGTH, `La description doit faire au plus ${TOPIC_DESCRIPTION_MAX_LENGTH} caractères`)
    .optional(),
  suggestedAngle: z
    .string()
    .max(
      TOPIC_SUGGESTED_ANGLE_MAX_LENGTH,
      `L'angle suggéré doit faire au plus ${TOPIC_SUGGESTED_ANGLE_MAX_LENGTH} caractères`,
    )
    .optional(),
  estimatedDifficulty: optionalScale(TOPIC_DIFFICULTY_MIN, TOPIC_DIFFICULTY_MAX, 'La difficulté estimée'),
  estimatedInterest: optionalScale(TOPIC_INTEREST_MIN, TOPIC_INTEREST_MAX, 'L’intérêt estimé'),
})

export type CreateTopicValues = z.infer<typeof createTopicSchema>
