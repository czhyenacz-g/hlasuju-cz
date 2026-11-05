import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION } from "./config/site.ts";

/**
 * Instalace webu jako aplikace (PWA). Záměrně BEZ service workeru: nic
 * se necachuje, živá data (otázky, hlasy, výsledky) jdou vždy ze
 * serveru a bez internetu hlasování nefunguje (žádné offline odesílání).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Hlasuju.cz",
    short_name: "Hlasuju.cz",
    description: SITE_DESCRIPTION,
    lang: "cs",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FAF9F6",
    theme_color: "#FAF9F6",
    icons: [
      { src: "/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
