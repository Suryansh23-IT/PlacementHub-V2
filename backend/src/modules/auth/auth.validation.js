import { z } from 'zod'
import { USER_ROLES } from './auth.constants.js'

const passwordSchema = z.string().min(8, 'Password must contain at least 8 characters.').max(72, 'Password must contain at most 72 characters.')

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must contain at least 2 characters.').max(120),
  email: z.string().trim().email('Enter a valid email address.').transform((email) => email.toLowerCase()),
  password: passwordSchema,
  role: z.enum(Object.values(USER_ROLES)).default(USER_ROLES.STUDENT),
  adminBootstrapSecret: z.string().min(1).optional(),
})

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').transform((email) => email.toLowerCase()),
  password: passwordSchema,
})
