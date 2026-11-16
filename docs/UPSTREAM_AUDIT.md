# Upstream audit

Hypercast is a fork of the open-source Farcaster client monorepo. This page
records what was taken from it, what was rewritten, what was removed, and why.

- Upstream: `https://github.com/farcasterxyz/client`
- Forked at commit `73a39bd8af1f22325af8e32c84b24228fad45906`
- Licence: MIT, copyright © 2026 Neynar, Inc.

## The constraint

The upstream web client gets its data from the upstream operator's own API,
through three workspace packages (`farcaster-client-data`,
`farcaster-client-hooks`, `farcaster-client-analytics`), and uses hosted wallet,
login and analytics services. Hypercast uses none of those services. So an
upstream module can be used as it is only if nothing it imports, directly or
indirectly, reaches one of those packages or names one of those services.

An import-graph pass over the web app at the forked commit found 1,131 source
modules, of which 327 meet that test. They are mostly leaves: layout shells,
navigation parts, tabs, loaders, lists, modals, buttons, the theme provider.
The composites that give the client its look (the cast card, the profile header,
the page header, the mobile header, search) do not.

## Used as they are

Imported unchanged from the upstream web app:

| Area | Modules |
| --- | --- |
| Layout | `layouts/Container`, `layouts/LeftSideBar`, `layouts/RightSideBar`, `components/BorderedMainContent` |
| Navigation | `components/links/NavLinkContainer`, `NavLinkIcon`, `NavLinkLabel`; `hooks/navigation/useCanGoBack`, `useGoBack` |
| Tabs and lists | `components/tabs/Tab`, `Tabs`; `components/lists/FlatList` |
| Buttons | `components/forms/buttons/DefaultButton`, `ComposeCastButton` |
| Modals | `components/modals/Modal`, `DefaultModalContainer`, `DefaultModalContent`, `DefaultModalHeader`, `ImageLightboxModal` |
| Loaders and images | `components/loaders/LoadingIndicator`, `FullScreenLoadingIndicator`; `components/images/Image` |
| Providers | `contexts/ThemeProvider`, `contexts/GlobalKeyPressProvider`; `hooks/theme/useUserSavedTheme` |
| Styling | `src/index.css` (minus six `@font-face` rules), `tailwind.config.js`, the Tailwind and PostCSS setup |

Also kept: the build tooling (Vite, TypeScript, ESLint, Prettier, Vitest), the
lockfile, and the upstream unit tests, which still pass.

## Rewritten to the same design

These reach the upstream services, so they were written again for Hypercast.
The markup structure, class names and design tokens follow the upstream
components so that the result looks the same; the data they show comes from
Hypercast's own types. They live in `apps/farcaster-web/src/hypercast/`.

| Hypercast | Follows upstream |
| --- | --- |
| `components/CastCard`, `CastActions`, `Threadline` | The unfocused cast, its action row and thread line |
| `components/FocusedCast` | The focused cast on a conversation page |
| `components/Embeds` | Image, video, link and quoted-cast embeds |
| `components/Avatar`, `RichText` | Avatar; cast text with mentions and links |
| `components/ProfileHeader`, `UserRow`, `ChannelRow` | Profile header; user and channel list rows |
| `components/PageHeader`, `BackButton` | Page header, tabs row and back arrow |
| `components/NotificationList` | Notification rows |
| `layout/Shell`, `LeftNav`, `RightRail`, `MobileHeader`, `SearchBox`, `nav` | The app frame and navigation |
| `pages/*` | Each screen |

Differences from upstream that are deliberate:

- The profile header's banner area is shorter, because accounts on a node have
  no banner image.
- Link embeds show a plain link card. Upstream fetches a preview from its own
  service.
- Action counts of zero are not shown, as upstream; unavailable actions carry a
  label saying why.
- On a phone the reply, recast and like buttons share the row evenly. Upstream's
  fixed-width columns wrap at that width when a second right-hand control is
  present.
- The back arrow is a `<button>` so it can be used from the keyboard.
- Cast links use the full hash rather than upstream's short prefix, because a
  node cannot look a cast up by prefix.

## Present but not used

The rest of the upstream tree is still in the repository: the mobile app, the
shared packages, and the upstream web app's own entry point (`src/index.tsx`),
screens, hooks and utilities. None of it is imported by Hypercast, so none of it
is in the build. It is kept so that the fork stays easy to compare and merge
with upstream.

Lint rules stop Hypercast's code from importing the service packages or the
upstream modules that embed upstream-operated hosts, such as the default-avatar
constant, the image-resizing helper and the link helpers.

## Removed

314 files were deleted from the web app, because anything under `public/` is
deployed as it is:

| Removed | Count | Why |
| --- | --- | --- |
| `public/~/images`, `public/~/channel-images`, `public/~/dc-images` | 245 | Upstream artwork, channel icons and third-party logos, used only by screens Hypercast does not have. |
| `public/sitemaps/`, `public/sitemap.xml`, `scripts/validateSitemaps.mjs` | 25 | Sitemaps for the upstream site's own URLs. |
| `public/.well-known/` | 2 | App-association files tying the site to the upstream mobile apps. |
| `public/fonts/`, `src/assets/fonts/` | 28 | A commercial typeface whose redistribution terms could not be confirmed. It was used only on upstream's landing and login pages. |
| `public/brand/` (upstream marks) and the logo, favicon, social and promotional images | 13 | Upstream identity and artwork. The identity is replaced; see [BRANDING.md](BRANDING.md). |
| `public/avatar.png` | 1 | Replaced by an original placeholder. |

Changed in place:

| File | Change |
| --- | --- |
| `index.html` | New title, description and icons. Removed the site-verification tag and the preconnect to upstream's image CDN. The inline theme script became a file so that the page needs no inline script. Entry point is `src/hypercast/main.tsx`. |
| `public/manifest.json` | Hypercast name and icons. Removed the protocol handler and share target that pointed at the upstream site. |
| `public/robots.txt` | No longer points at upstream sitemaps. |
| `vite.config.js` | Removed Node polyfills and upstream chunking. Added the security-policy plugin. |
| `eslint.config.mjs` | Added the import and network boundary for Hypercast's code. |
| `package.json` | Scripts for the mock node and tests; one dependency declared directly (already in the lockfile). |
| `AGENT_GUIDE.md`, `README.md` (root) | Removed and replaced; they described running the upstream client. |

## How to check

`pnpm test:e2e` builds the app and reads the output. It fails if any upstream
host, tracker or wallet provider is named anywhere in the shipped files, if any
upstream site file is present, or if the read-only build contains code that
could submit anything.
