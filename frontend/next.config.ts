import type { NextConfig } from "next";

// Section 2.6.1: the browser calls /api/* on its own origin and Next.js
// forwards it to FastAPI, so there is no CORS. API_BASE_URL is the backend's
// address as the Next.js server sees it (http://api:8000 in Docker Compose).
const apiBaseUrl = process.env.API_BASE_URL;

const nextConfig: NextConfig = {
  async rewrites() {
    return apiBaseUrl ? [{ source: "/api/:path*", destination: `${apiBaseUrl}/api/:path*` }] : [];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
