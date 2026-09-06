import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    proxy: {
      // The Express process in `server/` (npm run server). Sending a WhatsApp
      // message and emailing AREN both need credentials that must never reach
      // this bundle, so the browser calls same-origin `/api/...` and Vite
      // forwards it. Outside dev, set VITE_AREN_API_URL to wherever `server/`
      // is actually hosted — see src/lib/db/messaging.ts.
      "/api": "http://localhost:4000",
    },
  },
})