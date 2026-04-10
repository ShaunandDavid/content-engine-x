import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EnochAssistantMessage,
  EnochAssistantMessageKind,
  EnochAssistantMessageRole,
  EnochAssistantSession
} from "@content-engine/shared";
import { enochAssistantMessageSchema, enochAssistantSessionSchema } from "@content-engine/shared";

import { createServiceSupabaseClient } from "./client.js";
import { getSupabaseConfig } from "./config.js";

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

const assertData = <T>(data: T | null, error: { message: string } | null, context: string): T => {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }

  if (!data) {
    throw new Error(`${context}: expected data.`);
  }

  return data;
};

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
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
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
    createdAt: row.created_at
  });

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

export const listEnochAssistantSessions = async (
  input?: {
    projectId?: string;
    limit?: number;
  },
  options?: { client?: SupabaseClient }
) => {
  const client = options?.client ?? createServiceSupabaseClient();
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
};

export const getEnochAssistantSession = async (sessionId: string, options?: { client?: SupabaseClient }) => {
  const client = options?.client ?? createServiceSupabaseClient();
  const { data, error } = await client.from("enoch_chat_sessions").select("*").eq("id", sessionId).maybeSingle();

  if (error) {
    throw new Error(`Failed to load Enoch assistant session: ${error.message}`);
  }

  return data ? toAssistantSession(data as EnochChatSessionRow) : null;
};

export const getEnochAssistantSessionDetail = async (sessionId: string, options?: { client?: SupabaseClient }) => {
  const client = options?.client ?? createServiceSupabaseClient();
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
};

export const createEnochAssistantSession = async (
  input?: CreateEnochAssistantSessionInput,
  options?: { client?: SupabaseClient }
) => {
  const client = options?.client ?? createServiceSupabaseClient();
  const ownerUserId = await resolveOptionalOwnerUserId(client, input?.ownerUserId);

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
};

export const updateEnochAssistantSession = async (
  sessionId: string,
  updates: UpdateEnochAssistantSessionInput,
  options?: { client?: SupabaseClient }
) => {
  const client = options?.client ?? createServiceSupabaseClient();
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
};

export const appendEnochAssistantMessage = async (
  input: CreateEnochAssistantMessageInput,
  options?: { client?: SupabaseClient }
) => {
  const client = options?.client ?? createServiceSupabaseClient();
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
};

export const updateEnochAssistantMessage = async (
  messageId: string,
  updates: UpdateEnochAssistantMessageInput,
  options?: { client?: SupabaseClient }
) => {
    const client = options?.client ?? createServiceSupabaseClient();
    const payload: Record<string, unknown> = {};

    if ("kind" in updates) payload.kind = updates.kind ?? "message";
    if ("content" in updates) payload.content = updates.content ?? "";
    if ("attachments" in updates) payload.attachments = updates.attachments ?? {};
    if ("metadata" in updates) payload.metadata = updates.metadata ?? {};

    const { data, error } = await client.from("enoch_chat_messages").update(payload).eq("id", messageId).select("*").single();
    return toAssistantMessage(assertData(data as EnochChatMessageRow | null, error, "Failed to update Enoch assistant message"));
};
