import { Suspense } from "react";
import { Loading } from "@/components/kids";
import { ItemDetail } from "@/features/parent/items";
import { staticItems } from "@/server/onlinePages";

export const generateStaticParams = staticItems;

export default function Page({ params }: PageProps<"/parent/items/[itemId]">) {
  return <Suspense fallback={<Loading />}>{params.then(({ itemId }) => <ItemDetail itemId={itemId} />)}</Suspense>;
}
