import type { Metadata } from "next";
import Link from "next/link";
import PollEditor from "./PollEditor.tsx";
import AlphegaAffiliateBanner from "../../components/AlphegaAffiliateBanner.tsx";
import VotingBackdrop from "../../components/VotingBackdrop.tsx";
import { isImageStorageConfigured } from "../../lib/images/storage.ts";
import Logo from "../../components/Logo.tsx";

export const metadata: Metadata = {
  title: "Vytvořit hlasování",
};

export default function CreatePollPage() {
  return (
    <main className="relative mx-auto min-h-screen max-w-3xl px-4 py-8 sm:py-12">
      <VotingBackdrop />
      <Link href="/" className="inline-flex rounded-lg hover:opacity-80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20">
        <Logo />
      </Link>
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">Vytvořit hlasování</h1>
      <p className="mt-2 text-gray-600">
        Přidejte otázky a odpovědi, případně i obsahové slajdy, výsledky otázek a žebříček — z hlasování tak bude celá interaktivní
        prezentace. Po vytvoření dostanete kód pro účastníky a moderátorský odkaz — přes něj můžete vše později i upravit.
      </p>
      <div className="mt-8">
        <PollEditor mode="create" imagesEnabled={isImageStorageConfigured()} />
      </div>

      {/* decentní compact — uživatel je uprostřed vyplňování formuláře,
          plný pozornosti si zaslouží akce, ne reklama (viz zadání). */}
      <div className="mt-8">
        <AlphegaAffiliateBanner variant="compact" />
      </div>
    </main>
  );
}
