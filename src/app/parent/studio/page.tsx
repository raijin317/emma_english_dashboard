import { StudioPage } from "@/features/parent/studio";
import { EmptyState, PageHeader } from "@/components/ui";
import { HOME_ONLY, ONLINE } from "@/lib/mode";

export default function Page() {
  // AI Studio talks to Claude Code on the home computer — not available online.
  if (ONLINE)
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader emoji="🤖" title="AI Studio" />
        <EmptyState emoji="🏠" title="AI Studio is on your home computer">
          {HOME_ONLY}
        </EmptyState>
      </div>
    );
  return <StudioPage />;
}
