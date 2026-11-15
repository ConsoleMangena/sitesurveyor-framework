import type { ReactNode } from "react";
import { PublicHeader } from "./PublicHeader.tsx";
import { PublicFooter } from "./PublicFooter.tsx";
import { PublicWebOnly } from "./PublicWebOnly.tsx";

interface PublicPageProps {
  section?: string;
  children: ReactNode;
}

/** Shared public header and footer. `/` stays public; the app lives at `/workspace`. */
export function PublicPage({ section, children }: PublicPageProps) {
  return (
    <PublicWebOnly>
      <div className="web3-surface">
        <PublicHeader section={section} />
        <main>{children}</main>
        <PublicFooter />
      </div>
    </PublicWebOnly>
  );
}
