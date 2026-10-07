import { createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'

export const HISTORICAL_DEMO_PASSWORD = '12345678'
export const historicalBranches = [
  ['Biomedical Engineering', 'BM', 39, 32, 9, 9], ['Biotechnology', 'BT', 41, 36, 24, 21],
  ['Chemical Engineering', 'CH', 68, 63, 63, 55], ['Civil Engineering', 'CE', 67, 57, 62, 56],
  ['Computer Science and Engineering', 'CSE', 115, 92, 85, 70], ['Electrical Engineering', 'EE', 115, 100, 96, 90],
  ['Electronics and Communication Engineering', 'ECE', 114, 100, 57, 50], ['Information Technology', 'IT', 114, 105, 88, 77],
  ['Mechanical Engineering', 'ME', 109, 87, 88, 76], ['Metallurgical and Materials Engineering', 'MME', 108, 90, 74, 68],
  ['Mining Engineering', 'MI', 95, 82, 59, 55],
].map(([branch, code, batchSize, eligible, offers, uniquePlaced]) => ({ branch, code, batchSize, eligible, offers, uniquePlaced, rollPrefix: `22${code}` }))

const firstNames = ['Aarav', 'Aditi', 'Aditya', 'Ananya', 'Arjun', 'Bhavya', 'Dev', 'Diya', 'Ishita', 'Kabir', 'Kavya', 'Kunal', 'Meera', 'Nandini', 'Nikhil', 'Pooja', 'Pranav', 'Raghav', 'Reyansh', 'Riya', 'Rohan', 'Sakshi', 'Shreya', 'Siddharth', 'Sneha', 'Tanvi', 'Varun', 'Vivaan', 'Yash', 'Zoya']
const lastNames = ['Agrawal', 'Banerjee', 'Bose', 'Chatterjee', 'Deshmukh', 'Dubey', 'Ghosh', 'Gupta', 'Iyer', 'Jain', 'Joshi', 'Kapoor', 'Kulkarni', 'Mehta', 'Menon', 'Mishra', 'Nair', 'Nambiar', 'Patel', 'Pradhan', 'Qureshi', 'Rao', 'Reddy', 'Sharma', 'Shetty', 'Singh', 'Sinha', 'Tiwari', 'Verma', 'Yadav']
const skillsByCode = {
  BM: ['Biomedical Instrumentation', 'MATLAB', 'Signal Processing', 'Python'], BT: ['Molecular Biology', 'Bioinformatics', 'Python', 'R'], CH: ['Aspen HYSYS', 'Process Simulation', 'Python', 'Mass Transfer'], CE: ['AutoCAD', 'STAAD.Pro', 'GIS', 'Excel'], CSE: ['Java', 'Python', 'Data Structures', 'SQL'], EE: ['MATLAB', 'Power Systems', 'PLC', 'Python'], ECE: ['Embedded C', 'IoT', 'MATLAB', 'PCB Design'], IT: ['JavaScript', 'React', 'Node.js', 'MongoDB'], ME: ['SolidWorks', 'ANSYS', 'CAD', 'Manufacturing'], MME: ['Materials Characterization', 'Metallurgy', 'MATLAB', 'Python'], MI: ['Mine Planning', 'AutoCAD', 'GIS', 'Safety Management'],
}
const showcaseScenarios = ['early_placed', 'mid_placed', 'late_placed', 'unplaced_many_attempts', 'two_offers', 'three_offers_high_package', 'core_branch_placed', 'off_campus_placed', 'many_rejections', 'absent_history', 'withdrawn_history', 'technical_showcase', 'analytics_showcase', 'company_funnel_showcase', 'policy_ready_showcase']

function digest(value) { return createHash('sha256').update(`NITR-PLACEMENT-2025-26:${value}`).digest('hex') }
function sortedSerials(branch) { return Array.from({ length: branch.batchSize }, (_, index) => index + 1).sort((a, b) => digest(`${branch.code}:${a}`).localeCompare(digest(`${branch.code}:${b}`))) }
function studentName(branch, serial) { const hex = digest(`${branch.code}:${serial}`); return `${firstNames[parseInt(hex.slice(0, 4), 16) % firstNames.length]} ${lastNames[parseInt(hex.slice(4, 8), 16) % lastNames.length]}` }

export function buildHistoricalStudents() {
  const students = historicalBranches.flatMap(branch => new Set(sortedSerials(branch).slice(0, branch.eligible)).values() && sortedSerials(branch).slice(0, branch.eligible).map(serial => {
    const rollNumber = `${branch.rollPrefix}${String(serial).padStart(3, '0')}`
    const email = `${branch.code.toLowerCase()}${String(serial).padStart(3, '0')}@ait.ac.in`
    const grade = parseInt(digest(rollNumber).slice(0, 4), 16)
    return { name: studentName(branch, serial), branch: branch.branch, branchCode: branch.code, rollNumber, email, fullBatchSerial: serial, graduationYear: 2026, verificationStatus: 'verified', cgpa: Number((6.2 + (grade % 360) / 100).toFixed(2)), activeBacklogs: 0, class10Score: 65 + (grade % 31), class12Score: 64 + ((grade >> 2) % 32), skills: skillsByCode[branch.code], policyAcceptanceRequired: true }
  }))
  const ranked = [...students].sort((a, b) => digest(a.rollNumber).localeCompare(digest(b.rollNumber)))
  ranked.slice(0, showcaseScenarios.length).forEach((student, index) => { student.showcaseScenario = showcaseScenarios[index] })
  return students
}

export function summarizeHistoricalStudents(students = buildHistoricalStudents()) {
  return historicalBranches.map(branch => ({ branch: branch.branch, batchSize: branch.batchSize, eligible: students.filter(student => student.branchCode === branch.code).length, offers: branch.offers, uniquePlaced: branch.uniquePlaced, missingRolls: branch.batchSize - students.filter(student => student.branchCode === branch.code).length }))
}

export function normalizeHistoricalCompanyKey(name) {
  return name.toLowerCase().replace(/\b(private|pvt|limited|ltd|incorporated|inc|corporation|corp)\b/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function normalizeHistoricalCompanies(processes) {
  return [...new Map(processes.map(process => {
    const normalizedCompanyKey = process.normalizedCompanyKey || normalizeHistoricalCompanyKey(process.companyName)
    return [normalizedCompanyKey, { companyName: process.companyName, normalizedCompanyKey, email: `${normalizedCompanyKey}@placement.ait.ac.in` }]
  })).values()]
}

export async function hashHistoricalDemoPassword(rounds) { return bcrypt.hash(HISTORICAL_DEMO_PASSWORD, rounds) }
