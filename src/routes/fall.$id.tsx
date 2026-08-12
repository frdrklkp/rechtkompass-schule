import { createFileRoute } from "@tanstack/react-router";
import { CaseDetailById } from "./faelle.$id";

export const Route = createFileRoute("/fall/$id")({
  component: FallRoute,
  head: () => ({
    meta: [{ title: "Praxisfall – RechtKompass Schule" }],
  }),
});

function FallRoute() {
  const { id } = Route.useParams();
  return <CaseDetailById id={id} />;
}
