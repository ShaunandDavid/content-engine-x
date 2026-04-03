import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const helperFile = path.join(workspaceRoot, "apps", "web", "lib", "server", "adam-tts.ts");

const resolveLocalModulePath = (dirname, specifier) => {
  const basePath = path.resolve(dirname, specifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.js`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.js")
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? basePath;
};

const createTsModuleLoader = (mocks = {}) => {
  const cache = new Map();

  const loadTsModule = (filePath) => {
    if (cache.has(filePath)) {
      return cache.get(filePath).exports;
    }

    const source = fs.readFileSync(filePath, "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true
      }
    });

    const module = { exports: {} };
    cache.set(filePath, module);

    const dirname = path.dirname(filePath);
    const localRequire = (specifier) => {
      if (specifier in mocks) {
        return mocks[specifier];
      }

      if (specifier.startsWith(".")) {
        const resolvedPath = resolveLocalModulePath(dirname, specifier);
        if (resolvedPath.endsWith(".ts")) {
          return loadTsModule(resolvedPath);
        }

        return require(resolvedPath);
      }

      return require(specifier);
    };

    vm.runInNewContext(outputText, {
      module,
      exports: module.exports,
      require: localRequire,
      __dirname: dirname,
      __filename: filePath,
      process,
      console,
      fetch: global.fetch,
      Buffer
    });

    return module.exports;
  };

  return loadTsModule;
};

const sharedMocks = {
  adamTtsResponseSchema: { parse: (value) => value }
};

test("createAdamTtsResponse uses browser speech fallback when ElevenLabs is not configured", async () => {
  const loadTsModule = createTsModuleLoader({
    "@content-engine/shared": sharedMocks
  });
  const module = loadTsModule(helperFile);
  const originalEnv = {
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID,
    ELEVENLABS_MODEL_ID: process.env.ELEVENLABS_MODEL_ID,
    ELEVENLABS_OUTPUT_FORMAT: process.env.ELEVENLABS_OUTPUT_FORMAT
  };

  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_VOICE_ID;
  delete process.env.ELEVENLABS_MODEL_ID;
  delete process.env.ELEVENLABS_OUTPUT_FORMAT;

  try {
    const result = await module.createAdamTtsResponse({
      text: "Adam fallback check."
    });

    assert.equal(result.playbackMode, "browser_speech_synthesis");
    assert.equal(result.metadata.provider, "browser_speech_synthesis");
    assert.equal(result.metadata.fallbackReason, "missing_elevenlabs_api_key");
    assert.match(result.message, /server audio is not configured/i);
  } finally {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("createAdamTtsResponse names the configured Will voice when browser speech fallback is active", async () => {
  const loadTsModule = createTsModuleLoader({
    "@content-engine/shared": sharedMocks
  });
  const module = loadTsModule(helperFile);
  const originalEnv = {
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID,
    ELEVENLABS_VOICE_NAME: process.env.ELEVENLABS_VOICE_NAME
  };

  delete process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_VOICE_ID = "bIHbv24MWmeRgasZH58o";
  delete process.env.ELEVENLABS_VOICE_NAME;

  try {
    const result = await module.createAdamTtsResponse({
      text: "Adam fallback with configured voice."
    });

    assert.equal(result.playbackMode, "browser_speech_synthesis");
    assert.equal(result.voiceHint, "Will");
    assert.equal(result.metadata.configuredVoiceName, "Will");
    assert.equal(result.metadata.configuredVoiceIdMasked, "bIHb***H58o");
    assert.match(result.message, /Will is selected for Adam/i);
  } finally {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("createAdamTtsResponse returns audio data when ElevenLabs responds successfully", async () => {
  const originalEnv = {
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID,
    ELEVENLABS_MODEL_ID: process.env.ELEVENLABS_MODEL_ID,
    ELEVENLABS_OUTPUT_FORMAT: process.env.ELEVENLABS_OUTPUT_FORMAT
  };
  const originalFetch = global.fetch;
  const fetchCalls = [];

  process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
  process.env.ELEVENLABS_VOICE_ID = "voice-1";
  process.env.ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";
  process.env.ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";

  global.fetch = async (url, options = {}) => {
    fetchCalls.push({ url, options });

    if (String(url).includes("/v1/text-to-speech/voice-1")) {
      return {
        ok: true,
        headers: {
          get: () => "audio/mpeg"
        },
        arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer
      };
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const loadTsModule = createTsModuleLoader({
      "@content-engine/shared": sharedMocks
    });
    const module = loadTsModule(helperFile);
    const result = await module.createAdamTtsResponse({
      text: "Adam audio check."
    });

    assert.equal(fetchCalls.length, 1);
    assert.equal(result.playbackMode, "audio_data");
    assert.equal(result.metadata.provider, "elevenlabs");
    assert.equal(result.metadata.voiceSelection, "configured_direct");
    assert.equal(result.metadata.voiceIdMasked, "vo***-1");
    assert.equal(result.metadata.voiceName, null);
    assert.equal(result.audioMimeType, "audio/mpeg");
    assert.equal(result.audioData, Buffer.from([1, 2, 3, 4]).toString("base64"));
    assert.match(result.message, /configured Adam voice/i);
  } finally {
    global.fetch = originalFetch;

    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
