import { createClient } from "@/lib/supabase/server";
import { CaptureScreen } from "@/components/capture-screen";

export default async function CapturePage() {
  const supabase = await createClient();
  const { data: deals } = await supabase
    .from("deals")
    .select("id, title, stage")
    .in("stage", ["active", "pending_finance"])
    .order("updated_at", { ascending: false })
    .limit(10);

  return <CaptureScreen activeDeals={deals ?? []} />;
}
