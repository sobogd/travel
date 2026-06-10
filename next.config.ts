import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // playwright is a heavy native module loaded only at runtime in the Volotea
  // route — keep it external so Next/Turbopack doesn't try to bundle it.
  serverExternalPackages: ["playwright"],
};

export default nextConfig;
