import { SetMetadata } from '@nestjs/common'
import { DomainRole } from '@prisma/client'

export const DOMAIN_ROLE_KEY = 'requiredDomainRole'

/** Rôle minimum requis sur le domaine ciblé par l'argument `domainId` ou `id`. */
export const RequireDomainRole = (role: DomainRole) => SetMetadata(DOMAIN_ROLE_KEY, role)
