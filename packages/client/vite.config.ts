import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/meta":   "http://localhost:3001",
      "/state":  "http://localhost:3001",
      "/orders": "http://localhost:3001",
      "/tasks":  "http://localhost:3001",
    },
  },
});
