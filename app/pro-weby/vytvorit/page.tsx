import type { Metadata } from "next";
import Link from "next/link";
import PollEditor from "../../vytvorit/PollEditor.tsx";
import VotingBackdrop from "../../../components/VotingBackdrop.tsx";
import { isImageStorageConfigured } from "../../../lib/images/storage.ts";

export const metadata: Metadata = {
  title: "Vytvořit anketu pro web",
  robots: { index: false, follow: true },
};

export default function CreateWebPollPage() {
  return (
    <main className="relative mx-auto min-h-screen max-w-3xl px-4 py-8 sm:py-12">
      <VotingBackdrop />
      <Link href="/pro-weby" className="text-lg font-bold tracking-tight text-brand hover:text-brand-dark">
        hlasuju.cz
      </Link>
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">Vytvořit anketu pro web</h1>
      <p className="mt-2 text-gray-600">
        Jedna otázka, 2–10 odpovědí. Hlasovat se dá hned po vytvoření – dostanete odkaz ke sdílení, kód pro vložení na web a odkaz na správu
        s výsledky.
      </p>
      <div className="mt-8">
        <PollEditor mode="create" pollMode="self_service" imagesEnabled={isImageStorageConfigured()} />
      </div>
    </main>
  );
}
