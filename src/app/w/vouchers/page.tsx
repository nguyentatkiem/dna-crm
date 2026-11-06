import { requireApp } from "@/lib/auth";
import { VouchersClient } from "./VouchersClient";

export default async function VouchersPage() {
  await requireApp();
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <VouchersClient />
    </div>
  );
}
