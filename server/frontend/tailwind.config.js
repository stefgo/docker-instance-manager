const path = require("path");

const uiLibDist = path.join(
  path.dirname(require.resolve("@stefgo/react-ui-components/tailwind-preset")),
  "dist/**/*.{js,mjs}",
);

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  presets: [require("@stefgo/react-ui-components/tailwind-preset")],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}", uiLibDist, "../../../react-ui-components/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: {
          "text-footer": "#444444",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "glow-online": "0 0 12px rgba(34, 197, 94, 0.4)",
      },
    },
  },
  plugins: [],
};
