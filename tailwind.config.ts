import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f6f7f9",
          100: "#eceef2",
          200: "#d5dae3",
          500: "#5b6472",
          700: "#334155",
          900: "#0f172a",
        },
        duty: {
          a: "#7dd3fc",
          c: "#c4b5fd",
          s: "#fde047",
        },
      },
    },
  },
  plugins: [],
};

export default config;
