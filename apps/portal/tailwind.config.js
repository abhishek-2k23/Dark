/** @type {import('tailwindcss').Config} */

// Semantic colors are backed by CSS variables (defined in global.css) so a
// single class such as `bg-background` resolves correctly in light AND dark.
// The `<alpha-value>` placeholder lets opacity utilities keep working.
const withVar = (name) => `rgb(var(${name}) / <alpha-value>)`;

module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: withVar("--color-background"),
        surface: {
          DEFAULT: withVar("--color-surface"),
          muted: withVar("--color-surface-muted"),
          elevated: withVar("--color-surface-elevated"),
        },
        border: {
          DEFAULT: withVar("--color-border"),
          strong: withVar("--color-border-strong"),
        },
        content: {
          DEFAULT: withVar("--color-content"),
          secondary: withVar("--color-content-secondary"),
          tertiary: withVar("--color-content-tertiary"),
          inverse: withVar("--color-content-inverse"),
        },
        primary: {
          DEFAULT: withVar("--color-primary"),
          strong: withVar("--color-primary-strong"),
          soft: withVar("--color-primary-soft"),
          on: withVar("--color-on-primary"),
        },
        success: {
          DEFAULT: withVar("--color-success"),
          soft: withVar("--color-success-soft"),
          on: withVar("--color-on-success"),
        },
        accent: {
          DEFAULT: withVar("--color-accent"),
          strong: withVar("--color-accent-strong"),
        },
        warning: {
          DEFAULT: withVar("--color-warning"),
          soft: withVar("--color-warning-soft"),
        },
        danger: {
          DEFAULT: withVar("--color-danger"),
          soft: withVar("--color-danger-soft"),
        },
        info: withVar("--color-info"),
        peach: withVar("--color-peach-soft"),
      },
      fontFamily: {
        // Body / UI text — Nunito (rounded, friendly, high legibility)
        sans: ["Nunito_400Regular"],
        body: ["Nunito_400Regular"],
        "body-medium": ["Nunito_500Medium"],
        "body-semibold": ["Nunito_600SemiBold"],
        "body-bold": ["Nunito_700Bold"],
        // Headings / display / buttons — Poppins (geometric, confident)
        heading: ["Poppins_600SemiBold"],
        "heading-medium": ["Poppins_500Medium"],
        "heading-bold": ["Poppins_700Bold"],
        display: ["Poppins_700Bold"],
      },
      borderRadius: {
        sm: "5px",
        md: "8px",
        lg: "10px",
        xl: "12px",
        "2xl": "14px",
        "3xl": "16px",
      },
    },
  },
  plugins: [],
};
