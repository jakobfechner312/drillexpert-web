// tailwind.config.ts
import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        drill: {
          50: "#E8F8FD",
          100: "#CFF1FB",
          200: "#9FE2F6",
          300: "#6FD4F2",
          400: "#3FC6EE",
          500: "#00A6D6",
          600: "#0089B1",
          700: "#006C8C",
          800: "#004F67",
          900: "#003242",
        },
        base: {
          bg: "#F6F8FB",
          card: "#FFFFFF",
          ink: "#0B1220",
          muted: "#6B7280",
          border: "#E5E7EB",
        },
      },
      boxShadow: {
        soft: "0 10px 30px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;