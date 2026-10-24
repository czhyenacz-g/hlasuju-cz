import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PollEditor from "../../../vytvorit/PollEditor.tsx";
import { getEditorContent } from "../../../../lib/polls/get-editor-content.ts";
import { isModeratorTokenFormat } from "../../../../lib/polls/find-poll.ts";
import { isImageStorageConfigured } from "../../../../lib/images/storage.ts";

export const metadata: Metadata = {
  title: "Upravit otázky",
  robots: { index: false, follow: false },
};

export default async function EditPollPage({
  params,
  searchParams,
}: {
  params: Promise<{ moderatorToken: string }>;
  searchParams: Promise<{ nahrani?: string }>;
}) {
  const { moderatorToken } = await params;
  const { nahrani } = await searchParams;
  if (!isModeratorTokenFormat(moderatorToken)) notFound();

  const content = await getEditorContent(moderatorToken);
  if (!content) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10">
      <Link href={`/m/${moderatorToken}`} className="text-sm text-gray-500 hover:underline">
        ← Zpět na řízení hlasování
      </Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900">Upravit otázky</h1>
      <p className="mt-2 text-gray-600">
        Kód pro účastníky <span className="font-semibold text-gray-900">{content.publicCode}</span> zůstává stejný. Nespuštěné otázky můžete
        libovolně měnit i během prezentace, spuštěné už jen přesouvat.
      </p>

      <div className="mt-8">
        {content.pollStatus === "closed" ? (
          <p className="rounded-2xl border border-gray-200 bg-white p-6 text-gray-700">
            Hlasování je ukončené — otázky i výsledky jsou uzamčené a už je nelze měnit.
          </p>
        ) : (
          <PollEditor
            mode="edit"
            moderatorToken={moderatorToken}
            initial={content}
            imagesEnabled={isImageStorageConfigured()}
            uploadFailed={nahrani === "chyba"}
          />
        )}
      </div>
    </main>
  );
}
