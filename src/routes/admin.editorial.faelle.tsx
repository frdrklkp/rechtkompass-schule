import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/editorial/faelle")({
  component: EditorialFaelleLayout,
});

function EditorialFaelleLayout() {
  return <Outlet />;
}
