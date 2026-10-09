import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mysql2 and nodemailer use Node built-ins; keep them out of the server bundle.
  serverExternalPackages: ["mysql2", "nodemailer"],
};

export default nextConfig;
