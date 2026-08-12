import { createFileRoute } from "@tanstack/react-router";
import { PracticeCaseWizard } from "./admin.faelle.$id";

export const Route = createFileRoute("/admin/faelle/neu")({
  component: NewPracticeCaseWizard,
});

function NewPracticeCaseWizard() {
  return <PracticeCaseWizard forcedId="neu" />;
}