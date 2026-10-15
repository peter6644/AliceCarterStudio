import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Day Book — Alice Carter Studio",
    short_name: "Day Book",
    start_url: "/",
    display: "standalone",
    background_color: "#EAE3D4",
    theme_color: "#EAE3D4",
    icons: [{ src: "/logo.jpg", sizes: "320x320", type: "image/jpeg", purpose: "any" }],
  };
}
