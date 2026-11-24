import { Suspense } from "react";
import { Loading } from "@/components/kids";
import { ParentShell } from "@/features/parent/shell";

export default function ParentLayout({ children }: LayoutProps<"/parent">) {
  return (
    <Suspense fallback={<Loading />}>
      <ParentShell>{children}</ParentShell>
    </Suspense>
  );
}
