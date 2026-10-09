import { z } from 'zod'
const text = max => z.string().trim().max(max).optional()
const tags = z.array(z.string().trim().min(1).max(100)).max(12).optional()
const url = z.string().trim().max(500).refine(value => { if (!value) return true; try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password } catch { return false } }, 'Use a safe HTTP(S) URL.').optional()
export const personalityTypes = ['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP']
const common = { headline: text(160), bio: text(1200), removeImage: z.preprocess(v => v === 'true' ? true : v === 'false' ? false : v, z.boolean().optional()) }
const contact = { representativeName: text(120), designation: text(120), publicEmail: z.union([z.literal(''), z.string().trim().email().max(200)]).optional(), publicPhone: z.string().trim().max(40).regex(/^[+\d ().-]*$/, 'Use a phone number.').optional(), representativeNote: text(300) }
export const socialProfileSchemas = {
  student: z.object({ ...common, hobbies: tags, interests: tags, softSkills: tags, personalityType: z.enum(['', ...personalityTypes]).optional(), achievementHighlights: z.array(z.string().trim().min(1).max(240)).max(6).optional(), clubs: tags, extracurriculars: tags, volunteering: tags, languages: tags, currentlyLearning: tags, lookingToExplore: tags, links: z.object({ linkedin: url, github: url, portfolio: url, codingProfile: url }).strict().optional() }).strict(),
  company: z.object({ ...common, ...contact, companyName: z.string().trim().min(1).max(180).optional(), industry: text(120), location: text(160), website: url, hiringDomains: tags }).strict(),
  placement_admin: z.object({ ...common, ...contact }).strict(),
}
export const socialProfileBodySchema = z.preprocess(value => {
  if (!value || typeof value !== 'object') return value
  const result = { ...value }
  for (const key of ['hobbies','interests','softSkills','achievementHighlights','clubs','extracurriculars','volunteering','languages','currentlyLearning','lookingToExplore','hiringDomains','links']) if (typeof result[key] === 'string') { try { result[key] = JSON.parse(result[key]) } catch { /* Schema rejects malformed JSON. */ } }
  return result
}, z.union(Object.values(socialProfileSchemas)))
