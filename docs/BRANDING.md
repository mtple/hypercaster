# Branding

Hypercast keeps the upstream client's layout and replaces its identity. This
page records what was replaced and what still needs a human decision.

**This is not a legal clearance.** Nobody has reviewed the name or the mark for
trademark conflicts. That has to happen before a public launch.

## Name

"Hypercast": a client for casts on Hypersnap.

**Open item before launch.** The name is already in use for unrelated products,
including an iOS podcast app and older peer-to-peer video tools. No other
Farcaster or Hypersnap client was found using it. Whether that is acceptable is
a decision for the project owner, ideally with advice. The name is a build
setting (`VITE_APP_NAME`) and appears in few places, so changing it is cheap:
that setting, `index.html`, `public/manifest.json`, the wordmark and social
image, and the documentation.

## The mark

Two upright rounded posts with a dot between them: two ends and the signal
passing from one to the other. It reads as an abstract "H".

- The posts take the colour of the surrounding text; the dot is the accent.
- It was drawn from scratch as three primitive shapes. It was not traced from,
  recoloured from or otherwise derived from the Farcaster arch, and does not
  share its silhouette.
- It occupies the same slot, at the same size, as the upstream mark did.

The app icon is the mark in white with a violet dot on a near-black tile. A dark
tile was chosen over a violet one so that the icon is not a white glyph on a
purple square.

The wordmark is "Hypercast" in Inter Bold, converted to outlines so the file
does not depend on a font being installed.

### Files

All under `apps/farcaster-web/public/`. The SVG files are the editable
originals; the PNG and ICO files are renderings of them.

| File | Use |
| --- | --- |
| `brand/hypercast-icon.svg` | The mark alone |
| `brand/hypercast-logo.svg` | Mark and wordmark |
| `favicon.svg`, `favicon.ico` | Browser tab |
| `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` | Home screen and install icons |
| `og-image.png` | Link previews |
| `default-avatar.svg` | Shown when an account has no picture |

In the interface the mark is drawn by `src/hypercast/components/Logo.tsx`.

## What was kept from upstream

Layout, spacing, type sizes and weights, icons, light and dark themes, and the
colour palette, including the violet accent. These come with the MIT-licensed
code. Inter is the upstream interface font and is under the SIL Open Font
License.

Keeping the accent colour is a deliberate choice for visual continuity. It is
also the most recognisable thing Hypercast shares with the upstream client. If
more distance is wanted, the accent is one token (`brand` in
`tailwind.config.js`).

## Asset audit

| Upstream asset | Decision | Reason |
| --- | --- | --- |
| Farcaster logos and marks (`public/brand/`) | Removed | Upstream identity. |
| Favicons, app icons, social images | Replaced | Upstream identity. |
| Web manifest | Rewritten | Named the upstream app and registered handlers for its site. |
| SeasonMix font files | Removed | Commercial typeface; redistribution terms not confirmed; not used by any Hypercast screen. |
| Inter | Kept, loaded from Google Fonts | Open licence. |
| Channel images, artwork, third-party logos (`public/~/`) | Removed | Not Hypercast's to redistribute, and unused. |
| Default avatar | Replaced | The upstream one is loaded from the upstream site. |
| Interface icons (Octicons, Lucide, and the inline reply, recast, like and share glyphs in the upstream components) | Kept | Part of the MIT-licensed code or of MIT/ISC icon sets. |
| Site-verification tag, sitemaps, app-association files | Removed | Belong to the upstream site. |

## How the name "Farcaster" is used

Only descriptively: for the protocol, and for the upstream code Hypercast is
built from. The About screen and the README carry this statement:

> Hypercast is an independent social client powered by Hypersnap. It is built
> using open-source Farcaster client code and is not affiliated with or endorsed
> by the operators of the official Farcaster client.

Hypercast does not use the Farcaster name or mark as its own, in its title, its
icons or its domain. Channel links that happen to contain an upstream hostname
are data from the network and are shown as data.

## Before launch

- [ ] Have the name checked, and decide whether its existing uses matter.
- [ ] Have the mark and the retained accent colour reviewed alongside the
      upstream identity.
- [ ] Choose a domain that does not contain "farcaster" or "warpcast".
- [ ] Decide whether to keep loading Inter from Google Fonts.
