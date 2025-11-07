import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f6f7fb",
          100: "#e7eaf5",
          200: "#cfd5eb",
          300: "#a9b4d9",
          400: "#7e8fc4",
          500: "#5f72b3",
          600: "#4a599a",
          700: "#3c477b",
          800: "#333b62",
          900: "#2d3451"
        },
        accent: {
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b"
        }
      }
    }
  },
  plugins: []
};

export default config;
