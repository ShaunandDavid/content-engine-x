import { z } from "zod";

export const supabaseConfigSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  CONTENT_ENGINE_OPERATOR_USER_ID: z.string().uuid().optional()
});

export type SupabaseConfig = z.infer<typeof supabaseConfigSchema>;

export const getSupabaseConfig = (env: NodeJS.ProcessEnv = process.env): SupabaseConfig =>
  supabaseConfigSchema.parse(env);
