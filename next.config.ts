import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // مُثبَّت خلف مسار فرعي (demo.horizonerp.cloud/alaa/) عبر nginx — لا دومين مستقل
  basePath: "/alaa",
};

export default nextConfig;
