import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import PollParticipant from "./PollParticipant.tsx";
import PublicPoll from "../../components/PublicPoll.tsx";
import ShareButtons from "../../components/ShareButtons.tsx";
import { getSharePreview, pollExistsByPublicCode } from "../../lib/polls/find-poll.ts";
import { pollPageMetadata } from "../../lib/polls/share-metadata.ts";
import { SITE_URL } from "../config/site.ts";

type Params = { params: Promise<{ publicCode: string }> };

// Metadata i stránka čtou stejná data — jeden dotaz na request.
const loadPreview = cache(getSharePreview);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { publicCode } = await params;
  return pollPageMetadata(publicCode, await loadPreview(publicCode));
}

export default async function ParticipantPage({ params }: Params) {
  const { publicCode } = await params;
  const preview = await loadPreview(publicCode);
  if (preview) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-6 sm:py-10">
        <Link href="/" className="text-lg font-bold tracking-tight text-brand hover:text-brand-dark">
          hlasuju.cz
        </Link>
        <section className="mt-5 rounded-3xl border border-gray-200 bg-white p-5 shadow-soft sm:p-8">
          <PublicPoll publicCode={publicCode} />
        </section>
        <div className="mt-6">
          <ShareButtons url={`${SITE_URL}/${publicCode}`} text={preview.question} compact />
        </div>
        <p className="mt-8 text-center text-sm text-gray-500">
          <Link href="/pro-weby" className="font-semibold text-brand hover:underline">
            Vytvořte si vlastní anketu zdarma →
          </Link>
        </p>
      </main>
    );
  }

  // Skutečné HTTP 404 (ne soft-404) pro libovolnou neplatnou / vypršelou
  // adresu — tahle dynamická route jinak chytá každou jednosegmentovou URL.
  if (!(await pollExistsByPublicCode(publicCode))) notFound();
  return <PollParticipant publicCode={publicCode} />;
}
