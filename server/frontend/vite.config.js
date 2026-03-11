import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";
import path from "path";

// --- Ignore EPIPE globally (safe for dev) ---
process.on("uncaughtException", (err) => {
  if (err.code === "EPIPE") return;
  console.error(err);
});

// --- Version helper ---
const getVersion = () => {
  if (process.env.VITE_APP_VERSION) {
    return process.env.VITE_APP_VERSION;
  }
  try {
    try {
      return execSync("git describe --tags --exact-match --dirty", {
        stdio: "pipe",
      })
        .toString()
        .trim();
    } catch {
      const branch = execSync("git rev-parse --abbrev-ref HEAD")
        .toString()
        .trim();
      const hash = execSync("git rev-parse --short HEAD").toString().trim();
      const dirty = execSync("git status --porcelain").toString().trim()
        ? "-dirty"
        : "";
      return `${branch}-${hash}${dirty}`;
    }
  } catch {
    return "unknown";
  }
};

const APP_VERSION = getVersion();

export default defineConfig(() => ({
  plugins: [react()],

  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },

  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        ws: false, // kein WebSocket nötig
      },
      "/ws": {
        target: "ws://localhost:3000",
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          proxy.on("error", (err) => {
            if (err.code === "EPIPE") return;
            console.log("proxy ws error", err);
          });
        },
      },
    },
  },

  resolve: {
    alias: {
      ...(process.env.VITE_USE_LOCAL_UI !== "false"
        ? {
            "@stefgo/react-ui-components": path.resolve(
              process.env.VITE_UI_COMPONENTS_PATH ||
                "../../../react-ui-components",
              "src/index.ts",
            ),
          }
        : {}),
    },
    dedupe: ["react", "react-dom", "lucide-react"],
  },

  build: {
    outDir: "../dist/public",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-icons": ["lucide-react"],
          "vendor-utils": ["date-fns", "zustand"],
        },
      },
    },
  },
}));
