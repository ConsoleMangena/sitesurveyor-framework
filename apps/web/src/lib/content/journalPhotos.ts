import type { SurveyPhotoKey } from "./surveyPhotos.ts";

/** Editorial imagery chosen for each entry's subject, with credits kept beside the photograph. */
const JOURNAL_PHOTOS: Record<string, SurveyPhotoKey> = {
  "one-record-from-quote-to-cash": "calibration",
  "hash-anchors-explained": "boundary",
  "designing-for-the-390-pixel-field-phone": "setting-out",
};

export function journalPhoto(slug: string): SurveyPhotoKey {
  return JOURNAL_PHOTOS[slug] ?? "drone";
}
