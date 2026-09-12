import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR || ".next",
  typescript: { tsconfigPath: process.env.NEXT_TSCONFIG_PATH || "tsconfig.json" },
  // Dev assets may be requested through loopback aliases or Replit preview.
  // Server Actions keep their stricter Origin/Host CSRF check; opaque
  // Origin:null clients must use a standards-compliant browser test instead.
  allowedDevOrigins: ["localhost", "127.0.0.1", "*.replit.dev"],
  async headers() {
    const security = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      ...(process.env.NODE_ENV === "production"
        ? [{ key: "X-Frame-Options", value: "DENY" }]
        : []),
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
    ];
    return [
      { source: "/:path*", headers: security },
      { source: "/host/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      { source: "/invite/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
};

export default nextConfig;
