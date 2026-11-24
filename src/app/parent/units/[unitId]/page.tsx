import { Suspense } from "react";
import { Loading } from "@/components/kids";
import { UnitWorkspace } from "@/features/parent/unit";
import { staticUnits } from "@/server/onlinePages";

export const generateStaticParams = staticUnits;

export default function Page({ params }: PageProps<"/parent/units/[unitId]">) {
  return <Suspense fallback={<Loading />}>{params.then(({ unitId }) => <UnitWorkspace unitId={unitId} />)}</Suspense>;
}
