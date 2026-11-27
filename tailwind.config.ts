import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#121212",
        surface: "#1E1E1E",
        surface2: "#262626",
        gold: "#F5B800",
        golddark: "#C98F00",
        muted: "#9CA3AF",
      },
      fontFamily: { sans: ["system-ui", "Segoe UI", "Noto Sans Bengali", "sans-serif"] },
      boxShadow: { gold: "0 4px 24px rgba(245,184,0,.35)" },
      keyframes: {
        marquee: { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
        shine: { "0%": { backgroundPosition: "-200% 50%" }, "100%": { backgroundPosition: "200% 50%" } },
        floatPulse: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-8px)" } },
      },
      animation: {
        marquee: "marquee 28s linear infinite",
        shine: "shine 3.5s linear infinite",
        floatPulse: "floatPulse 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
