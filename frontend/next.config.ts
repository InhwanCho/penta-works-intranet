import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [
      { source: "/write/meetings/:path*", destination: "/meetings", permanent: false },
      { source: "/edit/meetings/:path*", destination: "/meetings", permanent: false },
      ...["hospitals", "repairs", "work-logs", "schedules"].flatMap(section =>
      ["", "write/", "edit/"].map(prefix => ({ source: `/${prefix}${section}/:path*`, destination: "/", permanent: false }))
    )];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
    ];
  },
};

export default nextConfig;
