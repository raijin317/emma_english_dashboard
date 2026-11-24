import { Suspense } from "react";
import { Loading } from "@/components/kids";
import { PlayScreen } from "@/features/child/screens";
import { staticItems } from "@/server/onlinePages";

export const generateStaticParams = staticItems;

export default function PlayPage({ params }: PageProps<"/learn/play/[itemId]">) {
  return <Suspense fallback={<Loading />}>{params.then(({ itemId }) => <PlayScreen itemId={itemId} />)}</Suspense>;
}
