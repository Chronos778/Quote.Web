import { test, expect } from '@playwright/test';

test('has title and quote display', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Quote\.Web/);
  
  const quoteText = page.locator('#quote-text');
  await expect(quoteText).toBeVisible();
});
