/// <reference lib="webworker" />

import encodeAvif from "@jsquash/avif/encode";
import encodeWebp from "@jsquash/webp/encode";

import { getVariantPixelWidth, type PhotoFormat } from "@/lib/admin/photos/photo-files";

// Runs in a Web Worker so the page stays responsive while photos are encoded.

const AVIF_OPTIONS = { quality: 50, speed: 8 };
const WEBP_OPTIONS = { quality: 75 };

export type EncodeRequest = { bitmap: ImageBitmap; widths: number[]; formats: PhotoFormat[] };

export type EncodedVariant = { width: number; format: PhotoFormat; bytes: ArrayBuffer };

export type EncodeReply =
  | { type: "progress"; done: number; total: number }
  | { type: "done"; variants: EncodedVariant[] }
  | { type: "error"; message: string };

function getResizedImageData(bitmap: ImageBitmap, namedWidth: number): ImageData {
  const width = getVariantPixelWidth(namedWidth, bitmap.width);
  const height = Math.round((bitmap.height * width) / bitmap.width);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot resize photos");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

function encodeVariant(imageData: ImageData, format: PhotoFormat): Promise<ArrayBuffer> {
  return format === "avif" ? encodeAvif(imageData, AVIF_OPTIONS) : encodeWebp(imageData, WEBP_OPTIONS);
}

async function encodeAll({ bitmap, widths, formats }: EncodeRequest): Promise<EncodedVariant[]> {
  const variants: EncodedVariant[] = [];
  const total = widths.length * formats.length;
  for (const width of widths) {
    const imageData = getResizedImageData(bitmap, width);
    for (const format of formats) {
      variants.push({ width, format, bytes: await encodeVariant(imageData, format) });
      self.postMessage({ type: "progress", done: variants.length, total } satisfies EncodeReply);
    }
  }
  return variants;
}

self.onmessage = async (event: MessageEvent<EncodeRequest>) => {
  try {
    const variants = await encodeAll(event.data);
    self.postMessage({ type: "done", variants } satisfies EncodeReply, variants.map((variant) => variant.bytes));
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) } satisfies EncodeReply);
  } finally {
    event.data.bitmap.close();
  }
};
