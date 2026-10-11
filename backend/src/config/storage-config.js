import { z } from 'zod'

const optionalValue = schema => z.preprocess(value => value === '' ? undefined : value, schema.optional())
const projectUrl = z.string().url().refine(value => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && ['/', ''].includes(url.pathname)
  } catch { return false }
}, 'SUPABASE_URL must be an HTTPS project origin without credentials, path, query or fragment.')

export const storageEnvironmentShape = {
  STORAGE_PROVIDER: z.enum(['local', 'supabase']).optional(),
  SUPABASE_URL: optionalValue(projectUrl),
  SUPABASE_SECRET_KEY: optionalValue(z.string().regex(/^sb_secret_[A-Za-z0-9_-]{20,}$/, 'Use a backend Supabase secret API key.')),
  SUPABASE_STORAGE_BUCKET: z.literal('placementhub-2027').default('placementhub-2027'),
  STORAGE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
}

export function selectedStorageProvider(config) {
  return config.STORAGE_PROVIDER ?? (config.NODE_ENV === 'production' ? 'supabase' : 'local')
}

export function validateStorageEnvironment(config, context) {
  const provider = selectedStorageProvider(config)
  const issue = (field, message) => context.addIssue({ code: 'custom', path: [field], message })
  if (config.NODE_ENV === 'production') {
    if (provider !== 'supabase') issue('STORAGE_PROVIDER', 'Production requires private Supabase Storage; local fallback is forbidden.')
    let databasePath
    try { databasePath = new URL(config.MONGO_URI).pathname } catch { /* Report below without including the URI. */ }
    if (databasePath !== '/placementhub-v2-demo-2027') issue('MONGO_URI', 'Production storage requires the current 2027 database.')
  } else if (provider !== 'local') {
    issue('STORAGE_PROVIDER', 'Development and test runtimes must retain local filesystem storage.')
  }
  if (provider === 'supabase') {
    if (!config.SUPABASE_URL) issue('SUPABASE_URL', 'Supabase Storage requires an HTTPS project URL.')
    if (!config.SUPABASE_SECRET_KEY) issue('SUPABASE_SECRET_KEY', 'Supabase Storage requires a backend secret API key.')
  }
}

// Pure configuration parsing: importing this module never loads .env or connects to a service.
export const storageConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGO_URI: z.string().optional(),
  RESUME_UPLOAD_DIR: z.string().trim().min(1).default('uploads/resumes'),
  SOCIAL_UPLOAD_DIR: z.string().trim().min(1).default('uploads/community-2027'),
  RESUME_MAX_FILE_SIZE_BYTES: z.coerce.number().int().min(1).max(10 * 1024 * 1024).default(5 * 1024 * 1024),
  SOCIAL_IMAGE_MAX_BYTES: z.coerce.number().int().min(1).max(10 * 1024 * 1024).default(5 * 1024 * 1024),
  ...storageEnvironmentShape,
}).superRefine(validateStorageEnvironment).transform(config => ({ ...config, STORAGE_PROVIDER: selectedStorageProvider(config) }))
