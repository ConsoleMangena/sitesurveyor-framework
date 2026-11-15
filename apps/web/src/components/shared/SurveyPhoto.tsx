import { cn } from "../../lib/utils.ts";
import { SURVEY_PHOTOS, type SurveyPhotoKey } from "../../lib/content/surveyPhotos.ts";

interface SurveyPhotoProps {
  image: SurveyPhotoKey;
  className?: string;
  /** Load the first-viewport image immediately; gallery images stay lazy. */
  eager?: boolean;
  /** Disable the caption inside linked cards, where a nested credit link would be invalid. */
  showCaption?: boolean;
}

/** Locally bundled, licensed field photography with responsive sizing and credits. */
export function SurveyPhoto({ image, className, eager = false, showCaption = true }: SurveyPhotoProps) {
  const photo = SURVEY_PHOTOS[image];

  return (
    <figure className={cn("survey-photo", className)}>
      <div className="survey-photo-frame">
        <img
          src={photo.src}
          alt={photo.alt}
          width={photo.width}
          height={photo.height}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
        />
      </div>
      {showCaption ? (
        <figcaption>
          <span>{photo.caption}</span>
          <a href={photo.href} target="_blank" rel="noreferrer">{photo.author} · {photo.licence}</a>
        </figcaption>
      ) : null}
    </figure>
  );
}
