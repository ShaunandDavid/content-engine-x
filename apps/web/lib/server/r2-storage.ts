import { readFile } from "node:fs/promises";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { z } from "zod";

const r2ConfigSchema = z.object({
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_PUBLIC_BASE_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional())
});

type UploadAssetInput = {
  localPath: string;
  objectKey: string;
  contentType: string;
};

const getR2Config = (env: NodeJS.ProcessEnv = process.env) => r2ConfigSchema.parse(env);

const createR2Client = () => {
  const config = getR2Config();

  return new S3Client({
    region: "auto",
    endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY
    }
  });
};

const joinUrl = (baseUrl: string, objectKey: string) => `${baseUrl.replace(/\/$/, "")}/${objectKey.replace(/^\//, "")}`;

export const uploadAssetFile = async ({ localPath, objectKey, contentType }: UploadAssetInput) => {
  const config = getR2Config();
  const client = createR2Client();
  const body = await readFile(localPath);

  await client.send(
    new PutObjectCommand({
      Bucket: config.R2_BUCKET,
      Key: objectKey,
      Body: body,
      ContentType: contentType
    })
  );

  return {
    bucket: config.R2_BUCKET,
    objectKey,
    publicUrl: config.R2_PUBLIC_BASE_URL ? joinUrl(config.R2_PUBLIC_BASE_URL, objectKey) : null,
    byteSize: body.byteLength
  };
};
