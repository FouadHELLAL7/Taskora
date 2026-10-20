import { expect, test } from '@playwright/test';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.skip(!email || !password, 'Set E2E_EMAIL and E2E_PASSWORD to run the browser tests');

test('technician workflow: company → ticket → note → time → resolve', async ({ page }) => {
  const suffix = Date.now().toString(36);
  const companyName = `E2E Customer ${suffix}`;

  // Sign in
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // Create a company
  await page.goto('/companies');
  await page.getByRole('button', { name: 'New company' }).click();
  const companyDialog = page.getByRole('dialog');
  await companyDialog.locator('input').first().fill(companyName);
  await companyDialog.getByRole('button', { name: 'Create company' }).click();
  await expect(page.getByRole('heading', { name: companyName })).toBeVisible();

  // Raise a ticket from the company workspace
  await page.getByRole('main').getByRole('button', { name: 'New ticket' }).click();
  await expect(page).toHaveURL(/\/tickets\/new\?companyId=\d+/);
  await page.getByPlaceholder('Short summary of the issue').fill('E2E: Outlook keeps crashing');
  await page.getByPlaceholder(/Symptoms, error messages/).fill('Outlook closes when opening shared calendars.');
  await page.getByRole('button', { name: 'Create ticket' }).click();
  await expect(page).toHaveURL(/\/tickets\/\d+$/);
  await expect(page.getByRole('heading', { name: 'E2E: Outlook keeps crashing' })).toBeVisible();

  // Internal note
  await page.getByPlaceholder('Troubleshooting notes, findings, next steps…').fill('Repaired the Office installation.');
  await page.getByRole('button', { name: 'Post note' }).click();
  await expect(page.getByText('Repaired the Office installation.').first()).toBeVisible();

  // Log time
  await page.getByRole('button', { name: 'Log time', exact: true }).click();
  const timeDialog = page.getByRole('dialog');
  await timeDialog.getByRole('button', { name: '30m' }).click();
  await timeDialog.locator('textarea').first().fill('Office repair and profile test');
  await timeDialog.getByRole('button', { name: 'Save time entry' }).click();
  await expect(page.getByText('Office repair and profile test').first()).toBeVisible();

  // Resolve with a resolution
  await page.getByLabel('Status', { exact: true }).selectOption({ label: 'Resolved' });
  await page.getByPlaceholder('Root cause and the fix applied…').fill('Corrupt Office installation repaired.');
  await page.getByRole('button', { name: 'Resolve ticket' }).click();
  await expect(page.getByText('Corrupt Office installation repaired.').first()).toBeVisible();
  await expect(page.getByText('Resolved').first()).toBeVisible();
});

test('global search finds a ticket by number', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Search by ticket number/).fill('TKA-000001');
  await page.getByRole('option', { name: /TKA-000001/ }).click();
  await expect(page).toHaveURL(/\/tickets\/\d+$/);
});
