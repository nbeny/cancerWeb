import { z } from 'zod'

// Ces seuils doivent rester alignés avec apps/api/src/auth/auth.types.ts
// (class-validator côté API) : mot de passe >= 12 caractères, nom entre 2 et 80.
export const loginSchema = z.object({
  email: z.email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})

export const registerSchema = z.object({
  email: z.email('Email invalide'),
  name: z.string().min(2, 'Nom trop court').max(80, 'Nom trop long'),
  password: z
    .string()
    .min(12, 'Le mot de passe doit faire au moins 12 caractères')
    .max(200, 'Mot de passe trop long'),
})

export type LoginValues = z.infer<typeof loginSchema>
export type RegisterValues = z.infer<typeof registerSchema>
