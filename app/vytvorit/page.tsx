import type { Metadata } from "next";
import PollEditor from "./PollEditor.tsx";

export const metadata: Metadata = {
  title: "Vytvořit hlasování",
};

export default function CreatePollPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900">Vytvořit hlasování</h1>
      <p className="mt-2 text-gray-600">Přidejte otázky a odpovědi. Po vytvoření dostanete odkaz pro účastníky a moderátorský odkaz.</p>
      <div className="mt-8">
        <PollEditor />
      </div>
    </main>
  );
}
