import { z } from 'zod'

const passwordSchema = z.string().min(8, 'Password must contain at least 8 characters.').max(72)

export const loginFormSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: passwordSchema,
})

export const registerFormSchema = loginFormSchema.extend({
  name: z.string().trim().min(2, 'Name must contain at least 2 characters.').max(120),
  role: z.enum(['student', 'company']),
  confirmPassword: passwordSchema,
}).refine((values) => values.password === values.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
})
