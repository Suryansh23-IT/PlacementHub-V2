import { API_URL, apiRequest } from './api-client.js'
const headers = (token) => ({ Authorization: `Bearer ${token}` })
export const getMyCompany = (token) => apiRequest('/companies/me', { headers: headers(token) })
export const updateMyCompany = (token, input) => apiRequest('/companies/me', { method: 'PATCH', headers: headers(token), body: JSON.stringify(input) })
export const resubmitMyCompany = (token) => apiRequest('/companies/me/approval/resubmit', { method: 'POST', headers: headers(token) })
export const uploadParticipationLetter=(token,file)=>{const body=new FormData();body.append('letter',file);return apiRequest('/companies/me/participation-letter',{method:'POST',headers:headers(token),body})}
export const downloadParticipationLetter=async(token)=>{const r=await fetch(`${API_URL}/companies/me/participation-letter/download`,{headers:headers(token)});if(!r.ok)throw new Error((await r.json().catch(()=>null))?.message??'The letter could not be downloaded.');return r.blob()}
export const getCompanies = (token) => apiRequest('/admin/companies', { headers: headers(token) })
export const downloadAdminParticipationLetter = async (token, id) => {
  const response = await fetch(`${API_URL}/admin/companies/${encodeURIComponent(id)}/participation-letter/download`, { headers: headers(token) })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? 'The letter could not be downloaded.')
  return response.blob()
}
export const reviewCompany = (token, id, input) => apiRequest(`/admin/companies/${id}/approval`, { method: 'PATCH', headers: headers(token), body: JSON.stringify(input) })
export const getInstitution = (token) => apiRequest('/admin/institution', { headers: headers(token) })
export const updateInstitution = (token, input) => apiRequest('/admin/institution', { method: 'PATCH', headers: headers(token), body: JSON.stringify(input) })
