# Portl — Mobile App (`apps/portal`)

Expo (SDK 56) + expo-router app. This document covers the **common UI foundation**:
theming, fonts, localization, and the shared component library that screens are
built from.

## Stack

- **NativeWind v4** (Tailwind CSS for RN) — utility classes, semantic color tokens.
- **Theme** — auto / light / dark, backed by CSS variables + a JS mirror.
- **Fonts** — Poppins (headings/buttons) + Nunito (body/UI), via `@expo-google-fonts`.
- **i18n** — `i18next` / `react-i18next` with English + Hindi (`en`, `hi`).

Run it: `pnpm --filter portal start` (or `android` / `ios` / `web`).

## Theming

Semantic tokens live in [`global.css`](./global.css) as CSS variables and are
exposed to Tailwind in [`tailwind.config.js`](./tailwind.config.js). Use classes
— they flip with light/dark automatically:

```tsx
<View className="bg-surface border border-border">
  <Text className="text-content">…</Text>       {/* primary text */}
  <Text className="text-content-secondary">…</Text>
</View>
```

Token families: `background`, `surface[/muted/elevated]`, `border[/strong]`,
`content[/secondary/tertiary/inverse]`, `primary[/strong/soft/on]`,
`success[/soft/on]`, `accent[/strong]`, `warning[/soft]`, `danger[/soft]`,
`info`, `peach`.

When you need a **raw color** (icon `color`, gradient, status bar) read it from
the theme so it tracks the scheme:

```tsx
const { colors, scheme, mode, setMode, cycleMode } = useTheme();
```

`mode` is the stored preference (`system | light | dark`, persisted);
`scheme` is the resolved value. Drop in a `<ThemeSwitcher />` for the picker.

## Fonts

Loaded in [`src/app/_layout.tsx`](./src/app/_layout.tsx); the splash stays up
until they resolve. Don't hardcode font families — go through the `<Text>`
`variant` prop or the `font-*` Tailwind utilities (`font-heading`, `font-body`,
`font-body-bold`, `font-display`, …).

## i18n

Strings live in [`src/i18n/locales/`](./src/i18n/locales). Use them via
`react-i18next`:

```tsx
const { t } = useTranslation();
<Text>{t("auth.welcomeBack")}</Text>
```

Language is device-detected, user-overridable (`<LanguageSwitcher />`), and
persisted. Add a language by dropping a new locale JSON and extending
`SUPPORTED_LANGUAGES` in `src/i18n/index.ts`.

## Component library — `@/components/ui`

| Component          | Notes                                                          |
| ------------------ | -------------------------------------------------------------- |
| `Text`             | `variant` type scale + semantic `color`; caps font scaling.    |
| `Button`           | `primary/success/secondary/outline/danger/dangerSoft/ghost`; `sm/md/lg`; icons; `loading`; `fullWidth`. |
| `Card`             | `elevated/outlined/filled/tonal`; optional `onPress`.          |
| `Input`            | Label, icon, focus + error states.                             |
| `Badge`            | Status pills — `neutral/primary/success/warning/danger/mint`.  |
| `Icon` / `IconCircle` | Ionicons wrapper + tinted circular chip.                    |
| `Avatar`           | Image with initials fallback.                                  |
| `Link`             | Inline tappable text.                                          |
| `Divider`          | Themed hairline.                                               |
| `Screen`           | Safe-area wrapper; `scroll` / `padded`.                        |
| `SegmentedControl` | Equal-width tabs (Today/Week/Month).                           |

```tsx
import { Screen, Card, Button, Text } from "@/components/ui";
```

### Responsiveness & accessibility

- Layouts use flex + `flex-wrap`; avoid fixed widths/heights so content reflows.
- `<Text>` caps OS font scaling at `MAX_FONT_SCALE` (1.4) so large accessibility
  sizes wrap instead of clipping or breaking rows. Prefer vertical padding over
  fixed heights on tappable rows.
- `src/app/index.tsx` is a **living showcase** of every component with the theme
  and language switchers — a good reference and manual test surface.
