// Party-wall post shaping: captions, multi-image URLs, slot ordering.

export function isR2MediaRef(value) {
  return typeof value === "string" && value.startsWith("events/");
}

export function orderedSlotEntries(requiredFields = {}) {
  return Object.entries(requiredFields)
    .filter(([, value]) => isR2MediaRef(value))
    .sort((a, b) => a[1].localeCompare(b[1]));
}

export function wallPostCaption({ caption = "", requiredFields = {} } = {}) {
  const parts = [];
  if (caption) parts.push(caption);
  const textValues = Object.values(requiredFields)
    .filter((value) => typeof value === "string" && value && !isR2MediaRef(value));
  if (textValues.length) parts.push(textValues.join(" · "));
  return parts.join(" — ");
}

export function wallImageUrls(submissionId, mediaKey, requiredFields = {}) {
  const slots = orderedSlotEntries(requiredFields);
  if (slots.length) {
    return slots.map((_, index) => `/api/media/${submissionId}/slot/${index}`);
  }
  if (mediaKey) return [`/api/media/${submissionId}`];
  return [];
}

export function wallSlotLabels(requiredFields = {}) {
  return orderedSlotEntries(requiredFields).map(([label]) => label);
}

export function resolveMediaKey({ mediaKey, requiredFields = {}, slotIndex = null } = {}) {
  if (slotIndex == null || Number.isNaN(slotIndex)) return mediaKey || null;
  const slots = orderedSlotEntries(requiredFields);
  return slots[slotIndex]?.[1] || null;
}
