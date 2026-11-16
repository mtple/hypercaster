// @ts-check
/**
 * The read-only build in a real browser, against the mock node.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { env, launch, openPage, overflowX, resetNode, setNodeMode } from './helpers.mjs';

const LAUNCH_HASH = '5c326fef6adb081bed424f3a24a4530e352d4ea7';
const VIEWING_ADA = { 'hypercast:v1:viewing': { fid: '1001', username: 'ada', displayName: 'Ada Okafor' } };
const shotsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'screenshots');

/** @type {import('playwright').Browser} */
let browser;
beforeAll(async () => {
  browser = await launch();
  fs.mkdirSync(shotsDir, { recursive: true });
});
afterAll(async () => {
  await browser?.close();
});
beforeEach(resetNode);

const app = (pathname = '/') => env().readOnlyUrl + pathname;

describe('browsing', () => {
  it('shows the trending feed and asks the node only for what it shows', async () => {
    const { page, context, problems, requests, nodeRequests } = await openPage(browser);
    await page.goto(app());
    await expect.poll(() => page.locator('article').count()).toBeGreaterThan(5);
    expect(await page.title()).toBe('Hypercast');
    await expect.poll(() => page.getByText('Trending channels').count()).toBe(1);

    // Every request went to the app itself or to the configured node.
    const origins = new Set(requests.map((request) => new URL(request.url).origin));
    expect([...origins].filter((origin) => !/fonts\./.test(origin)).sort()).toEqual(
      [env().nodeUrl, env().readOnlyUrl].sort(),
    );
    expect(nodeRequests().every((request) => request.method === 'GET')).toBe(true);
    expect(nodeRequests().some((request) => request.url.includes('/v2/farcaster/feed/trending'))).toBe(true);
    // A guest has no identity to send.
    expect(nodeRequests().some((request) => request.url.includes('viewer_fid'))).toBe(false);
    expect(problems).toEqual([]);
    await context.close();
  });

  it('opens a cast from the feed, then its author, then a channel', async () => {
    const { page, context, problems } = await openPage(browser);
    await page.goto(app());
    await page.getByText('Shipping day. The read path is finished').first().click();
    await page.waitForURL(/\/ada\/0x[0-9a-f]{40}$/);
    await expect.poll(() => page.getByText('Congratulations. Does search cover channels too?').count()).toBe(1);
    expect(await page.title()).toMatch(/^@ada: Shipping day/);

    await page.getByRole('link', { name: 'ben', exact: true }).first().click();
    await page.waitForURL(/\/ben$/);
    await expect.poll(() => page.getByText('Photographer. Mostly coastlines.').count()).toBe(1);

    await page.goto(app('/~/channel/builders'));
    await expect.poll(() => page.locator('article').count()).toBeGreaterThan(0);
    await page.getByRole('link', { name: 'Members', exact: true }).click();
    await page.waitForURL(/\/members$/);
    await expect.poll(() => page.getByText('Ada Okafor').count()).toBeGreaterThan(0);
    expect(problems).toEqual([]);
    await context.close();
  });

  it('loads deep links directly, including short and unprefixed cast hashes', async () => {
    const { page, context, problems } = await openPage(browser);
    for (const pathname of [`/~/conversations/0x${LAUNCH_HASH}`, `/~/conversations/${LAUNCH_HASH}`, `/ada/0x${LAUNCH_HASH.slice(0, 8)}`]) {
      await page.goto(app(pathname));
      await expect.poll(() => page.getByText('Congratulations. Does search cover channels too?').count(), { message: pathname }).toBe(1);
    }
    await page.goto(app('/~/profiles/4294967301'));
    await expect.poll(() => page.getByText('Registered on Hypersnap. No Snapchain history.').count()).toBe(1);
    expect(problems).toEqual([]);
    await context.close();
  });

  it('searches casts, users and channels from the search box', async () => {
    const { page, context, problems } = await openPage(browser);
    await page.goto(app());
    const box = page.getByPlaceholder('Search casts, channels and users').first();
    await box.fill('pagination');
    await box.press('Enter');
    await page.waitForURL(/\/~\/search\/recent\?q=pagination/);
    await expect.poll(() => page.getByText('A note on pagination').count()).toBeGreaterThan(0);
    await page.getByRole('link', { name: 'Users' }).click();
    await page.waitForURL(/\/~\/search\/users\?q=pagination/);
    await page.goto(app('/~/search/users?q=chi'));
    await expect.poll(() => page.getByText('@chiyo').count()).toBeGreaterThan(0);
    await page.goto(app('/~/search/channels?q=photo'));
    await expect.poll(() => page.getByText('/photo').count()).toBeGreaterThan(0);
    expect(problems).toEqual([]);
    await context.close();
  });

  it('pages through a long list as it is scrolled', async () => {
    const { page, context, nodeRequests } = await openPage(browser);
    await page.goto(app());
    await expect.poll(() => page.locator('article').count()).toBeGreaterThan(5);
    const first = await page.locator('article').count();
    for (let i = 0; i < 6; i += 1) {
      await page.mouse.wheel(0, 6000);
      await page.waitForTimeout(250);
    }
    await expect.poll(() => page.locator('article').count()).toBeGreaterThan(first);
    const cursors = nodeRequests().filter((request) => request.url.includes('feed/trending') && request.url.includes('cursor='));
    expect(cursors.length).toBeGreaterThan(0);
    await context.close();
  });
});

describe('a public view is not a sign-in', () => {
  it('asks a guest to pick an account, then shows that account’s feed and notifications', async () => {
    const { page, context, problems, nodeRequests } = await openPage(browser);
    await page.goto(app('/~/notifications'));
    await expect.poll(() => page.getByRole('button', { name: /View a public feed|Choose an account/ }).count()).toBeGreaterThan(0);

    await page.getByRole('button', { name: /View a public feed|Choose an account/ }).first().click();
    await page.getByLabel('Username or FID').fill('ada');
    await page.getByRole('button', { name: 'View feed' }).click();
    await expect.poll(() => page.getByText('liked a cast by @ada').count()).toBeGreaterThan(0);
    await expect.poll(() => page.getByText(/public view, not a sign-in/).count()).toBeGreaterThan(0);
    await expect.poll(() => page.getByText('Viewing as').count()).toBeGreaterThan(0);

    await page.goto(app('/~/following'));
    await expect.poll(() => page.locator('article').count()).toBeGreaterThan(0);
    // The chosen account selects the data; it is never sent as the viewer.
    expect(nodeRequests().some((request) => /[?&]fid=1001/.test(request.url))).toBe(true);
    expect(nodeRequests().some((request) => request.url.includes('viewer_fid'))).toBe(false);
    expect(nodeRequests().every((request) => request.method === 'GET')).toBe(true);
    expect(problems).toEqual([]);
    await context.close();
  });
});

describe('read-only controls', () => {
  it('shows reply, recast and like switched off, with the reason, and sends nothing', async () => {
    const { page, context, nodeRequests } = await openPage(browser);
    await page.goto(app(`/~/conversations/0x${LAUNCH_HASH}`));
    await expect.poll(() => page.locator('article').count()).toBeGreaterThan(1);
    for (const name of ['Reply', 'Recast', 'Like']) {
      const button = page.getByRole('button', { name: new RegExp(`^${name} — Read-only preview`) }).first();
      expect(await button.getAttribute('aria-disabled')).toBe('true');
      await button.click({ force: true });
    }
    expect(await page.getByRole('button', { name: /^Follow$/ }).count()).toBe(0);
    expect(await page.getByRole('button', { name: /Sign in/ }).count()).toBe(0);
    expect(await page.getByRole('dialog').count()).toBe(0);
    expect(nodeRequests().every((request) => request.method === 'GET')).toBe(true);
    expect(await page.evaluate(() => 'ethereum' in window)).toBe(false);
    await context.close();
  });

  it('keeps bookmarks on the device and can clear them', async () => {
    const { page, context, nodeRequests } = await openPage(browser);
    await page.goto(app());
    await expect.poll(() => page.locator('article').count()).toBeGreaterThan(5);
    await page.getByRole('button', { name: /^Bookmark/ }).first().click();
    const before = nodeRequests().length;
    await page.goto(app('/~/bookmarks'));
    await expect.poll(() => page.locator('article').count()).toBe(1);
    await page.reload();
    await expect.poll(() => page.locator('article').count()).toBe(1);
    expect(nodeRequests().slice(before).every((request) => request.method === 'GET')).toBe(true);

    page.on('dialog', (dialog) => void dialog.accept());
    await page.goto(app('/~/settings'));
    await page.getByRole('button', { name: 'Clear local data' }).click();
    await page.goto(app('/~/bookmarks'));
    await expect.poll(() => page.getByText('You’ll see your bookmarked casts here').count()).toBeGreaterThan(0);
    await context.close();
  });
});

describe('when things go wrong', () => {
  it('explains a node outage, keeps the page usable, and recovers on retry', async () => {
    const { page, context } = await openPage(browser);
    await setNodeMode('error');
    await page.goto(app());
    await expect.poll(() => page.getByRole('alert').count(), { timeout: 30_000 }).toBeGreaterThan(0);
    expect(await page.getByRole('link', { name: 'Explore' }).count()).toBeGreaterThan(0);
    await setNodeMode('ok');
    await page.getByRole('button', { name: /Try again|Retry/ }).first().click();
    await expect.poll(() => page.locator('article').count()).toBeGreaterThan(5);
    await context.close();
  });

  it('says plainly when a cast, an account or a page is not there', async () => {
    const { page, context } = await openPage(browser);
    await page.goto(app(`/~/conversations/0x${'12'.repeat(20)}`));
    await expect.poll(() => page.getByText(/not found on|isn’t on|not on this/i).count()).toBeGreaterThan(0);
    await page.goto(app('/no-such-person-here'));
    await expect.poll(() => page.getByText(/not found|No account/i).count()).toBeGreaterThan(0);
    await page.goto(app('/~/inbox'));
    await expect.poll(() => page.getByText('This isn’t available in Hypercast').count()).toBe(1);
    await context.close();
  });

  it('renders hostile text as text', async () => {
    const { page, context, problems } = await openPage(browser);
    let dialogs = 0;
    page.on('dialog', (dialog) => {
      dialogs += 1;
      void dialog.dismiss();
    });
    await page.goto(app());
    for (let i = 0; i < 4; i += 1) {
      await page.mouse.wheel(0, 5000);
      await page.waitForTimeout(200);
    }
    expect(dialogs).toBe(0);
    expect(await page.locator('article script, article iframe, article [onerror], article [onclick]').count()).toBe(0);
    expect(await page.locator('a[href^="javascript:"]').count()).toBe(0);
    expect(problems).toEqual([]);
    await context.close();
  });
});

describe('layout', () => {
  const sizes = [
    { name: 'phone', width: 390, height: 844 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ];
  const screens = [
    { name: 'home', path: '/' },
    { name: 'conversation', path: `/~/conversations/0x${LAUNCH_HASH}` },
    { name: 'profile', path: '/ada' },
    { name: 'notifications', path: '/~/notifications', storage: VIEWING_ADA },
    { name: 'channel', path: '/~/channel/builders' },
    { name: 'search', path: '/~/search/recent?q=node' },
    { name: 'settings', path: '/~/settings' },
    { name: 'about', path: '/~/about' },
  ];

  for (const size of sizes) {
    it(`fits a ${size.name} without sideways scrolling`, async () => {
      for (const screen of screens) {
        const { page, context, problems } = await openPage(browser, { ...size, storage: screen.storage });
        await page.goto(app(screen.path), { waitUntil: 'networkidle' });
        expect(await overflowX(page), `${screen.name} at ${size.width}`).toBeLessThanOrEqual(0);
        // The sticky header, tabs included, ends before the first cast starts.
        const overlap = await page.evaluate(() => {
          const first = document.querySelector('main article');
          // The phone header and the page header are both sticky bars.
          const bars = [...document.querySelectorAll('main nav.sticky')];
          if (bars.length === 0 || !first) {
            return 0;
          }
          const bottoms = bars.flatMap((bar) => [bar, ...bar.querySelectorAll('a, button')]).map((element) => element.getBoundingClientRect().bottom);
          return Math.max(...bottoms) - first.getBoundingClientRect().top;
        });
        expect(overlap, `${screen.name} at ${size.width}: header over content`).toBeLessThanOrEqual(1);
        expect(problems, `${screen.name} at ${size.width}`).toEqual([]);
        await page.screenshot({ path: path.join(shotsDir, `${screen.name}-${size.width}.png`) });
        await context.close();
      }
    });
  }

  it('follows the system theme and remembers an explicit choice', async () => {
    const { page, context } = await openPage(browser, { colorScheme: 'dark' });
    await page.goto(app('/~/settings'), { waitUntil: 'networkidle' });
    const isDark = () => page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(await isDark()).toBe(true);
    await page.screenshot({ path: path.join(shotsDir, 'settings-dark-1440.png') });
    await page.getByRole('radio', { name: 'Light' }).click();
    expect(await isDark()).toBe(false);
    await page.reload({ waitUntil: 'networkidle' });
    expect(await isDark()).toBe(false);
    await context.close();
  });

  it('can be used from the keyboard', async () => {
    const { page, context } = await openPage(browser);
    await page.goto(app(), { waitUntil: 'networkidle' });
    const seen = [];
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      seen.push(await page.evaluate(() => (document.activeElement?.textContent ?? '').trim() || document.activeElement?.getAttribute('aria-label') || document.activeElement?.getAttribute('placeholder') || ''));
    }
    expect(seen).toEqual(expect.arrayContaining(['Home', 'Notifications', 'Explore', 'Trending', 'Following']));
    await context.close();
  });
});
