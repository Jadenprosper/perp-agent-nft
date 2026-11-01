/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0a0908",
          900: "#12100e",
          850: "#1b1a14",
          800: "#221f18",
          700: "#2e2a22",
          600: "#3d372c",
          500: "#524a3c",
        },
        brown: {
          950: "#1a120c",
          800: "#3d2a1a",
          700: "#5c3d24",
          600: "#7a5230",
          500: "#a67c52",
          400: "#c4a574",
          300: "#d4b896",
          200: "#e8d4b8",
          100: "#f5ead8",
        },
        cream: {
          DEFAULT: "#fffeef",
          dim: "#e8e0cc",
          mute: "#b8aea0",
        },
        rust: {
          DEFAULT: "#b85c38",
          soft: "#c97b5a",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
        display: ["var(--font-display)", "IBM Plex Serif", "Georgia", "serif"],
      },
      boxShadow: {
        glow: "0 0 40px rgba(196, 165, 116, 0.18)",
        panel: "0 1px 0 rgba(255,254,239,0.04) inset, 0 12px 40px rgba(0,0,0,0.35)",
      },
      backgroundImage: {
        grid: "radial-gradient(rgba(196,165,116,0.07) 1px, transparent 1px)",
        haze:
          "radial-gradient(1000px 500px at 8% -8%, rgba(166,124,82,0.14), transparent 55%), radial-gradient(800px 420px at 92% 0%, rgba(92,61,36,0.18), transparent 50%), radial-gradient(700px 380px at 50% 110%, rgba(184,92,56,0.08), transparent 55%)",
        ascii:
          "repeating-linear-gradient(0deg, transparent, transparent 14px, rgba(196,165,116,0.03) 14px, rgba(196,165,116,0.03) 15px), repeating-linear-gradient(90deg, transparent, transparent 14px, rgba(196,165,116,0.03) 14px, rgba(196,165,116,0.03) 15px)",
      },
      letterSpacing: {
        micro: "0.16em",
      },
    },
  },
  plugins: [],
};
