// @ts-check
import { chromium } from 'playwright';
import { inject } from 'vitest';

/** @returns {{ nodeUrl: string, readOnlyUrl: string, writesUrl: string, readOnlyDir: string, writesDir: string }} */
export const env = () => /** @type {any} */ (inject)('e2e');

export async function launch() {
  return chromium.launch({
    executablePath: process.env.HYPERCAST_E2E_CHROME || undefined,
    args: ['--no-sandbox'],
  });
}

/** Puts the mock node back to its starting state. */
export async function resetNode() {
  await fetch(`${env().nodeUrl}/__control/reset`);
}

export async function setNodeMode(mode) {
  await fetch(`${env().nodeUrl}/__control/mode?value=${mode}`);
}

/**
 * Opens a page that records what it asks the network for and anything it
 * complains about, so each test can assert on both.
 *
 * @param {import('playwright').Browser} browser
 * @param {{ width?: number, height?: number, colorScheme?: 'light' | 'dark', storage?: Record<string, unknown> }} [options]
 */
export async function openPage(browser, options = {}) {
  const context = await browser.newContext({
    viewport: { width: options.width ?? 1440, height: options.height ?? 900 },
    colorScheme: options.colorScheme ?? 'light',
  });
  // Fonts come from a third party and are not under test; keep runs offline.
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  if (options.storage) {
    await context.addInitScript((entries) => {
      for (const [key, value] of Object.entries(entries)) {
        localStorage.setItem(key, JSON.stringify(value));
      }
    }, options.storage);
  }
  const page = await context.newPage();
  /** @type {{ method: string, url: string }[]} */
  const requests = [];
  /** @type {string[]} */
  const problems = [];
  page.on('request', (request) => requests.push({ method: request.method(), url: request.url() }));
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/fonts\.|ERR_FAILED|Failed to load resource/.test(message.text())) {
      problems.push(`console: ${message.text()}`);
    }
  });
  const nodeRequests = () => requests.filter((request) => request.url.startsWith(env().nodeUrl) && !request.url.includes('/media/') && !request.url.includes('/__control/'));
  return { context, page, requests, problems, nodeRequests };
}

/** How far the page is wider than the window; 0 means no sideways scroll. */
export const overflowX = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
