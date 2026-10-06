import { sendSuccess } from '../../utils/api-response.js'
import { confirmPlacementRecord, createOffCampusPlacement, decidePlacementRecord, getPlacementProof, listMyOffCampusPlacementRecords as listMyOffCampusRecords, listPlacementRecords, savePlacementProof, submitPlacementReport } from './placement-record.service.js'
const publicRecord = record => { const value = record?.toObject ? record.toObject() : record; return { ...value, proof: (value.proof ?? []).map(({ storagePath, ...proof }) => proof) } }
export const submitMyPlacementReport = async (req, res) => sendSuccess(res, { statusCode: 201, message: 'Placement report submitted.', data: await submitPlacementReport(req.user._id, req.params.id, req.body) })
export const listAdminPlacementRecords = async (req, res) => sendSuccess(res, { message: 'Placement outcomes retrieved.', data: await listPlacementRecords(req.query.state) })
export const listMyOffCampusPlacementRecords = async (req, res) => sendSuccess(res, { message: 'Off-campus placement outcomes retrieved.', data: await listMyOffCampusRecords(req.user._id) })
export const confirmAdminPlacementRecord = async (req, res) => sendSuccess(res, { message: 'Placement outcome confirmed.', data: await confirmPlacementRecord(req.user._id, req.params.id, req.body) })
export const decideAdminPlacementRecord = async (req, res) => sendSuccess(res, { message: 'Placement outcome updated.', data: await decidePlacementRecord(req.user._id, req.params.id, req.body.action, req.body.reason) })
export const createAdminOffCampusPlacement = async (req, res) => sendSuccess(res, { statusCode: 201, message: 'Off-campus placement recorded.', data: await createOffCampusPlacement(req.user._id, req.body) })
export const uploadMyPlacementProof = async (req, res) => sendSuccess(res, { statusCode: 201, message: 'Placement proof uploaded.', data: publicRecord(await savePlacementProof(req.user._id, req.params.id, req.file)) })
export const downloadMyPlacementProof = async (req, res) => { const file = await getPlacementProof(req.user._id, req.params.id, req.params.proofIndex); return res.download(file.storagePath, file.originalName) }
export const downloadAdminPlacementProof = async (req, res) => { const file = await getPlacementProof(req.user._id, req.params.id, req.params.proofIndex, { isAdmin: true }); return res.download(file.storagePath, file.originalName) }
