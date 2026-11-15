import type { ReactNode } from "react";
import { PublicSection } from "./PublicSection.tsx";
import { SurveyPhoto } from "./SurveyPhoto.tsx";
import type { SurveyPhotoKey } from "../../lib/content/surveyPhotos.ts";

interface PublicHeroProps {
  id: string;
  title: string;
  description: string;
  image: SurveyPhotoKey;
  children?: ReactNode;
}

/** A shared editorial opening: concise orientation beside purposeful field photography. */
export function PublicHero({ id, title, description, image, children }: PublicHeroProps) {
  return (
    <PublicSection aria-labelledby={id} className="public-editorial-hero">
      <div className="public-editorial-grid">
        <div className="public-editorial-copy">
          <h1 id={id}>{title}</h1>
          <p>{description}</p>
        </div>
        <SurveyPhoto image={image} className="public-editorial-photo" eager />
      </div>
      {children ? <div className="public-editorial-extra">{children}</div> : null}
    </PublicSection>
  );
}
