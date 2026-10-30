import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig(({ command }) => {
  const nitroPreset =
    process.env["NETLIFY"] || process.env["NITRO_PRESET"] === "netlify" ? "netlify" : undefined;
  // studio files open on the studio's own address: /file/… is passed straight through to storage's
  // signed link (token and all), so a large proposal never runs through the app's server
  const storage = (process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "").replace(
    /\/$/,
    "",
  );
  const routeRules = storage
    ? Object.fromEntries(
        ["project-files", "documents"].map((bucket) => [
          `/file/${bucket}/**`,
          { proxy: `${storage}/storage/v1/object/sign/${bucket}/**` },
        ]),
      )
    : {};

  return {
    server: {
      host: "::",
      port: 8080,
    },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        importProtection: {
          behavior: "error",
          client: {
            files: ["**/server/**"],
            specifiers: ["server-only"],
          },
        },
        server: { entry: "server" },
      }),
      ...(command === "build"
        ? [nitro({ ...(nitroPreset ? { preset: nitroPreset } : {}), routeRules })]
        : []),
      viteReact(),
    ],
  };
});
