import type { Metadata } from "next";
import ModeratorConsole from "./ModeratorConsole.tsx";

export const metadata: Metadata = {
  title: "Řízení hlasování",
  robots: { index: false, follow: false },
};

export default async function ModeratorPage({ params }: { params: Promise<{ moderatorToken: string }> }) {
  const { moderatorToken } = await params;
  return <ModeratorConsole moderatorToken={moderatorToken} />;
}
