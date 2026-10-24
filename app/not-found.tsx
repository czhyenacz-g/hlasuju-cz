import Link from "next/link";
import VotingBackdrop from "../components/VotingBackdrop.tsx";

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10 text-center">
      <VotingBackdrop />
      <div className="w-full max-w-sm rounded-3xl border border-gray-200 bg-white p-8 shadow-soft">
        <p className="text-5xl font-bold tracking-tight text-brand-soft">404</p>
        <h1 className="mt-3 text-2xl font-bold text-gray-900">Stránka nenalezena</h1>
        <p className="mt-3 text-gray-600">
          Hlasování s tímto kódem neexistuje nebo už vypršelo. Zkontrolujte kód, nebo požádejte moderátora o nový odkaz.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex min-h-[52px] items-center justify-center rounded-2xl bg-brand px-6 font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30"
        >
          Zadat kód hlasování
        </Link>
      </div>
    </main>
  );
}
