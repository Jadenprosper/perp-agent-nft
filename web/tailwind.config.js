/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#05070b",
          900: "#0b0f14",
          800: "#121821",
          700: "#1a2330",
          600: "#243041",
        },
        neon: {
          mint: "#00d4aa",
          lime: "#b8ff3c",
          pink: "#ff4d9a",
          violet: "#8b5cff",
          amber: "#ffb020",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        glow: "0 0 40px rgba(0, 212, 170, 0.25)",
        pinkglow: "0 0 40px rgba(255, 77, 154, 0.2)",
      },
      backgroundImage: {
        grid: "radial-gradient(rgba(0,212,170,0.08) 1px, transparent 1px)",
        aurora:
          "radial-gradient(1200px 600px at 10% -10%, rgba(139,92,255,0.25), transparent 55%), radial-gradient(900px 500px at 90% 0%, rgba(0,212,170,0.18), transparent 50%), radial-gradient(700px 400px at 50% 100%, rgba(255,77,154,0.12), transparent 55%)",
      },
      backgroundSize: {
        grid: "24px 24px",
      },
    },
  },
  plugins: [],
};
