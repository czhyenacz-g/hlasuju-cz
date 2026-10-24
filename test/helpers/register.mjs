// Next.js nemá v package.json "exports", takže čisté Node ESM neumí
// `import … from "next/server"` (bundler Next.js to umí). Pro testy
// stačí přesměrovat na skutečný soubor.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    return nextResolve(specifier, context);
  },
});
