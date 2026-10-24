import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Ochrana proti clickjackingu: do cizího iframe nejde vložit nic
        // kromě widgetu veřejné ankety (/embed/...), hlavně ne
        // moderátorská konzole.
        source: "/((?!embed/).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
      {
        // Widget smí vložit kterýkoli web — obsahuje jen veřejnou anketu,
        // žádné moderátorské ovládání ani token.
        source: "/embed/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
