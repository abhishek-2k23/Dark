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

## Data, auth & navigation

- **API URL** — `app.config.ts` reads `EXPO_PUBLIC_API_URL` (defaults to
  `http://localhost:8000`; Android emulator rewrites `localhost`→`10.0.2.2` in
  `src/lib/env.ts`). Real staging/prod URLs are wired later. On a physical
  device set `EXPO_PUBLIC_API_URL` to your machine's LAN IP.
- **tRPC** — `src/lib/trpc.ts` exposes `trpc` (react-query hooks) and `api`
  (vanilla client). `auth.*` calls are **not batched** (the server rate-limiter
  matches exact paths); a 401 transparently refreshes the token once and
  retries. Provider is `TRPCProvider` at the app root.
- **Auth** — `useAuthStore` (Zustand) owns the session: the refresh token is
  persisted in `expo-secure-store`, the access token stays in memory, and
  `hydrate()` restores the session on launch. Login supports **email or phone +
  password**; an **unverified email** returns `OTP_REQUIRED` and routes to the
  OTP screen (`auth.verifyEmailOtp`). "Continue with Google" is wired but no-ops
  until `EXPO_PUBLIC_GOOGLE_CLIENT_ID` (and the server's `GOOGLE_CLIENT_ID`) are
  set.
- **Routing** — role-aware groups under `src/app/`: `(auth)` (login + OTP),
  `(resident)`/`(guard)`/`(admin)` (guarded by `RoleStack`), and `(dev)` (the
  component showcase). `app/index.tsx` is the launch gate.
- **Dev seed logins** (all password `password123`): `+919800000003` /
  `ravi@example.test` is a resident with an **unverified email** (exercises the
  OTP flow); log in by phone to skip it. `admin@greenmeadows.test`,
  `guard@greenmeadows.test` are verified. Needs the API + Postgres running
  (`docker compose up -d`, then `pnpm dev` at the repo root).

### Responsiveness & accessibility

- Layouts use flex + `flex-wrap`; avoid fixed widths/heights so content reflows.
- `<Text>` caps OS font scaling at `MAX_FONT_SCALE` (1.4) so large accessibility
  sizes wrap instead of clipping or breaking rows. Prefer vertical padding over
  fixed heights on tappable rows.
- `src/app/index.tsx` is a **living showcase** of every component with the theme
  and language switchers — a good reference and manual test surface.
