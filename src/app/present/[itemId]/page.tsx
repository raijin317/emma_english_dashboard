import { Suspense } from "react";
import { Loading } from "@/components/kids";
import { PresentScreen } from "@/features/present";
import { staticItems } from "@/server/onlinePages";

export const generateStaticParams = staticItems;

export default function Page({ params }: PageProps<"/present/[itemId]">) {
  return <Suspense fallback={<Loading />}>{params.then(({ itemId }) => <PresentScreen itemId={itemId} />)}</Suspense>;
}
