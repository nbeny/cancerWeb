import { expect, test, type BrowserContext } from '@playwright/test'

const unique = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}`

test('inscription, création d’un domaine et déconnexion', async ({ page }) => {
  const id = unique()

  await page.goto('/auth/register')
  await page.getByLabel('Email').fill(`${id}@example.com`)
  await page.getByLabel('Nom').fill('Utilisateur E2E')
  await page.getByLabel('Mot de passe').fill('Sup3r-Secret-2026!')
  await page.getByRole('button', { name: 'Créer mon compte' }).click()

  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByText('Aucun domaine éditorial')).toBeVisible()

  await page.getByRole('link', { name: 'Créer un domaine' }).click()
  await page.getByLabel('Nom du domaine').fill(`Domaine ${id}`)
  await page.getByLabel('Description').fill('Domaine créé par le test E2E')
  await page.getByRole('button', { name: 'Créer le domaine' }).click()

  await expect(page).toHaveURL(/\/dashboard\/domains/)
  await expect(page.getByText(`Domaine ${id}`)).toBeVisible()

  await page.getByRole('button', { name: 'Déconnexion' }).click()
  await expect(page).toHaveURL(/\/auth\/login/)

  // La session est bien détruite : le dashboard redirige vers le login.
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/auth\/login/)
})

test('un utilisateur ne voit pas les domaines d’un autre', async ({ browser }) => {
  const first = await browser.newContext()
  const second = await browser.newContext()
  const idA = unique()
  const idB = unique()

  const register = async (context: BrowserContext, id: string) => {
    const page = await context.newPage()
    await page.goto('/auth/register')
    await page.getByLabel('Email').fill(`${id}@example.com`)
    await page.getByLabel('Nom').fill(`User ${id}`)
    await page.getByLabel('Mot de passe').fill('Sup3r-Secret-2026!')
    await page.getByRole('button', { name: 'Créer mon compte' }).click()
    await expect(page).toHaveURL(/\/dashboard/)
    return page
  }

  const pageA = await register(first, idA)
  await pageA.goto('/dashboard/domains/new')
  await pageA.getByLabel('Nom du domaine').fill(`Privé ${idA}`)
  await pageA.getByRole('button', { name: 'Créer le domaine' }).click()
  await expect(pageA.getByText(`Privé ${idA}`)).toBeVisible()

  const pageB = await register(second, idB)
  await pageB.goto('/dashboard/domains')
  await expect(pageB.getByText(`Privé ${idA}`)).toHaveCount(0)

  await first.close()
  await second.close()
})
