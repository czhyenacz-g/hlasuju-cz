"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

// Jen normalizuje/ověří tvar kódu a přesměruje na /[kód] — samotné
// ověření, jestli hlasování existuje, dělá až stránka /[publicCode]
// (jeden zdroj pravdy, žádná duplicitní kontrola tady).
export default function HomeJoinForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError("Kód hlasování má 6 číslic.");
      return;
    }
    router.push(`/${trimmed}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={code}
        onChange={(event) => {
          setCode(event.target.value);
          setError(null);
        }}
        placeholder="Zadejte kód hlasování"
        aria-label="Kód hlasování"
        className="w-full rounded-2xl border-2 border-gray-200 px-6 py-5 text-center text-3xl font-semibold tracking-widest text-gray-900 placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-gray-400 focus:border-brand focus:outline-none"
      />
      {error && <p className="text-center text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        className="min-h-[56px] w-full rounded-2xl bg-brand px-6 py-4 text-lg font-semibold text-white transition hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30"
      >
        Připojit se
      </button>
    </form>
  );
}
