import { Suspense } from "react";
import { Loading } from "@/components/kids";
import { Playground } from "@/features/child/screens";
import { staticUnits } from "@/server/onlinePages";

export const generateStaticParams = staticUnits;

export default function UnitPlaygroundPage({ params }: PageProps<"/learn/unit/[unitId]">) {
  return <Suspense fallback={<Loading />}>{params.then(({ unitId }) => <Playground kind="unit" id={unitId} />)}</Suspense>;
}
