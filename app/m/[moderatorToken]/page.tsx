import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ModeratorConsole from "./ModeratorConsole.tsx";
import { findPollByModeratorToken } from "../../../lib/polls/find-poll.ts";

export const metadata: Metadata = {
  title: "Řízení hlasování",
  robots: { index: false, follow: false },
};

export default async function ModeratorPage({ params }: { params: Promise<{ moderatorToken: string }> }) {
  const { moderatorToken } = await params;
  if (!(await findPollByModeratorToken(moderatorToken))) notFound();
  return <ModeratorConsole moderatorToken={moderatorToken} />;
}
