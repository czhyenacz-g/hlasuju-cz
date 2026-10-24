import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PollParticipant from "./PollParticipant.tsx";
import { pollExistsByPublicCode } from "../../lib/polls/find-poll.ts";

export const metadata: Metadata = {
  title: "Hlasování",
  robots: { index: false, follow: false },
};

export default async function ParticipantPage({ params }: { params: Promise<{ publicCode: string }> }) {
  const { publicCode } = await params;
  // Skutečné HTTP 404 (ne soft-404) pro libovolnou neplatnou / vypršelou
  // adresu — tahle dynamická route jinak chytá každou jednosegmentovou URL.
  if (!(await pollExistsByPublicCode(publicCode))) notFound();
  return <PollParticipant publicCode={publicCode} />;
}
