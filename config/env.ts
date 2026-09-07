import "dotenv/config";
import { z } from "zod";

const logLevels = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;

const schema = z.object({
  HELPICAL_BASE_URL: z
    .url()
    .transform((value) => (value.endsWith("/") ? value : `${value}/`)),
  HELPICAL_USERNAME: z.string().min(1),
  HELPICAL_PASSWORD: z.string().min(1),
  TODO_LIST_NAME: z.string().min(1).default("Helpical Tickets"),
  POLL_INTERVAL_MINUTES: z.coerce.number().int().positive().default(5),
  DATABASE_PATH: z.string().min(1).default("storage/helpical.sqlite3"),
  LOG_LEVEL: z.enum(logLevels).default("info"),
  MICROSOFT_CLIENT_ID: z.string().min(1),
  MICROSOFT_TENANT_ID: z.string().min(1).default("common"),
  MICROSOFT_TOKEN_CACHE_PATH: z
    .string()
    .min(1)
    .default("storage/msal-token-cache.json"),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const result = schema.safeParse(environment);
  if (!result.success) {
    throw new Error(
      `Invalid environment configuration: ${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
