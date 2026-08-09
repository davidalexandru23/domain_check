import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/client/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: "#1d2125",
        panel2: "#22272b",
        ink: "#b6c2cf",
        muted: "#738496",
        line: "#2c333a",
        cyanx: "#579dff",
        greenx: "#22a06b",
        amberx: "#e2b203",
        redx: "#f15b50"
      }
    }
  },
  plugins: []
} satisfies Config;
