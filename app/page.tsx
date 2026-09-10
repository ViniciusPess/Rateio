import { RateioApp } from "@/app/rateio-app";
import { requireAdminContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireAdminContext();
  return <RateioApp />;
}
