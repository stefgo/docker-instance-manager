import http from "http";
import fs from "fs";
import path from "path";

/**
 * The smallest static server that can host either of the two surfaces we screenshot.
 *
 * It exists because the capture run must not need a backend: the SPA's data comes from
 * Playwright's route interception, so all that is left is delivering the built bundle.
 *
 * `spaFallback` is the one thing that is not optional. The dashboard uses BrowserRouter,
 * so `/clients` is a client-side route with no file behind it -- a plain file server
 * answers 404 there and the screenshot would be of an error page. The agent's pages are
 * the opposite case: `/status` and `/register` really are files, and a fallback would
 * mask a typo instead of failing loudly.
 */
const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".json": "application/json; charset=utf-8",
    ".woff2": "font/woff2",
};

export function serve({ root, port, spaFallback = false }) {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, "http://localhost");
        let rel = decodeURIComponent(url.pathname);

        // The agent serves /status and /register as status.html and register.html.
        if (!spaFallback && !path.extname(rel) && rel !== "/") {
            rel = `${rel}.html`;
        }
        if (rel === "/") rel = "/index.html";

        // Contain the path inside root: this server is short-lived and local, but a
        // traversal here would read the whole repository.
        let file = path.join(root, rel);
        if (!file.startsWith(root)) {
            res.writeHead(403).end("Forbidden");
            return;
        }

        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            if (!spaFallback) {
                res.writeHead(404).end("Not found");
                return;
            }
            file = path.join(root, "index.html");
        }

        res.writeHead(200, {
            "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream",
        });
        fs.createReadStream(file).pipe(res);
    });

    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () =>
            resolve({
                origin: `http://127.0.0.1:${port}`,
                close: () => new Promise((r) => server.close(r)),
            }),
        );
    });
}
