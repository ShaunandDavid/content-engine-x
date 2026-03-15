import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AspectRatio } from "@content-engine/shared";

import { getMediaConfig } from "./config.js";

const config = getMediaConfig();

const runBinary = async (binary: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(binary, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${binary} exited with code ${code}`));
    });
  });

const aspectRatioFilter = (aspectRatio: AspectRatio) => {
  switch (aspectRatio) {
    case "9:16":
      return "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black,setsar=1";
    case "16:9":
      return "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1";
  }
};

export const normalizeClip = async (inputPath: string, outputPath: string, aspectRatio: AspectRatio) => {
  await runBinary(config.FFMPEG_BIN, [
    "-y",
    "-i",
    inputPath,
    "-vf",
    aspectRatioFilter(aspectRatio),
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    outputPath
  ]);
};

export const stitchClips = async (inputPaths: string[], outputPath: string) => {
  const tempDir = await mkdtemp(join(tmpdir(), "content-engine-x-"));
  const manifestPath = join(tempDir, "concat.txt");
  await writeFile(manifestPath, inputPaths.map((inputPath) => `file '${inputPath.replace(/'/g, "'\\''")}'`).join("\n"));

  try {
    await runBinary(config.FFMPEG_BIN, [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      manifestPath,
      "-c",
      "copy",
      outputPath
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

export const formatAspectRatio = async (inputPath: string, outputPath: string, aspectRatio: AspectRatio) => {
  await runBinary(config.FFMPEG_BIN, ["-y", "-i", inputPath, "-vf", aspectRatioFilter(aspectRatio), outputPath]);
};

export const burnCaptions = async (inputPath: string, subtitlesPath: string, outputPath: string) => {
  await runBinary(config.FFMPEG_BIN, [
    "-y",
    "-i",
    inputPath,
    "-vf",
    `subtitles=${subtitlesPath}`,
    outputPath
  ]);
};

export const overlayLogo = async (inputPath: string, logoPath: string, outputPath: string) => {
  await runBinary(config.FFMPEG_BIN, [
    "-y",
    "-i",
    inputPath,
    "-i",
    logoPath,
    "-filter_complex",
    "overlay=W-w-32:32",
    outputPath
  ]);
};

export const insertEndCard = async (inputPath: string, endCardPath: string, outputPath: string) => {
  await stitchClips([inputPath, endCardPath], outputPath);
};

export const extractThumbnail = async (inputPath: string, outputPath: string) => {
  await runBinary(config.FFMPEG_BIN, [
    "-y",
    "-i",
    inputPath,
    "-vf",
    "thumbnail,scale=720:-1",
    "-frames:v",
    "1",
    outputPath
  ]);
};

export const mixMusicBed = async (inputPath: string, musicBedPath: string, outputPath: string) => {
  await runBinary(config.FFMPEG_BIN, [
    "-y",
    "-i",
    inputPath,
    "-i",
    musicBedPath,
    "-filter_complex",
    "[1:a]volume=0.12[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]",
    "-map",
    "0:v",
    "-map",
    "[aout]",
    "-c:v",
    "copy",
    outputPath
  ]);
};
