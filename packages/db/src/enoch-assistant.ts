import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EnochAssistantMessage,
  EnochAssistantMessageKind,
  EnochAssistantMessageRole,
  EnochAssistantSession,
  EnochJobStatus,
  EnochWorkflowStage
} from "@content-engine/shared";
import {
  enochAssistantMessageSchema,
  enochAssistantSessionSchema,
  enochCompatibilityTenantId
} from "@content-engine/shared";

import { createServiceSupabaseClient } from "./client.js";
import { getSupabaseConfig } from "./config.js";
import type { EnochArtifactRow, EnochRunRow } from "./enoch.js";

type EnochChatSessionRow = {
  id: string;
  owner_user_id: string | null;
  project_id: string | null;
  title: string;
  generated_label: string | null;
  summary: string | null;
  context_snapshot: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

type EnochChatMessageRow = {
  id: string;
  session_id: string;
  project_id: string | null;
  role: EnochAssistantMessageRole;
  kind: EnochAssistantMessageKind;
  content: string;
  attachments: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type EnochAssistantSessionDetail = {
  session: EnochAssistantSession;
  messages: EnochAssistantMessage[];
};

export type CreateEnochAssistantSessionInput = {
  title?: string;
  projectId?: string | null;
  ownerUserId?: string | null;
  generatedLabel?: string | null;
  summary?: string | null;
  contextSnapshot?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type UpdateEnochAssistantSessionInput = {
  title?: string;
  projectId?: string | null;
  generatedLabel?: string | null;
  summary?: string | null;
  contextSnapshot?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  lastMessageAt?: string | null;
};

export type CreateEnochAssistantMessageInput = {
  sessionId: string;
  projectId?: string | null;
  role: EnochAssistantMessageRole;
  kind?: EnochAssistantMessageKind;
  content: string;
  attachments?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type UpdateEnochAssistantMessageInput = {
  kind?: EnochAssistantMessageKind;
  content?: string;
  attachments?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

const FALLBACK_SESSION_WORKFLOW_KIND = "enoch.assistant_session";
const FALLBACK_SESSION_WORKFLOW_VERSION = "v1";
const FALLBACK_SESSION_STATE_VERSION = "enoch.assistant_session.v1";
const FALLBACK_SESSION_ENTRYPOINT = "assistant_session";
const FALLBACK_SESSION_STAGE: EnochWorkflowStage = "concept_generation";
const FALLBACK_SESSION_STATUS: EnochJobStatus = "running";
const FALLBACK_MESSAGE_ARTIFACT_TYPE = "assistant_message";
const FALLBACK_MESSAGE_SCHEMA_NAME = "enoch.assistant_message";

const assertData = <T>(data: T | null, error: { message: string } | null, context: string): T => {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }

  if (!data) {
    throw new Error(`${context}: expected data.`);
  }

  return data;
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
};

const asNullableString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizeIsoDateTime = (value: string | null | undefined) => {
  if (!value) {
    return value ?? null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
};

const isMissingAssistantStorageError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("enoch_chat_sessions") ||
    message.includes("enoch_chat_messages") ||
    message.includes("schema cache") ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
};

const buildFallbackSessionState = (session: EnochAssistantSession) => ({
  assistant_session: true,
  ownerUserId: session.ownerUserId ?? null,
  projectId: session.projectId ?? null,
  title: session.title,
  generatedLabel: session.generatedLabel ?? null,
  summary: session.summary ?? null,
  contextSnapshot: session.contextSnapshot ?? {},
  lastMessageAt: session.lastMessageAt ?? null
});

const toAssistantSession = (row: EnochChatSessionRow): EnochAssistantSession =>
  enochAssistantSessionSchema.parse({
    id: row.id,
    ownerUserId: row.owner_user_id,
    projectId: row.project_id,
    title: row.title,
    generatedLabel: row.generated_label,
    summary: row.summary,
    contextSnapshot: row.context_snapshot ?? {},
    metadata: row.metadata ?? {},
    lastMessageAt: normalizeIsoDateTime(row.last_message_at),
    createdAt: normalizeIsoDateTime(row.created_at),
    updatedAt: normalizeIsoDateTime(row.updated_at)
  });

const toAssistantMessage = (row: EnochChatMessageRow): EnochAssistantMessage =>
  enochAssistantMessageSchema.parse({
    id: row.id,
    sessionId: row.session_id,
    projectId: row.project_id,
    role: row.role,
    kind: row.kind,
    content: row.content,
    attachments: row.attachments ?? {},
    metadata: row.metadata ?? {},
    createdAt: normalizeIsoDateTime(row.created_at)
  });

const toFallbackAssistantSession = (row: EnochRunRow): EnochAssistantSession => {
  const snapshot = asRecord(row.state_snapshot);
  const metadata = asRecord(row.metadata);

  return enochAssistantSessionSchema.parse({
    id: row.id,
    ownerUserId: asNullableString(snapshot.ownerUserId) ?? asNullableString(metadata.ownerUserId),
    projectId: row.project_id ?? asNullableString(snapshot.projectId),
    title: asNullableString(snapshot.title) ?? "New conversation",
    generatedLabel: asNullableString(snapshot.generatedLabel),
    summary: asNullableString(snapshot.summary),
    contextSnapshot: asRecord(snapshot.contextSnapshot),
    metadata: {
      ...metadata,
      storage: "enoch_runs_fallback"
    },
    lastMessageAt: normalizeIsoDateTime(asNullableString(snapshot.lastMessageAt)),
    createdAt: normalizeIsoDateTime(row.created_at),
    updatedAt: normalizeIsoDateTime(row.updated_at)
  });
};

const toFallbackAssistantMessage = (row: EnochArtifactRow): EnochAssistantMessage => {
  const payload = asRecord(row.content_json);
  const payloadMetadata = asRecord(payload.metadata);

  return enochAssistantMessageSchema.parse({
    id: row.id,
    sessionId: row.run_id,
    projectId: row.project_id ?? asNullableString(payload.projectId),
    role: payload.role ?? "assistant",
    kind: payload.kind ?? "message",
    content: typeof payload.content === "string" ? payload.content : "",
    attachments: asRecord(payload.attachments),
    metadata: {
      ...payloadMetadata,
      ...asRecord(row.metadata),
      storage: "enoch_artifacts_fallback"
    },
    createdAt: normalizeIsoDateTime(asNullableString(payload.createdAt) ?? row.created_at)
  });
};

const resolveOptionalOwnerUserId = async (client: SupabaseClient, preferredUserId?: string | null) => {
  if (preferredUserId?.trim()) {
    const { data, error } = await client.from("users").select("id").eq("id", preferredUserId).maybeSingle();
    if (!error && data?.id) {
      return data.id as string;
    }
  }

  const configuredOperatorId = getSupabaseConfig().CONTENT_ENGINE_OPERATOR_USER_ID;
  if (configuredOperatorId?.trim()) {
    const { data, error } = await client.from("users").select("id").eq("id", configuredOperatorId).maybeSingle();
    if (!error && data?.id) {
      return data.id as string;
    }
  }

  const { data, error } = await client.from("users").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error || !data?.id) {
    return null;
  }

  return data.id as string;
};

const listFallbackAssistantSessions = async (
  client: SupabaseClient,
  input?: {
    projectId?: string;
    limit?: number;
  }
) => {
  let query = client
    .from("enoch_runs")
    .select("*")
    .eq("workflow_kind", FALLBACK_SESSION_WORKFLOW_KIND)
    .order("updated_at", { ascending: false })
    .limit(input?.limit ?? 24);

  if (input?.projectId) {
    query = query.eq("project_id", input.projectId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list fallback Enoch assistant sessions: ${error.message}`);
  }

  return ((data ?? []) as EnochRunRow[]).map(toFallbackAssistantSession);
};

const getFallbackAssistantSession = async (client: SupabaseClient, sessionId: string) => {
  const { data, error } = await client
    .from("enoch_runs")
    .select("*")
    .eq("id", sessionId)
    .eq("workflow_kind", FALLBACK_SESSION_WORKFLOW_KIND)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load fallback Enoch assistant session: ${error.message}`);
  }

  return data ? toFallbackAssistantSession(data as EnochRunRow) : null;
};

const getFallbackAssistantSessionMessages = async (client: SupabaseClient, sessionId: string) => {
  const { data, error } = await client
    .from("enoch_artifacts")
    .select("*")
    .eq("run_id", sessionId)
    .eq("artifact_type", FALLBACK_MESSAGE_ARTIFACT_TYPE)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load fallback Enoch assistant messages: ${error.message}`);
  }

  return ((data ?? []) as EnochArtifactRow[]).map(toFallbackAssistantMessage);
};

const createFallbackAssistantSession = async (
  client: SupabaseClient,
  input?: CreateEnochAssistantSessionInput
) => {
  const now = new Date().toISOString();
  const ownerUserId = await resolveOptionalOwnerUserId(client, input?.ownerUserId);
  const session = enochAssistantSessionSchema.parse({
    id: randomUUID(),
    ownerUserId,
    projectId: input?.projectId ?? null,
    title: input?.title?.trim() || "New conversation",
    generatedLabel: input?.generatedLabel?.trim() || null,
    summary: input?.summary?.trim() || null,
    contextSnapshot: input?.contextSnapshot ?? {},
    metadata: {
      ...(input?.metadata ?? {}),
      storage: "enoch_runs_fallback"
    },
    lastMessageAt: null,
    createdAt: now,
    updatedAt: now
  });

  const { data, error } = await client
    .from("enoch_runs")
    .insert({
      id: session.id,
      tenant_id: enochCompatibilityTenantId,
      project_id: session.projectId ?? null,
      parent_run_id: null,
      workflow_kind: FALLBACK_SESSION_WORKFLOW_KIND,
      workflow_version: FALLBACK_SESSION_WORKFLOW_VERSION,
      entrypoint: FALLBACK_SESSION_ENTRYPOINT,
      status: FALLBACK_SESSION_STATUS,
      current_stage: FALLBACK_SESSION_STAGE,
      requested_start_stage: null,
      state_version: FALLBACK_SESSION_STATE_VERSION,
      graph_thread_id: session.id,
      input_ref: null,
      output_refs: [],
      state_snapshot: buildFallbackSessionState(session),
      error_message: null,
      started_at: now,
      completed_at: null,
      metadata: {
        ...session.metadata,
        ownerUserId: session.ownerUserId ?? null
      }
    })
    .select("*")
    .single();

  return toFallbackAssistantSession(assertData(data as EnochRunRow | null, error, "Failed to create fallback Enoch assistant session"));
};

const updateFallbackAssistantSession = async (
  client: SupabaseClient,
  sessionId: string,
  updates: UpdateEnochAssistantSessionInput
) => {
  const current = await getFallbackAssistantSession(client, sessionId);
  if (!current) {
    throw new Error("Fallback Enoch assistant session not found.");
  }

  const nextSession = enochAssistantSessionSchema.parse({
    ...current,
    title: "title" in updates ? updates.title?.trim() || "New conversation" : current.title,
    projectId: "projectId" in updates ? updates.projectId ?? null : current.projectId,
    generatedLabel: "generatedLabel" in updates ? updates.generatedLabel?.trim() || null : current.generatedLabel,
    summary: "summary" in updates ? updates.summary?.trim() || null : current.summary,
    contextSnapshot: "contextSnapshot" in updates ? updates.contextSnapshot ?? {} : current.contextSnapshot,
    metadata: "metadata" in updates ? updates.metadata ?? {} : current.metadata,
    lastMessageAt: "lastMessageAt" in updates ? updates.lastMessageAt ?? null : current.lastMessageAt,
    updatedAt: new Date().toISOString()
  });

  const { data, error } = await client
    .from("enoch_runs")
    .update({
      project_id: nextSession.projectId ?? null,
      status: FALLBACK_SESSION_STATUS,
      current_stage: FALLBACK_SESSION_STAGE,
      state_snapshot: buildFallbackSessionState(nextSession),
      metadata: {
        ...nextSession.metadata,
        ownerUserId: nextSession.ownerUserId ?? null
      }
    })
    .eq("id", sessionId)
    .eq("workflow_kind", FALLBACK_SESSION_WORKFLOW_KIND)
    .select("*")
    .single();

  return toFallbackAssistantSession(assertData(data as EnochRunRow | null, error, "Failed to update fallback Enoch assistant session"));
};

const appendFallbackAssistantMessage = async (
  client: SupabaseClient,
  input: CreateEnochAssistantMessageInput
) => {
  const now = new Date().toISOString();
  const message = enochAssistantMessageSchema.parse({
    id: randomUUID(),
    sessionId: input.sessionId,
    projectId: input.projectId ?? null,
    role: input.role,
    kind: input.kind ?? "message",
    content: input.content,
    attachments: input.attachments ?? {},
    metadata: {
      ...(input.metadata ?? {}),
      storage: "enoch_artifacts_fallback"
    },
    createdAt: now
  });

  const { data, error } = await client
    .from("enoch_artifacts")
    .insert({
      id: message.id,
      tenant_id: enochCompatibilityTenantId,
      run_id: message.sessionId,
      project_id: message.projectId ?? null,
      artifact_type: FALLBACK_MESSAGE_ARTIFACT_TYPE,
      artifact_role: "working",
      status: "completed",
      schema_name: FALLBACK_MESSAGE_SCHEMA_NAME,
      schema_version: FALLBACK_SESSION_WORKFLOW_VERSION,
      content_ref: null,
      content_json: {
        sessionId: message.sessionId,
        projectId: message.projectId,
        role: message.role,
        kind: message.kind,
        content: message.content,
        attachments: message.attachments,
        metadata: message.metadata,
        createdAt: message.createdAt
      },
      storage_provider: null,
      storage_bucket: null,
      storage_key: null,
      checksum: null,
      error_message: null,
      metadata: {
        source: "enoch_assistant_fallback",
        role: message.role,
        kind: message.kind
      }
    })
    .select("*")
    .single();

  await updateFallbackAssistantSession(client, input.sessionId, {
    projectId: input.projectId ?? null,
    lastMessageAt: message.createdAt
  });

  return toFallbackAssistantMessage(
    assertData(data as EnochArtifactRow | null, error, "Failed to append fallback Enoch assistant message")
  );
};

const updateFallbackAssistantMessage = async (
  client: SupabaseClient,
  messageId: string,
  updates: UpdateEnochAssistantMessageInput
) => {
  const { data: currentData, error: currentError } = await client
    .from("enoch_artifacts")
    .select("*")
    .eq("id", messageId)
    .eq("artifact_type", FALLBACK_MESSAGE_ARTIFACT_TYPE)
    .maybeSingle();

  const current = currentData ? toFallbackAssistantMessage(currentData as EnochArtifactRow) : null;
  if (currentError) {
    throw new Error(`Failed to load fallback Enoch assistant message: ${currentError.message}`);
  }

  if (!current) {
    throw new Error("Fallback Enoch assistant message not found.");
  }

  const nextMessage = enochAssistantMessageSchema.parse({
    ...current,
    kind: "kind" in updates ? updates.kind ?? "message" : current.kind,
    content: "content" in updates ? updates.content ?? "" : current.content,
    attachments: "attachments" in updates ? updates.attachments ?? {} : current.attachments,
    metadata: "metadata" in updates ? updates.metadata ?? {} : current.metadata
  });

  const { data, error } = await client
    .from("enoch_artifacts")
    .update({
      content_json: {
        sessionId: nextMessage.sessionId,
        projectId: nextMessage.projectId,
        role: nextMessage.role,
        kind: nextMessage.kind,
        content: nextMessage.content,
        attachments: nextMessage.attachments,
        metadata: nextMessage.metadata,
        createdAt: nextMessage.createdAt
      },
      metadata: {
        source: "enoch_assistant_fallback",
        role: nextMessage.role,
        kind: nextMessage.kind
      }
    })
    .eq("id", messageId)
    .eq("artifact_type", FALLBACK_MESSAGE_ARTIFACT_TYPE)
    .select("*")
    .single();

  return toFallbackAssistantMessage(
    assertData(data as EnochArtifactRow | null, error, "Failed to update fallback Enoch assistant message")
  );
};

export const listEnochAssistantSessions = async (
  input?: {
    projectId?: string;
    limit?: number;
  },
  options?: { client?: SupabaseClient }
) => {
  const client = options?.client ?? createServiceSupabaseClient();

  try {
    let query = client
      .from("enoch_chat_sessions")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(input?.limit ?? 24);

    if (input?.projectId) {
      query = query.eq("project_id", input.projectId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to list Enoch assistant sessions: ${error.message}`);
    }

    return ((data ?? []) as EnochChatSessionRow[]).map(toAssistantSession);
  } catch (error) {
    if (!isMissingAssistantStorageError(error)) {
      throw error;
    }

    return listFallbackAssistantSessions(client, input);
  }
};

export const getEnochAssistantSession = async (sessionId: string, options?: { client?: SupabaseClient }) => {
  const client = options?.client ?? createServiceSupabaseClient();

  try {
    const { data, error } = await client.from("enoch_chat_sessions").select("*").eq("id", sessionId).maybeSingle();

    if (error) {
      throw new Error(`Failed to load Enoch assistant session: ${error.message}`);
    }

    return data ? toAssistantSession(data as EnochChatSessionRow) : null;
  } catch (error) {
    if (!isMissingAssistantStorageError(error)) {
      throw error;
    }

    return getFallbackAssistantSession(client, sessionId);
  }
};

export const getEnochAssistantSessionDetail = async (sessionId: string, options?: { client?: SupabaseClient }) => {
  const client = options?.client ?? createServiceSupabaseClient();

  try {
    const [session, messageResult] = await Promise.all([
      getEnochAssistantSession(sessionId, { client }),
      client.from("enoch_chat_messages").select("*").eq("session_id", sessionId).order("created_at", { ascending: true })
    ]);

    if (!session) {
      return null;
    }

    if (messageResult.error) {
      throw new Error(`Failed to load Enoch assistant messages: ${messageResult.error.message}`);
    }

    return {
      session,
      messages: ((messageResult.data ?? []) as EnochChatMessageRow[]).map(toAssistantMessage)
    } satisfies EnochAssistantSessionDetail;
  } catch (error) {
    if (!isMissingAssistantStorageError(error)) {
      throw error;
    }

    const session = await getFallbackAssistantSession(client, sessionId);
    if (!session) {
      return null;
    }

    return {
      session,
      messages: await getFallbackAssistantSessionMessages(client, sessionId)
    } satisfies EnochAssistantSessionDetail;
  }
};

export const createEnochAssistantSession = async (
  input?: CreateEnochAssistantSessionInput,
  options?: { client?: SupabaseClient }
) => {
  const client = options?.client ?? createServiceSupabaseClient();
  const ownerUserId = await resolveOptionalOwnerUserId(client, input?.ownerUserId);

  try {
    const { data, error } = await client
      .from("enoch_chat_sessions")
      .insert({
        owner_user_id: ownerUserId,
        project_id: input?.projectId ?? null,
        title: input?.title?.trim() || "New conversation",
        generated_label: input?.generatedLabel?.trim() || null,
        summary: input?.summary?.trim() || null,
        context_snapshot: input?.contextSnapshot ?? {},
        metadata: input?.metadata ?? {},
        last_message_at: null
      })
      .select("*")
      .single();

    return toAssistantSession(assertData(data as EnochChatSessionRow | null, error, "Failed to create Enoch assistant session"));
  } catch (error) {
    if (!isMissingAssistantStorageError(error)) {
      throw error;
    }

    return createFallbackAssistantSession(client, {
      ...input,
      ownerUserId
    });
  }
};

export const updateEnochAssistantSession = async (
  sessionId: string,
  updates: UpdateEnochAssistantSessionInput,
  options?: { client?: SupabaseClient }
) => {
  const client = options?.client ?? createServiceSupabaseClient();

  try {
    const payload: Record<string, unknown> = {};

    if ("title" in updates) payload.title = updates.title?.trim() || "New conversation";
    if ("projectId" in updates) payload.project_id = updates.projectId ?? null;
    if ("generatedLabel" in updates) payload.generated_label = updates.generatedLabel?.trim() || null;
    if ("summary" in updates) payload.summary = updates.summary?.trim() || null;
    if ("contextSnapshot" in updates) payload.context_snapshot = updates.contextSnapshot ?? {};
    if ("metadata" in updates) payload.metadata = updates.metadata ?? {};
    if ("lastMessageAt" in updates) payload.last_message_at = updates.lastMessageAt ?? null;

    const { data, error } = await client.from("enoch_chat_sessions").update(payload).eq("id", sessionId).select("*").single();
    return toAssistantSession(assertData(data as EnochChatSessionRow | null, error, "Failed to update Enoch assistant session"));
  } catch (error) {
    if (!isMissingAssistantStorageError(error)) {
      throw error;
    }

    return updateFallbackAssistantSession(client, sessionId, updates);
  }
};

export const appendEnochAssistantMessage = async (
  input: CreateEnochAssistantMessageInput,
  options?: { client?: SupabaseClient }
) => {
  const client = options?.client ?? createServiceSupabaseClient();

  try {
    const { data, error } = await client
      .from("enoch_chat_messages")
      .insert({
        session_id: input.sessionId,
        project_id: input.projectId ?? null,
        role: input.role,
        kind: input.kind ?? "message",
        content: input.content,
        attachments: input.attachments ?? {},
        metadata: input.metadata ?? {}
      })
      .select("*")
      .single();

    const message = toAssistantMessage(assertData(data as EnochChatMessageRow | null, error, "Failed to append Enoch assistant message"));

    await updateEnochAssistantSession(
      input.sessionId,
      {
        projectId: input.projectId ?? null,
        lastMessageAt: message.createdAt
      },
      { client }
    );

    return message;
  } catch (error) {
    if (!isMissingAssistantStorageError(error)) {
      throw error;
    }

    return appendFallbackAssistantMessage(client, input);
  }
};

export const updateEnochAssistantMessage = async (
  messageId: string,
  updates: UpdateEnochAssistantMessageInput,
  options?: { client?: SupabaseClient }
) => {
  const client = options?.client ?? createServiceSupabaseClient();

  try {
    const payload: Record<string, unknown> = {};

    if ("kind" in updates) payload.kind = updates.kind ?? "message";
    if ("content" in updates) payload.content = updates.content ?? "";
    if ("attachments" in updates) payload.attachments = updates.attachments ?? {};
    if ("metadata" in updates) payload.metadata = updates.metadata ?? {};

    const { data, error } = await client.from("enoch_chat_messages").update(payload).eq("id", messageId).select("*").single();
    return toAssistantMessage(assertData(data as EnochChatMessageRow | null, error, "Failed to update Enoch assistant message"));
  } catch (error) {
    if (!isMissingAssistantStorageError(error)) {
      throw error;
    }

    return updateFallbackAssistantMessage(client, messageId, updates);
  }
};
