import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return ["hospitals", "repairs", "workshop-repairs", "work-logs"].flatMap(section =>
      ["", "write/", "edit/"].map(prefix => ({ source: `/${prefix}${section}/:path*`, destination: "/", permanent: false }))
    );
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
