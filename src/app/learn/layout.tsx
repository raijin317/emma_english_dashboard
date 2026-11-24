import { LockParentArea } from "@/features/child/lockParent";

/** Every child-mode screen locks the parent area (the PIN is asked again when going back to /parent). */
export default function LearnLayout({ children }: LayoutProps<"/learn">) {
  return (
    <>
      <LockParentArea />
      {children}
    </>
  );
}
