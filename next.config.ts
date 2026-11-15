import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "10.16.38.124",
  ],
  async redirects() {
    return [
      {
        source: "/dashboard/:workspaceId/organizations/:organizationId/distribution",
        destination: "/dashboard/:workspaceId/organizations/:organizationId/advance-booking",
        permanent: true,
      },
      {
        source: "/dashboard/:workspaceId/organizations/:organizationId/distribution/:path*",
        destination: "/dashboard/:workspaceId/organizations/:organizationId/advance-booking/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/dashboard/:workspaceId/organizations/:organizationId/advance-booking",
          destination: "/dashboard/:workspaceId/organizations/:organizationId/distribution",
        },
        {
          source: "/dashboard/:workspaceId/organizations/:organizationId/advance-booking/:path*",
          destination: "/dashboard/:workspaceId/organizations/:organizationId/distribution/:path*",
        },
      ],
    };
  },
};

export default nextConfig;
