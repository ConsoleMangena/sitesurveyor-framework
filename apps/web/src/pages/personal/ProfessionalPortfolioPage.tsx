import { Briefcase } from "lucide-react";

import { DashboardHeader, DashboardShell } from "@/components/dashboard/DashboardShell";
import { ProfessionalPortfolioCard } from "@/features/personal/components/ProfessionalPortfolioCard";

interface ProfessionalPortfolioPageProps {
  workspaceId: string;
  userName?: string;
}

export default function ProfessionalPortfolioPage({ workspaceId, userName }: ProfessionalPortfolioPageProps) {
  return (
    <DashboardShell className="max-w-[1440px]">
      <DashboardHeader
        badge={(
          <span className="inline-flex items-center gap-1.5">
            <Briefcase className="size-3.5" aria-hidden="true" />
            Professional profile
          </span>
        )}
        title="Professional Portfolio"
        subtitle="Your public professional identity"
        description="Present your expertise, availability and project work to potential clients. Publish when you are ready to be discovered in the professional registry."
        meta={`Signed in as ${userName || "Professional"}`}
      />
      <ProfessionalPortfolioCard workspaceId={workspaceId} userName={userName} />
    </DashboardShell>
  );
}
