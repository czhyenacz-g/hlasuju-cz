import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicPoll from "../../../components/PublicPoll.tsx";
import { getPollMode } from "../../../lib/polls/find-poll.ts";

export const metadata: Metadata = {
  title: "Anketa",
  robots: { index: false, follow: false },
};

/**
 * Widget veřejné ankety pro vložení do iframe na cizí web (hlavičky viz
 * next.config.ts — jen tahle route smí být ve framu). Bez navigace,
 * banneru, analytiky a moderátorského ovládání. Živá hlasování se
 * vkládat nedají (404).
 */
export default async function EmbedPage({ params }: { params: Promise<{ publicCode: string }> }) {
  const { publicCode } = await params;
  if ((await getPollMode(publicCode)) !== "self_service") notFound();
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <PublicPoll publicCode={publicCode} embed />
    </div>
  );
}
