import { Suspense } from "react";
import { Loading } from "@/components/kids";
import { PrintScreen } from "@/features/present";
import { staticPrintables } from "@/server/onlinePages";

export const generateStaticParams = staticPrintables;

export default function Page({ params }: PageProps<"/print/[itemId]">) {
  return <Suspense fallback={<Loading />}>{params.then(({ itemId }) => <PrintScreen itemId={itemId} />)}</Suspense>;
}
