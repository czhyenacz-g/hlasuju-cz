import type { Metadata } from "next";
import PollParticipant from "./PollParticipant.tsx";

export const metadata: Metadata = {
  title: "Hlasování",
  robots: { index: false, follow: false },
};

export default async function ParticipantPage({ params }: { params: Promise<{ publicCode: string }> }) {
  const { publicCode } = await params;
  return <PollParticipant publicCode={publicCode} />;
}
