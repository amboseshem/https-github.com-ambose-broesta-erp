import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: { enabled: true },
      manifest: {
        name: "Broesta ERP",
        short_name: "Broesta ERP",
        start_url: "/",
        display: "standalone",
        background_color: "#1e1e2f",
        theme_color: "#1e1e2f",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" }
        ]
      },
      workbox: {
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === "http://localhost:8080",
            handler: "NetworkFirst",
            options: { cacheName: "api-cache" }
          }
        ]
      }
    })
  ]
});