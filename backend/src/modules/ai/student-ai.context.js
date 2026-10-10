import { fingerprint, safeProfessionalText as text } from './ai.context.js'

// Rich context is deliberately separate from the unchanged objective scorer.
export function enrichStudentContext(safe, drive, company, resume) {
  const context = { ...safe, evidence: [...safe.evidence], resume: { status: resume.status, truncated: Boolean(resume.truncated) } }
  if (resume.status === 'extracted') {
    const data = { text: resume.text }
    context.evidence.push({ id: `resume:${fingerprint(data).slice(0, 24)}`, type: 'resume', data })
  }
  if (drive) {
    const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : undefined
    const strings = values => (Array.isArray(values) ? values : []).slice(0, 15).map(value => text(value, 100)).filter(Boolean).sort()
    context.drive = { ...safe.drive, description: text(drive.role?.description, 2000), employmentType: text(drive.role?.employmentType, 60),
      eligibilityCriteria: { minimumCgpa: finite(drive.eligibility?.minimumCgpa), maximumActiveBacklogs: finite(drive.eligibility?.maximumActiveBacklogs), allowedBranches: strings(drive.eligibility?.allowedBranches), graduationYears: (drive.eligibility?.graduationYears ?? []).filter(value => Number.isInteger(value)).slice(0, 10), additionalRequirements: text(drive.eligibility?.additionalRequirements, 500) },
      roleInformation: { workMode: text(drive.driveDetails?.workMode, 60), workLocation: text(drive.driveDetails?.workLocation, 120), joiningPeriod: text(drive.driveDetails?.joiningPeriod, 120) },
      phases: (drive.phases ?? []).slice(0, 5).map(row => ({ title: text(row.title, 100), type: text(row.type, 60), description: text(row.description, 400) })),
    }
    context.company = { name: text(company?.companyName, 160), industry: text(company?.industry, 100), description: text(company?.description, 1200), hiringDomains: strings(company?.roleDomains), technologies: strings(company?.technologies), productsServices: text(company?.productsServices, 500) }
  }
  return context
}
