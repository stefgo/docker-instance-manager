const path = require("path");

// The installed library's bundle. The preset lists the same glob, but a `content`
// set here replaces the preset's instead of extending it, so it has to be repeated.
const uiLibDist = path.join(
    path.dirname(require.resolve("@stefgo/react-ui-components/tailwind-preset")),
    "dist/**/*.{js,mjs}",
);

// Working against the library source instead of the installed package. Must be
// set together with VITE_USE_LOCAL_UI, or Tailwind scans one copy of the library
// while Vite bundles another and classes go missing from the output.
const localUiContent =
    process.env.VITE_USE_LOCAL_UI === "true"
        ? [
                `${process.env.VITE_UI_COMPONENTS_PATH || "../../../react-ui-components"}/src/**/*.{ts,tsx}`,
            ]
        : [];

/** @type {import('tailwindcss').Config} */
export default {
    darkMode: "class",
    presets: [require("@stefgo/react-ui-components/tailwind-preset")],
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}", uiLibDist, ...localUiContent],
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
