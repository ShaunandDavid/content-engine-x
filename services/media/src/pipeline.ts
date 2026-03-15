import type { AspectRatio } from "@content-engine/shared";

import {
  burnCaptions,
  extractThumbnail,
  formatAspectRatio,
  insertEndCard,
  mixMusicBed,
  normalizeClip,
  overlayLogo,
  stitchClips
} from "./ffmpeg.js";

export interface AssembleRenderOptions {
  clipPaths: string[];
  outputPath: string;
  aspectRatio: AspectRatio;
  subtitlesPath?: string;
  logoPath?: string;
  endCardPath?: string;
  musicBedPath?: string;
  thumbnailPath?: string;
}

export const assembleRender = async ({
  clipPaths,
  outputPath,
  aspectRatio,
  subtitlesPath,
  logoPath,
  endCardPath,
  musicBedPath,
  thumbnailPath
}: AssembleRenderOptions) => {
  const normalizedPaths = clipPaths.map((clipPath, index) => `${outputPath}.normalized.${index}.mp4`);

  for (const [index, clipPath] of clipPaths.entries()) {
    await normalizeClip(clipPath, normalizedPaths[index], aspectRatio);
  }

  const stitchedPath = `${outputPath}.stitched.mp4`;
  await stitchClips(normalizedPaths, stitchedPath);

  let currentPath = stitchedPath;
  const ratioFormattedPath = `${outputPath}.ratio.mp4`;
  await formatAspectRatio(currentPath, ratioFormattedPath, aspectRatio);
  currentPath = ratioFormattedPath;

  if (subtitlesPath) {
    const captionedPath = `${outputPath}.captioned.mp4`;
    await burnCaptions(currentPath, subtitlesPath, captionedPath);
    currentPath = captionedPath;
  }

  if (logoPath) {
    const brandedPath = `${outputPath}.branded.mp4`;
    await overlayLogo(currentPath, logoPath, brandedPath);
    currentPath = brandedPath;
  }

  if (endCardPath) {
    const endedPath = `${outputPath}.ended.mp4`;
    await insertEndCard(currentPath, endCardPath, endedPath);
    currentPath = endedPath;
  }

  if (musicBedPath) {
    const mixedPath = `${outputPath}.mixed.mp4`;
    await mixMusicBed(currentPath, musicBedPath, mixedPath);
    currentPath = mixedPath;
  }

  await formatAspectRatio(currentPath, outputPath, aspectRatio);

  if (thumbnailPath) {
    await extractThumbnail(outputPath, thumbnailPath);
  }

  return {
    masterVideoPath: outputPath,
    thumbnailPath: thumbnailPath ?? null
  };
};
