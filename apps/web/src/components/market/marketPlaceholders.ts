/**
 * Fallback images for marketplace items that do not have custom photos.
 * Ensures cards, rails, and detail dialogs look complete and professional.
 */

export function getEquipmentPlaceholder(
  type?: string | null,
  category?: string | null,
): string {
  const t = (type ?? "").toLowerCase();
  if (t.includes("total station")) {
    return "/images/market/placeholders/total-station.jpg";
  }
  if (
    t.includes("gnss") ||
    t.includes("gps") ||
    t.includes("antenna") ||
    t.includes("rtk")
  ) {
    return "/images/market/placeholders/gnss-receiver.jpg";
  }
  if (t.includes("level")) {
    return "/images/market/placeholders/digital-level.jpg";
  }
  if (t.includes("drone") || t.includes("uav") || t.includes("vtol")) {
    return "/images/market/placeholders/drone.jpg";
  }
  if (t.includes("scan") || t.includes("lidar")) {
    return "/images/market/placeholders/laser-scanner.jpg";
  }
  if (t.includes("controller") || t.includes("tablet")) {
    return "/images/market/placeholders/controller.jpg";
  }
  if (
    t.includes("calibration") ||
    t.includes("repair") ||
    t.includes("service")
  ) {
    return "/images/market/placeholders/service.jpg";
  }
  if (
    category === "accessory" ||
    t.includes("tripod") ||
    t.includes("prism") ||
    t.includes("pole") ||
    t.includes("rod") ||
    t.includes("tribrach") ||
    t.includes("bracket")
  ) {
    return "/images/market/placeholders/accessory.jpg";
  }
  return "/images/market/placeholders/total-station.jpg";
}

export function getKindPlaceholder(
  kind: "listing" | "professional" | "job" | "firm" | "event",
  type?: string | null,
): string {
  switch (kind) {
    case "listing":
      return getEquipmentPlaceholder(type);
    case "professional":
      return "/images/market/placeholders/professional.jpg";
    case "firm":
      return "/images/market/placeholders/firm.jpg";
    case "job":
      return "/images/market/placeholders/job.jpg";
    case "event":
      return "/images/market/placeholders/event.jpg";
    default:
      return "/images/market/placeholders/total-station.jpg";
  }
}

