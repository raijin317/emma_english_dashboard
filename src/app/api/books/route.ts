import { route, ok } from "@/server/api";
import { listBooks } from "@/server/repo";

export const GET = route(async () => ok({ books: listBooks() }));
