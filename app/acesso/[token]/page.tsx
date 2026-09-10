import type { Metadata } from "next";
import { ParticipantPortal } from "@/app/acesso/[token]/participant-portal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Meu Rateio",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ParticipantAccessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ParticipantPortal token={token} />;
}
