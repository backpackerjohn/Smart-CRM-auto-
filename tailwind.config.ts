import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0b0d10",
          1: "#12151a",
          2: "#1a1e25",
          3: "#232831",
        },
        accent: {
          DEFAULT: "#4f8cff",
          muted: "#2f4f8a",
        },
        warn: "#d9a441",
        danger: "#e06060",
        ok: "#4caf76",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
