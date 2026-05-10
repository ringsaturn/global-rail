import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react()],
  server: {
    proxy: {
      "/pmtiles/global_rail.pmtiles": {
        target: "https://dataset.ringsaturn.me",
        changeOrigin: true,
      },
    },
  },
});
