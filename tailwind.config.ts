import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Jedna přátelská akcentní barva (indigo) — světlý, čistý,
        // "moderní SaaS" vzhled, viz zadání. Žádná vlastní paleta
        // navíc, drží se Tailwindí výchozí škály.
        brand: {
          DEFAULT: "#4f46e5",
          dark: "#4338ca",
          light: "#eef2ff",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
