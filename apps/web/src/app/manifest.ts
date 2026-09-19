import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ToqueTin",
    short_name: "ToqueTin",
    description: "Seguimiento de pedidos en tiempo real",
    start_url: "/",
    display: "standalone",
    background_color: "#f3efe7",
    theme_color: "#d85f3b",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
