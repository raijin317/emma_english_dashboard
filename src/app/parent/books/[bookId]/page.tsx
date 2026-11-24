import { Suspense } from "react";
import { Loading } from "@/components/kids";
import { BookDetail } from "@/features/parent/books";
import { staticBooks } from "@/server/onlinePages";

export const generateStaticParams = staticBooks;

export default function Page({ params }: PageProps<"/parent/books/[bookId]">) {
  return <Suspense fallback={<Loading />}>{params.then(({ bookId }) => <BookDetail bookId={bookId} />)}</Suspense>;
}
