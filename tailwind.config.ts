import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0A0E14",
        panel: "#12161F",
        panel2: "#171C28",
        border: "#232937",
        text: "#E7EAF0",
        subtext: "#8A93A6",
        bull: "#3ECF8E",
        brand: "#3ECF8E",
        bear: "#F2495C",
        warn: "#E8B341",
        info: "#4C8DFF",
        accent: "#3ECF8E",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
