import { Suspense } from "react";
import { Loading } from "@/components/kids";
import { TopicDetail } from "@/features/parent/inspiration";
import { staticTopics } from "@/server/onlinePages";

export const generateStaticParams = staticTopics;

export default function Page({ params }: PageProps<"/parent/inspiration/[topicId]">) {
  return <Suspense fallback={<Loading />}>{params.then(({ topicId }) => <TopicDetail topicId={topicId} />)}</Suspense>;
}
