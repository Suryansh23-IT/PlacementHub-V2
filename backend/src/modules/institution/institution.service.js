import { InstitutionProfile } from './institution.model.js'

const singletonKey = 'placementhub-v2'

export async function getInstitutionProfile({ institutionModel = InstitutionProfile } = {}) {
  const profile = await institutionModel.findOne({ singletonKey })
  if (profile) return profile
  // Preserve schema defaults for an unconfigured institution without inserting
  // a record, generating a public ID, or updating timestamps during a read.
  const fallback = new InstitutionProfile({ singletonKey }).toObject()
  delete fallback._id
  return fallback
}

export async function updateInstitutionProfile(input, { institutionModel = InstitutionProfile } = {}) {
  return institutionModel.findOneAndUpdate(
    { singletonKey },
    { $set: input, $setOnInsert: { singletonKey } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true, runValidators: true },
  )
}
