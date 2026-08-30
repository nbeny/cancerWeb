import { z } from 'zod'
import { isIsoCountryCode } from './country'

// Ces bornes doivent rester alignées avec apps/api/src/domains/domain.types.ts
// (class-validator côté API, seule source de vérité) : `name` 2-80,
// `description` <= 500, `country` un code ISO 3166-1 alpha-2, `aiInstructions`
// <= 4000, tableaux plafonnés (targetAudience 20, keywords/excludedTopics 50).
// `Tone` et `ExpertiseLevel` reflètent les enums Prisma (prisma/schema.prisma).

export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const

export const TONES = [
  'PROFESSIONAL',
  'EDUCATIONAL',
  'JOURNALISTIC',
  'TECHNICAL',
  'ACCESSIBLE',
  'PROVOCATIVE',
  'NEUTRAL',
] as const

export const EXPERTISE_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'EXPERT'] as const

export const createDomainSchema = z.object({
  name: z.string().min(2, 'Le nom doit faire au moins 2 caractères').max(80, 'Le nom doit faire au plus 80 caractères'),
  description: z.string().max(500, 'La description doit faire au plus 500 caractères').optional(),
  language: z.enum(SUPPORTED_LANGUAGES),
  // `refine` plutôt que `transform().pipe(enum)` : ce dernier change le type
  // de sortie inféré (string -> union littérale), ce qui casse l'inférence
  // de type de react-hook-form pour `defaultValues`/`register`. `refine`
  // garde `country` typé `string`, cohérent avec les autres champs texte,
  // tout en validant de façon insensible à la casse comme le fait la
  // normalisation `@Transform` côté API (domain.types.ts).
  country: z
    .string()
    .refine((value) => isIsoCountryCode(value.toUpperCase()), 'Le pays doit être un code ISO 3166-1 alpha-2 valide')
    .optional(),
  tone: z.enum(TONES),
  expertiseLevel: z.enum(EXPERTISE_LEVELS),
  targetAudience: z.array(z.string()).max(20, 'Vingt cibles maximum').optional(),
  keywords: z.array(z.string()).max(50, 'Cinquante mots-clés maximum').optional(),
  excludedTopics: z.array(z.string()).max(50, 'Cinquante sujets exclus maximum').optional(),
  aiInstructions: z.string().max(4000, 'Les instructions IA doivent faire au plus 4000 caractères').optional(),
})

// Tous les champs sont facultatifs (mise à jour partielle), y compris
// `country` (voir domain.types.ts : ajouté à UpdateDomainInput, une
// asymétrie non intentionnelle du Lot 0) ; les mêmes bornes s'appliquent
// quand un champ est fourni.
export const updateDomainSchema = createDomainSchema.partial().extend({
  autoPublish: z.boolean().optional(),
  reviewOutline: z.boolean().optional(),
})

export type CreateDomainValues = z.infer<typeof createDomainSchema>
export type UpdateDomainValues = z.infer<typeof updateDomainSchema>
