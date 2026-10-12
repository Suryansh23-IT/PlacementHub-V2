import { createPdfStorage, getPdfStorage, publicPdfMetadata, sendPdfDownload } from '../../storage/pdf-storage.js'

// Preserve the resume API while sharing its proven PDF storage and legacy guards.
export const publicResumeMetadata = publicPdfMetadata
export const createResumeStorage = (input, dependencies = {}) => createPdfStorage(input, 'resume', dependencies)
export const getResumeStorage = () => getPdfStorage('resume')
export const sendResumeDownload = (response, resume, storage = getResumeStorage()) => sendPdfDownload(response, resume, 'resume', storage)
