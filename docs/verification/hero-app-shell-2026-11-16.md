# Hero app presentation and intent palettes — November 16, 2026

The user requested a more immersive standalone-app feel: remove header identity and the generic eyebrow, move the private-review notice, lower the form with understated glass styling, and transition the whole presentation with the selected transaction type.

## Changes

- Header icon, Property search label and NYC chip are removed. A compact floating navigation pill retains Explore, Your search and Help & rights on the landing page. Results, detail and supporting pages use New search for the first link, returning to the hero without relying on a removed logo. Existing detail Back to results remains separate. Brokerage identity/source disclosures remain in their required presentation areas.
- The exact approved heading and introduction remain. The extra uppercase eyebrow is removed. Duplicate secondary landing links are removed; borough shortcuts and browser-local recent searches are grouped under Places & recent searches.
- The form sits near the lower viewport edge on roomy screens. Photo attribution occupies an independent adjacent panel. Narrow layouts stack the source panel and form; very short/narrow and landscape layouts prioritize the form before attribution. The page can scroll normally when its content exceeds the available height. The search form is not fixed over page content or the mobile keyboard.
- The glass surface uses restrained translucency and localized backdrop blur; inputs remain opaque. Unsupported blur falls back to a nearly opaque surface. Reduced-transparency/high-contrast preferences use solid surfaces. Focus states, visible field labels, and semantic navigation/links remain present.
- A single shared mapping relates the six RESO property types to buy blue, rental teal, investment purple, commercial-sale slate, commercial-lease plum and land olive. The registered CSS accent property interpolates over 440 ms and drives scene/overlay tints, controls and wash surfaces. Source photographs are not recolored. Results and listing details receive the corresponding type context. Existing administrator signature-color settings remain supported; the default adaptive mode follows intent.
- Reduced-motion disables palette and photo transitions. Browsers without registered-property support still change to the selected palette directly.
- Private review remains private: the exact existing warning is now in a collapsed Preview status disclosure below the hero, without a top banner. Access, noindex, public-release/display-review gates and source eligibility are unchanged. Moving this notice does not approve public display.

## Validation

The initial browser check caught the existing brand editor assuming that a removed header element existed, aborting app startup. Its optional tagline update now tolerates a brandless header.

- 83 suites / 633 tests passed, including distinct/readable palettes, signature-color behavior, server-rendered initial buy context, correct navigation, private-warning placement and retained noindex/release gating.
- Root typecheck, both search Worker typechecks, root build and search production build passed.
- Headless Chrome tested all six transaction choices at 320×740, 390×844, 768×1024, 1366×768, 2560×1440 and 844×390. Header identity/eyebrow removal, visible navigation, desktop lower-form position, usable form widths, shortcut expansion and no horizontal overflow/page exceptions passed.
- An intermediate-color check verified that the accent actually interpolates rather than snapping. Reduced-transparency emulation verified that blur is removed. Results and detail pages received the selected palette.
- All six accent colors exceed 4.5:1 contrast against white and the configured default light background. Contrast values against white range from approximately 5.97:1 to 7.66:1.
- Desktop and mobile screenshots were visually reviewed using fictional local records with previously downloaded photos. No fixture photographs were uploaded as new deployment assets. Browser emulation is not a physical-device/foldable or observed-human study, and no accessibility certification is claimed.

Implementation references: [registered CSS properties](https://developer.mozilla.org/en-US/docs/Web/CSS/@property), [reduced transparency preferences](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency). Reduced transparency has limited browser coverage; opaque inputs and the near-opaque fallback do not depend on that media feature.

No new service, database migration, image transformation, source request path, permission change or Workspace application deployment is included. Private preview and the gated production package are the deployment targets. Deployment identifiers and access checks are recorded after publication.
