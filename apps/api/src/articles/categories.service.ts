import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Category, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { slugify } from '../common/slug'
import { CreateCategoryInput, UpdateCategoryInput } from './category.types'

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, domainId: string, input: CreateCategoryInput): Promise<Category> {
    await this.requireMember(userId, domainId)
    if (input.parentId) await this.requireParent(domainId, input.parentId)

    return this.prisma.$transaction(async (tx) => {
      const slug = await this.uniqueSlug(slugify(input.name), domainId, tx)
      return tx.category.create({
        data: { domainId, name: input.name, description: input.description, parentId: input.parentId, slug },
      })
    })
  }

  /** Ne retourne que les catégories du domaine dont l'utilisateur est membre. */
  async listForDomain(userId: string, domainId: string): Promise<Category[]> {
    await this.requireMember(userId, domainId)
    return this.prisma.category.findMany({ where: { domainId }, orderBy: { name: 'asc' } })
  }

  async findForUser(userId: string, domainId: string, id: string): Promise<Category> {
    await this.requireMember(userId, domainId)
    return this.findForDomain(domainId, id)
  }

  async update(userId: string, domainId: string, id: string, input: UpdateCategoryInput): Promise<Category> {
    await this.requireMember(userId, domainId)
    await this.findForDomain(domainId, id) // refiltre sur le domaine RÉEL de la catégorie ciblée

    // `input.parentId` : `undefined` -> omis, ne rien changer ; `null` ->
    // effacer explicitement (catégorie racine), aucune vérification requise ;
    // une chaîne -> nouveau parent, à vérifier (existence, domaine, cycle).
    if (input.parentId) {
      await this.requireParent(domainId, input.parentId)
      await this.assertNoCycle(id, input.parentId)
    }

    return this.prisma.category.update({
      where: { id },
      data: { name: input.name, description: input.description, parentId: input.parentId },
    })
  }

  /**
   * Supprime la catégorie. Comportement retenu pour une catégorie ayant des
   * enfants : ils sont DÉTACHÉS (deviennent des catégories racines), jamais
   * supprimés en cascade — c'est le comportement porté par le schéma
   * (`Category.parent` en `onDelete: SetNull`, voir `schema.prisma`), pas une
   * politique ajoutée ici. Alternative écartée : refuser la suppression tant
   * qu'il reste des enfants (obligerait à les réaffecter un par un avant de
   * pouvoir supprimer un simple nœud intermédiaire, plus contraignant sans
   * bénéfice clair) ou les rattacher au grand-parent (déplacerait
   * silencieusement une sous-hiérarchie entière, un effet de bord surprenant
   * pour une suppression). Idem pour les articles qui la référencaient :
   * `Article.categoryId` passe à `null` (`onDelete: SetNull`), l'article
   * n'est jamais supprimé.
   */
  async remove(userId: string, domainId: string, id: string): Promise<boolean> {
    await this.requireMember(userId, domainId)
    await this.findForDomain(domainId, id)
    await this.prisma.category.delete({ where: { id } })
    return true
  }

  /**
   * Empêche un cycle dans la hiérarchie. Un cycle DIRECT (A parent de B, puis
   * B parent de A) se détecte en regardant seulement le parent proposé, mais
   * un cycle INDIRECT (A -> B -> C, puis A choisi comme parent de C)
   * nécessite de remonter toute la chaîne d'ancêtres du parent proposé : une
   * vérification qui ne regarde que le parent direct laisserait passer ce
   * second cas. `visited` est une sécurité anti-boucle infinie sur une chaîne
   * déjà corrompue (ne devrait jamais se produire, cette méthode empêchant
   * justement la création de tels cycles) plutôt qu'un mécanisme normal de
   * fonctionnement.
   *
   * Implémentation : une requête SQL par niveau d'ancêtre (pas de CTE
   * récursive), donc O(profondeur) allers-retours. Acceptable pour les
   * hiérarchies de catégories visées ici (quelques niveaux) ; ne conviendrait
   * plus pour des hiérarchies profondes ou une forte fréquence d'appel.
   */
  private async assertNoCycle(categoryId: string, proposedParentId: string): Promise<void> {
    let currentId: string | null = proposedParentId
    const visited = new Set<string>()
    while (currentId) {
      if (currentId === categoryId) {
        throw new ConflictException('Cette affectation créerait un cycle dans la hiérarchie des catégories')
      }
      if (visited.has(currentId)) break
      visited.add(currentId)
      const current: { parentId: string | null } | null = await this.prisma.category.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      })
      currentId = current?.parentId ?? null
    }
  }

  private async requireParent(domainId: string, parentId: string): Promise<void> {
    const parent = await this.prisma.category.findFirst({ where: { id: parentId, domainId } })
    if (!parent) throw new NotFoundException('Catégorie parente introuvable')
  }

  private async findForDomain(domainId: string, id: string): Promise<Category> {
    const category = await this.prisma.category.findFirst({ where: { id, domainId } })
    if (!category) throw new NotFoundException('Catégorie introuvable')
    return category
  }

  private async uniqueSlug(base: string, domainId: string, tx: Prisma.TransactionClient): Promise<string> {
    for (let i = 0; ; i++) {
      const candidate = i === 0 ? base : `${base}-${i}`
      const existing = await tx.category.findUnique({ where: { domainId_slug: { domainId, slug: candidate } } })
      if (!existing) return candidate
    }
  }

  /**
   * Vérifie l'appartenance au domaine indépendamment du guard : un appel
   * depuis un autre chemin ne doit pas pouvoir contourner l'isolation par
   * domaine simplement en sautant le resolver.
   */
  private async requireMember(userId: string, domainId: string): Promise<void> {
    const member = await this.prisma.domainMember.findUnique({
      where: { userId_domainId: { userId, domainId } },
    })
    if (!member) throw new NotFoundException('Domaine introuvable')
  }
}
