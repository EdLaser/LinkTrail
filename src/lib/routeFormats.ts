/**
 * Supported route file formats for upload
 */

export const SUPPORTED_FORMATS = {
  GPX: "gpx",
  FIT: "fit",
  TCX: "tcx",
  KML: "kml",
  KMZ: "kmz",
} as const;

export type SupportedFormat = (typeof SUPPORTED_FORMATS)[keyof typeof SUPPORTED_FORMATS];

/**
 * MIME types for route files
 */
export const MIME_TYPES_BY_FORMAT: Record<SupportedFormat, string[]> = {
  gpx: ["application/gpx+xml", "text/xml", "application/xml"],
  fit: ["application/octet-stream", "application/fit"],
  tcx: ["application/tcx+xml", "text/xml", "application/xml"],
  kml: ["application/vnd.google-earth.kml+xml", "text/xml", "application/xml"],
  kmz: ["application/vnd.google-earth.kmz", "application/zip", "application/octet-stream"],
};

/**
 * Max file size for uploads (20 MB)
 */
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

/**
 * Validate and extract file format from filename
 */
export function getFormatFromFilename(filename: string): SupportedFormat | null {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (!ext) return null;

  const format = Object.values(SUPPORTED_FORMATS).find((f) => f === ext);
  return format || null;
}

/**
 * Validate file format from MIME type and filename
 */
export function validateFileFormat(filename: string, mimeType: string): SupportedFormat | null {
  const format = getFormatFromFilename(filename);

  if (!format) return null;

  // For KMZ, we accept more MIME types since it's often misidentified
  if (format === "kmz") {
    const validMimeTypes = MIME_TYPES_BY_FORMAT[format];
    // Accept common KMZ misidentifications
    if (validMimeTypes.includes(mimeType)) return format;
    return format; // Allow even if MIME type doesn't match perfectly
  }

  // For other formats, be strict about MIME type
  const validMimeTypes = MIME_TYPES_BY_FORMAT[format];
  if (!validMimeTypes.includes(mimeType)) {
    return null;
  }

  return format;
}
