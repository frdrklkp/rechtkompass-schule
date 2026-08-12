import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/faelle")({
  component: FaelleLayout,
});

function FaelleLayout() {
  return <Outlet />;
}
