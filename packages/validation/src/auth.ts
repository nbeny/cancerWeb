import { z } from 'zod'

// Seule source de vérité pour les bornes d'authentification, consommées à la
// fois par les schémas zod ci-dessous (front, via zodResolver) et par les
// décorateurs class-validator de apps/api/src/auth/auth.types.ts (API).
// Voir apps/api/src/auth/auth.types.spec.ts pour le test qui échouerait si
// les deux systèmes divergeaient à nouveau.
export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 200
export const NAME_MIN_LENGTH = 2
export const NAME_MAX_LENGTH = 80

export const loginSchema = z.object({
  email: z.email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})

export const registerSchema = z.object({
  email: z.email('Email invalide'),
  name: z.string().min(NAME_MIN_LENGTH, 'Nom trop court').max(NAME_MAX_LENGTH, 'Nom trop long'),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Le mot de passe doit faire au moins ${PASSWORD_MIN_LENGTH} caractères`)
    .max(PASSWORD_MAX_LENGTH, 'Mot de passe trop long'),
})

export type LoginValues = z.infer<typeof loginSchema>
export type RegisterValues = z.infer<typeof registerSchema>
