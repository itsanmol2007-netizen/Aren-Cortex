import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

createServer((request, response) => {
  const urlPath = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const requested = normalize(join(root, urlPath === "/" ? "index.html" : urlPath));

  if (!requested.startsWith(root) || !existsSync(requested)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, { "Content-Type": types[extname(requested)] || "application/octet-stream" });
  createReadStream(requested).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`AREN Cortex prototype running at http://127.0.0.1:${port}`);
});
