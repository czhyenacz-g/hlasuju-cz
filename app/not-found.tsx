import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10 text-center">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900">Stránka nenalezena</h1>
        <p className="mt-3 text-gray-600">
          Hlasování s tímto kódem neexistuje nebo už vypršelo. Zkontrolujte kód, nebo požádejte moderátora o nový odkaz.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex min-h-[52px] items-center justify-center rounded-2xl bg-brand px-6 font-semibold text-white hover:bg-brand-dark"
        >
          Zadat kód hlasování
        </Link>
      </div>
    </main>
  );
}
