import type { Metadata } from "next";
import { EnochPlanForm } from "../../../components/enoch-plan-form";

export const metadata: Metadata = {
  title: "Enoch Planner",
  description: "Turn a rough brief into a clean planning artifact inside Project Enoch."
};

export default function EnochPlanPage() {
  return <EnochPlanForm />;
}
