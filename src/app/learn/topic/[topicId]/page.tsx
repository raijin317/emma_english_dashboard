import { Suspense } from "react";
import { Loading } from "@/components/kids";
import { Playground } from "@/features/child/screens";
import { staticTopics } from "@/server/onlinePages";

export const generateStaticParams = staticTopics;

export default function TopicPlaygroundPage({ params }: PageProps<"/learn/topic/[topicId]">) {
  return <Suspense fallback={<Loading />}>{params.then(({ topicId }) => <Playground kind="topic" id={topicId} />)}</Suspense>;
}
