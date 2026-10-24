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
        // Jemná pastelová paleta. `brand` je o odstín tmavší než
        // levandulová #8277C7 (ta má s bílým textem kontrast jen 3,9:1),
        // aby tlačítka a odkazy splnily WCAG AA. #8277C7 = `brand.soft`
        // jen na dekorace a jemné akcenty.
        brand: {
          DEFAULT: "#6558B4",
          dark: "#4E4396",
          soft: "#8277C7",
          light: "#EDE9FA",
        },
        pastel: {
          blue: "#E3F0FA",
          green: "#E4F2E8",
        },
        cream: "#FAF9F6",
        // Šedá škála přeladěná do inkoustových tónů — celý web ji používá
        // (text-gray-900 = inkoustová #293244), takže stačí změnit tady.
        gray: {
          50: "#FAF9F6",
          100: "#F3F1EC",
          200: "#E7E4EE",
          300: "#D4D0DF",
          400: "#9A9CAB",
          500: "#6B7183",
          600: "#555C6E",
          700: "#3F4657",
          800: "#333B4D",
          900: "#293244",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(41, 50, 68, 0.04), 0 12px 32px -18px rgba(76, 64, 150, 0.28)",
      },
    },
  },
  plugins: [],
} satisfies Config;
