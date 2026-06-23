import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        shade: {
          bg: "#080808",
          surface: "rgba(255,255,255,0.04)",
          border: "rgba(255,255,255,0.08)",
          accent: "#F59E0B",
          "accent-dim": "rgba(245,158,11,0.15)",
          "text-primary": "#FAFAFA",
          "text-secondary": "rgba(255,255,255,0.5)",
          "text-muted": "rgba(255,255,255,0.3)",
          red: "#EF4444",
          green: "#22C55E",
        },
      },
      fontFamily: {
        sans: ["Space Grotesk", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        "4xl": "2rem",
      },
      backdropBlur: {
        xs: "2px",
      },
      boxShadow: {
        glass: "0 0 0 1px rgba(255,255,255,0.08), 0 4px 24px rgba(0,0,0,0.4)",
        accent: "0 0 20px rgba(245,158,11,0.3)",
        "accent-sm": "0 0 8px rgba(245,158,11,0.2)",
      },
      animation: {
        shimmer: "shimmer 2s linear infinite",
        "pulse-slow": "pulse 3s ease-in-out infinite",
        grain: "grain 8s steps(10) infinite",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        grain: {
          "0%, 100%": { transform: "translate(0, 0)" },
          "10%": { transform: "translate(-2%, -3%)" },
          "20%": { transform: "translate(3%, 2%)" },
          "30%": { transform: "translate(-1%, 4%)" },
          "40%": { transform: "translate(4%, -1%)" },
          "50%": { transform: "translate(-3%, 3%)" },
          "60%": { transform: "translate(2%, -4%)" },
          "70%": { transform: "translate(-4%, 2%)" },
          "80%": { transform: "translate(3%, -2%)" },
          "90%": { transform: "translate(-2%, 3%)" },
        },
      },
      spacing: {
        safe: "env(safe-area-inset-bottom)",
      },
    },
  },
  plugins: [],
};

export default config;
