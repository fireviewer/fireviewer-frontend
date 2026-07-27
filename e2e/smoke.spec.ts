import { expect, test } from '@playwright/test';

test('le shell public reste consultable sans catalogue spatial', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByText('FireWarning', { exact: false }).first()).toBeVisible();
  await expect(page.locator('main')).toBeVisible();
});

test('la liste des incendies conserve un état lisible sans API', async ({ page }) => {
  await page.goto('/incendies');

  await expect(page.getByRole('heading', { name: /Incendies référencés/i })).toBeVisible();
  await expect(page.locator('main')).toBeVisible();
});
