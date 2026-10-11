// Decides whether a video frame is "almost completely black" (docs/cwr-video-auto-cover-plan.md).
// Brightness uses the WCAG / Rec. 709 weights on the stored 0–255 values: darkness as people
// see it is what matters, so the sRGB values are deliberately not linearized first.

/** Frames are judged at this size: enough to tell a picture from a black screen, and instant. */
export const SAMPLE_WIDTH = 32;
export const SAMPLE_HEIGHT = 18;

// A pixel is dark below about 10% brightness, just above video black (16 of 255).
const DARK_PIXEL_LUMA = 26;
// A frame is black when nearly every pixel is dark; a night scene with lit windows still counts as a picture.
const BLACK_FRAME_SHARE = 0.98;
const RED_WEIGHT = 0.2126;
const GREEN_WEIGHT = 0.7152;
const BLUE_WEIGHT = 0.0722;
const CHANNELS_PER_PIXEL = 4;

function getLuma(rgba: Uint8ClampedArray, offset: number): number {
  const [red = 0, green = 0, blue = 0] = rgba.subarray(offset, offset + 3);
  return RED_WEIGHT * red + GREEN_WEIGHT * green + BLUE_WEIGHT * blue;
}

/** rgba: canvas ImageData pixels (red, green, blue, alpha for each pixel). */
export function getIsNearBlack(rgba: Uint8ClampedArray): boolean {
  const pixelCount = rgba.length / CHANNELS_PER_PIXEL;
  if (pixelCount === 0) return true;
  let darkPixelCount = 0;
  for (let offset = 0; offset < rgba.length; offset += CHANNELS_PER_PIXEL) {
    if (getLuma(rgba, offset) < DARK_PIXEL_LUMA) darkPixelCount += 1;
  }
  return darkPixelCount / pixelCount >= BLACK_FRAME_SHARE;
}
