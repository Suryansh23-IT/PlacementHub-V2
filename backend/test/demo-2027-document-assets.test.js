import assert from 'node:assert/strict'
import test from 'node:test'
import { CANONICAL_COMPANY_DOCUMENTS, CANONICAL_DRIVE_DOCUMENT_MAPPINGS, CANONICAL_STUDENT_RESUME_DOCUMENTS, resolveDemo2027AssetPath, validateDemo2027DocumentAssets } from '../data/demo-2027-m9/document-assets.js'

test('M9A maps all portable student resumes, company PDFs, and drive documents deterministically', () => {
  const result = validateDemo2027DocumentAssets()
  assert.deepEqual(result, { studentResumeCount: 60, companyDocumentCount: 15, driveDocumentMappingCount: 6 })
  assert.equal(CANONICAL_STUDENT_RESUME_DOCUMENTS[0].relativePath, 'student-resumes/BM_01_Aarav_Mehta_Resume.pdf')
  assert.equal(CANONICAL_STUDENT_RESUME_DOCUMENTS.find((document) => document.studentSourceId === 'DEMO2027-IT-36').relativePath, 'student-resumes/IT_01_Suyash_Ghilahare_Resume.pdf')
  assert.equal(CANONICAL_COMPANY_DOCUMENTS.filter((document) => document.companyKey === 'forgeline-industrial-engineering').length, 3)
  assert.equal(CANONICAL_DRIVE_DOCUMENT_MAPPINGS.filter((mapping) => mapping.companyKey === 'forgeline-industrial-engineering').length, 2)
})

test('M9A document validation rejects missing, duplicate, and unknown asset mappings', () => {
  assert.throws(() => validateDemo2027DocumentAssets({ exists: (resolved) => !resolved.endsWith('BM_01_Aarav_Mehta_Resume.pdf') }), /Missing resume asset/)
  assert.throws(() => validateDemo2027DocumentAssets({ exists: (resolved) => !resolved.endsWith('Nexora_Digital_Labs_01_Company_Profile.pdf') }), /Missing company asset/)
  const duplicatedStudents = CANONICAL_STUDENT_RESUME_DOCUMENTS.map((document) => ({ ...document }))
  duplicatedStudents[1] = { ...duplicatedStudents[1], studentSourceId: duplicatedStudents[0].studentSourceId }
  assert.throws(() => validateDemo2027DocumentAssets({ studentDocuments: duplicatedStudents }), /unique students/)
  const duplicatedCompanies = CANONICAL_COMPANY_DOCUMENTS.map((document) => ({ ...document }))
  duplicatedCompanies[1] = { ...duplicatedCompanies[1], documentType: duplicatedCompanies[0].documentType }
  assert.throws(() => validateDemo2027DocumentAssets({ companyDocuments: duplicatedCompanies }), /unique company\/type pairs/)
  const unknownStudents = CANONICAL_STUDENT_RESUME_DOCUMENTS.map((document) => ({ ...document }))
  unknownStudents[0] = { ...unknownStudents[0], studentSourceId: 'DEMO2027-UNKNOWN-00' }
  assert.throws(() => validateDemo2027DocumentAssets({ studentDocuments: unknownStudents }), /unknown student/)
  const unknownCompanies = CANONICAL_COMPANY_DOCUMENTS.map((document) => ({ ...document }))
  unknownCompanies[0] = { ...unknownCompanies[0], companyKey: 'unknown-company' }
  assert.throws(() => validateDemo2027DocumentAssets({ companyDocuments: unknownCompanies }), /unknown company/)
})

test('M9A document paths cannot escape the repository demo-data directory', () => {
  assert.throws(() => resolveDemo2027AssetPath('../historical-seeds/not-owned.pdf'), /escapes/)
  assert.throws(() => resolveDemo2027AssetPath('C:\\outside\\not-owned.pdf'), /relative paths/)
  const escapedStudents = CANONICAL_STUDENT_RESUME_DOCUMENTS.map((document) => ({ ...document }))
  escapedStudents[0] = { ...escapedStudents[0], relativePath: '../outside.pdf' }
  assert.throws(() => validateDemo2027DocumentAssets({ studentDocuments: escapedStudents }), /escapes/)
})

test('M9A drive mappings reject unknown drives and cross-company document swaps', () => {
  const unknown = CANONICAL_DRIVE_DOCUMENT_MAPPINGS.map((mapping) => ({ ...mapping }))
  unknown[0] = { ...unknown[0], driveKey: 'unknown-drive' }
  assert.throws(() => validateDemo2027DocumentAssets({ driveMappings: unknown }), /unknown drive/)
  const swapped = CANONICAL_DRIVE_DOCUMENT_MAPPINGS.map((mapping) => ({ ...mapping }))
  swapped[0] = { ...swapped[0], jobDescriptionPath: swapped[1].jobDescriptionPath }
  assert.throws(() => validateDemo2027DocumentAssets({ driveMappings: swapped }), /non-deterministic/)
})
