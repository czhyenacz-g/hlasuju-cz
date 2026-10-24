import type { Metadata } from "next";
import PollEditor from "./PollEditor.tsx";
import AlphegaAffiliateBanner from "../../components/AlphegaAffiliateBanner.tsx";
import { isImageStorageConfigured } from "../../lib/images/storage.ts";

export const metadata: Metadata = {
  title: "Vytvořit hlasování",
};

export default function CreatePollPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900">Vytvořit hlasování</h1>
      <p className="mt-2 text-gray-600">
        Přidejte otázky, odpovědi a případně obrázek nebo odkaz. Po vytvoření dostanete kód pro účastníky a moderátorský odkaz — přes něj
        můžete otázky později i upravit.
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
