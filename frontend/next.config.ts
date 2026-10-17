import type { NextConfig } from "next";

// Section 2.6.1: the browser calls /api/* on its own origin and Next.js
// forwards it to FastAPI, so there is no CORS. API_BASE_URL is the backend's
// address as the Next.js server sees it (http://api:8000 in Docker Compose).
const apiBaseUrl = process.env.API_BASE_URL;

const nextConfig: NextConfig = {
  // A self-contained server for the Docker image (frontend/Dockerfile).
  output: "standalone",
  // Next.js allows one `next dev` per output folder; a second local server (for example against an API on
  // another port) sets NEXT_DIST_DIR to a folder of its own, such as .next-local.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // No Next.js badge in the corner of the page during development.
  devIndicators: false,
  async rewrites() {
    return apiBaseUrl ? [{ source: "/api/:path*", destination: `${apiBaseUrl}/api/:path*` }] : [];
  },
  turbopack: {
    rules: {
      // Tailwind's custom loader is only for the global stylesheet. Let
      // Turbopack handle *.module.css natively so CSS Module class exports
      // remain available to components.
      "globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
