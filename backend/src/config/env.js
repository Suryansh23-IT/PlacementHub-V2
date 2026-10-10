import 'dotenv/config'
import { z } from 'zod'

const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGO_URI: z.string().url('MONGO_URI must be a valid MongoDB connection URL.'),
  CLIENT_URL: z.string().url('CLIENT_URL must be a valid URL.').default('http://localhost:5173'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must contain at least 32 characters.'),
  JWT_EXPIRES_IN: z.string().min(1).default('1d'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
  ADMIN_BOOTSTRAP_SECRET: z.string().min(32, 'ADMIN_BOOTSTRAP_SECRET must contain at least 32 characters.').optional(),
  DEMO_2027_STUDENT_PASSWORD: z.string().min(8).optional(),
  DEMO_2027_COMPANY_PASSWORD: z.string().min(8).optional(),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(60_000).default(900_000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(3).max(100).default(10),
  AI_ENABLED: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  AI_PROVIDER: z.literal('ollama').default('ollama'),
  OLLAMA_BASE_URL: z.string().url().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().trim().regex(/^[a-zA-Z0-9._:/-]+$/).default('qwen3.5:4b'),
  OLLAMA_NUM_CTX: z.coerce.number().int().min(4096).max(8192).default(8192),
  AI_TIMEOUT_MS: z.coerce.number().int().min(100).max(180_000).optional(),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(4096).default(2048),
  AI_MAX_RESPONSE_BYTES: z.coerce.number().int().min(1024).max(262144).default(65536),
  AI_MAX_CONTEXT_BYTES: z.coerce.number().int().min(1024).max(65536).default(16384),
  AI_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  AI_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(10),
  AI_MAX_CONCURRENT: z.coerce.number().int().min(1).max(10).default(1),
  AI_BATCH_LIMIT: z.coerce.number().int().min(1).max(20).default(4),
  AI_GROUP_LIMIT: z.coerce.number().int().min(1).max(20).default(4),
  AI_RESUME_CACHE_TTL_MS: z.coerce.number().int().min(1000).max(86400000).default(3600000),
  AI_RESUME_CACHE_MAX_ENTRIES: z.coerce.number().int().min(1).max(500).default(100),
  AI_CACHE_MAX_ENTRIES: z.coerce.number().int().min(1).max(1000).default(100),
  AI_CACHE_TTL_MS: z.coerce.number().int().min(1).max(86400000).default(900_000),
  AI_COOLDOWN_MS: z.coerce.number().int().min(0).max(300_000).default(30_000),
  RESUME_UPLOAD_DIR: z.string().trim().min(1).default('uploads/resumes'),
  SOCIAL_UPLOAD_DIR: z.string().trim().min(1).default('uploads/community-2027'),
  SOCIAL_IMAGE_MAX_BYTES: z.coerce.number().int().min(1).max(10 * 1024 * 1024).default(5 * 1024 * 1024),
  RESUME_MAX_FILE_SIZE_BYTES: z.coerce.number().int().min(1).max(10 * 1024 * 1024).default(5 * 1024 * 1024),
  PLACEMENT_WITHDRAWAL_RESTRICTION_DRIVES: z.coerce.number().int().min(1).max(50).default(5),
})

const parsedEnvironment = environmentSchema.safeParse(process.env)

if (!parsedEnvironment.success) {
  console.error('Invalid environment configuration:', parsedEnvironment.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = { ...parsedEnvironment.data, AI_TIMEOUT_MS: parsedEnvironment.data.AI_TIMEOUT_MS ?? 180_000 }
