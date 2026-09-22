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
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(60_000).default(900_000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(3).max(100).default(10),
  RESUME_UPLOAD_DIR: z.string().trim().min(1).default('uploads/resumes'),
  RESUME_MAX_FILE_SIZE_BYTES: z.coerce.number().int().min(1).max(10 * 1024 * 1024).default(5 * 1024 * 1024),
})

const parsedEnvironment = environmentSchema.safeParse(process.env)

if (!parsedEnvironment.success) {
  console.error('Invalid environment configuration:', parsedEnvironment.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsedEnvironment.data
