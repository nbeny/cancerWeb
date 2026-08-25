import { DomainRole, ExpertiseLevel, PrismaClient, Tone } from '@prisma/client'
import { hash, Algorithm } from '@node-rs/argon2'

const prisma = new PrismaClient()

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Le seed de démonstration est interdit en production')
  }

  const passwordHash = await hash('Demo-Password-2026!', { algorithm: Algorithm.Argon2id })

  const admin = await prisma.user.upsert({
    where: { email: 'admin@cancerweb.local' },
    update: {},
    create: {
      email: 'admin@cancerweb.local',
      name: 'Admin Démo',
      slug: 'admin-demo',
      passwordHash,
      globalRole: 'ADMIN',
    },
  })

  const domain = await prisma.domain.upsert({
    where: { slug: 'cybersecurite' },
    update: {},
    create: {
      name: 'Cybersécurité',
      slug: 'cybersecurite',
      description: 'Veille et analyses sur la sécurité des systèmes d’information.',
      language: 'fr',
      tone: Tone.TECHNICAL,
      expertiseLevel: ExpertiseLevel.EXPERT,
      targetAudience: ['développeurs', 'RSSI'],
      keywords: ['zero trust', 'cloud', 'kubernetes'],
      excludedTopics: ['cryptomonnaies'],
      aiInstructions: [
        'Toujours expliquer les concepts techniques avec des exemples.',
        'Éviter les phrases marketing.',
        'Privilégier les informations vérifiables et citer les sources.',
      ].join('\n'),
    },
  })

  await prisma.domainMember.upsert({
    where: { userId_domainId: { userId: admin.id, domainId: domain.id } },
    update: {},
    create: { userId: admin.id, domainId: domain.id, role: DomainRole.OWNER },
  })

  console.log('Seed terminé : admin@cancerweb.local / Demo-Password-2026!')
}

main()
  .catch((error) => { console.error(error); process.exit(1) })
  .finally(() => prisma.$disconnect())
