import bcrypt from 'bcryptjs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { env } from '../src/config/env.js'
import { USER_ROLES } from '../src/modules/auth/auth.constants.js'
import { User } from '../src/modules/auth/auth.model.js'
import { InstitutionProfile } from '../src/modules/institution/institution.model.js'
import { StudentPolicyAcceptance } from '../src/modules/student-policy/student-policy.model.js'
import { getActivePolicy } from '../src/modules/student-policy/student-policy.service.js'
import { StudentProfile } from '../src/modules/students/student.model.js'
import { DEMO_SEED_KEY, DemoSeedStore } from './demo-seed-store.js'

const PASSWORD = '12345678'; const PER_BRANCH = 5
const pdf = Buffer.from('%PDF-1.4\n% PlacementHub seed document\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n')
const people = [['Aarav Mehta','aarav'],['Diya Sharma','diya'],['Kabir Nair','kabir'],['Meera Iyer','meera'],['Rohan Verma','rohan'],['Ananya Rao','ananya'],['Vivaan Kapoor','vivaan'],['Ishita Singh','ishita'],['Arjun Patel','arjun'],['Kavya Menon','kavya'],['Reyansh Gupta','reyansh'],['Nandini Bose','nandini'],['Siddharth Jain','siddharth'],['Tanvi Kulkarni','tanvi'],['Yash Bansal','yash'],['Aditi Malhotra','aditi'],['Harsh Vardhan','harsh'],['Ritika Deshmukh','ritika'],['Dev Chatterjee','dev'],['Pooja Sinha','pooja'],['Kunal Mishra','kunal'],['Sneha Joshi','sneha'],['Aditya Pradhan','aditya'],['Riya Tiwari','riya'],['Manav Saxena','manav'],['Neha Srivastava','neha'],['Arnav Bhatt','arnav'],['Sakshi Dubey','sakshi'],['Pranav Agrawal','pranav'],['Manya Reddy','manya'],['Nikhil Yadav','nikhil'],['Ira Choudhary','ira'],['Varun Sehgal','varun'],['Ayesha Qureshi','ayesha'],['Dhruv Arora','dhruv'],['Shreya Ghosh','shreya'],['Omkar Patil','omkar'],['Bhavya Nanda','bhavya'],['Tanishq Soni','tanishq'],['Nisha Khatri','nisha'],['Raghav Bedi','raghav'],['Simran Kohli','simran'],['Atharv Shetty','atharv'],['Charu Pillai','charu'],['Lakshya Narang','lakshya'],['Madhav Batra','madhav'],['Esha Lamba','esha'],['Gaurav Bedi','gaurav'],['Palak Madaan','palak'],['Ritesh Bhatia','ritesh'],['Tanya Roy','tanya'],['Vikram Dutta','vikram'],['Jhanvi Pande','jhanvi'],['Rudra Banerjee','rudra'],['Anika Nambiar','anika']]
const specialties = {
  'Information Technology': [['JavaScript','React','Node.js','MongoDB','Git'],'Campus Event Hub','A role-based portal for campus events and registrations.',['React','Node.js','MongoDB']],
  'Computer Science and Engineering': [['Java','Python','Data Structures','SQL','Git'],'Route Optimizer','A shortest-path planner for campus delivery routes.',['Java','Algorithms','SQL']],
  'Electronics and Communication Engineering': [['Embedded C','MATLAB','IoT','Python','PCB Design'],'Wireless Air Quality Monitor','A sensor node that streams indoor air-quality readings.',['ESP32','MQTT','Python']],
  'Electrical Engineering': [['MATLAB','Power Systems','Python','PLC','AutoCAD Electrical'],'Smart Load Monitor','A prototype that tracks classroom power usage and peak-load patterns.',['Python','IoT','Power Systems']],
  'Mechanical Engineering': [['SolidWorks','ANSYS','Python','CAD','Manufacturing'],'Workshop Tool Tracker','A QR-assisted tracker for shared workshop tools and maintenance dates.',['Python','SQLite','QR']],
  'Civil Engineering': [['AutoCAD','STAAD.Pro','GIS','Excel','Python'],'Site Progress Mapper','A GIS view of construction milestones and material delivery status.',['GIS','Python','Excel']],
  'Chemical Engineering': [['Aspen HYSYS','Process Simulation','Python','Excel','Mass Transfer'],'Batch Yield Analyzer','A data tool for reviewing laboratory batch yield and deviation trends.',['Python','Pandas','Excel']],
  Biotechnology: [['Molecular Biology','Python','Bioinformatics','R','Data Analysis'],'Sequence Motif Explorer','A pipeline for identifying recurring motifs in nucleotide sequences.',['Python','Bioinformatics']],
  'Biomedical Engineering': [['Biomedical Instrumentation','MATLAB','Python','Signal Processing','IoT'],'Pulse Oximeter Logger','A prototype logger for pulse and oxygen-saturation readings.',['Arduino','Python','IoT']],
  'Mining Engineering': [['Mine Planning','AutoCAD','GIS','Python','Safety Management'],'Mine Safety Checklist','A mobile-friendly checklist for underground safety observations.',['Python','SQLite','Data Analysis']],
  'Metallurgical and Materials Engineering': [['Materials Characterization','MATLAB','Python','Metallurgy','Data Analysis'],'Alloy Property Explorer','A data explorer for tensile strength and hardness observations.',['Python','Pandas','Visualization']],
}
const variants = [{ cgpa: 9.14, activeBacklogs: 0, status: 'verified', policy: true, note: 'Strong verified profile' }, { cgpa: 7.48, activeBacklogs: 0, status: 'verified', policy: true, note: 'Verified, placement-ready profile' }, { cgpa: 6.08, activeBacklogs: 0, status: 'verified', policy: true, note: 'Low-CGPA eligibility test profile' }, { cgpa: 7.16, activeBacklogs: 1, status: 'verified', policy: true, note: 'Active-backlog eligibility test profile' }, { cgpa: 8.03, activeBacklogs: 0, status: 'verified', policy: true, year: 2028, note: 'Verified profile with graduation-year variation' }]
const meta = (directory, file) => ({ originalName: file, storagePath: path.join(directory, file), mimeType: 'application/pdf', size: pdf.length, uploadedAt: new Date() })
async function makePdf(directory, file) { const value = meta(directory, file); await writeFile(value.storagePath, pdf); return value }

async function seedStudent(branch, branchIndex, studentIndex, passwordHash, directory, policy) {
  const [name, first] = people[branchIndex * PER_BRANCH + studentIndex]; const email = `${first}@gmail.com`; const [skills, title, description, technologies] = specialties[branch] ?? []
  if (!skills) throw new Error(`No branch-aware profile exists for canonical branch: ${branch}`)
  let variation = { ...variants[studentIndex] }
  if (branchIndex === 0 && studentIndex === 4) variation = { ...variation, status: 'pending', policy: false, note: 'Unverified profile edge case' }
  if (branchIndex === 1 && studentIndex === 1) variation = { ...variation, policy: false, note: 'Verified student without policy acceptance' }
  const [resume, collegeResult, class10, class12] = await Promise.all(['resume','college-result','class10','class12'].map(type => makePdf(directory, `${first}-${type}.pdf`)))
  let user
  try {
    user = await User.create({ name, email, passwordHash, role: USER_ROLES.STUDENT })
    await StudentProfile.create({ userId: user._id, branch, cgpa: variation.cgpa, activeBacklogs: variation.activeBacklogs, graduationYear: variation.year ?? 2027, verificationStatus: variation.status, phone: `9${String(700000000 + branchIndex * 10 + studentIndex).slice(-9)}`, rollNumber: `PH27${String(branchIndex + 1).padStart(2, '0')}${String(studentIndex + 1).padStart(2, '0')}`, class10: { board: 'CBSE', schoolName: 'Central Public School', passingYear: 2021, score: 80 + ((branchIndex + studentIndex) % 15), marksheet: class10 }, class12: { board: 'CBSE', schoolName: 'Central Public School', passingYear: 2023, score: 76 + ((branchIndex * 2 + studentIndex) % 18), marksheet: class12 }, semesterSpis: [{ semester: 1, spi: Math.max(5, variation.cgpa - .22) }, { semester: 2, spi: variation.cgpa }], skills, skillGroups: [{ name: 'Core technical skills', skills: skills.slice(0, 3) }, { name: 'Tools and analysis', skills: skills.slice(3) }], projects: [{ title, description, technologies, url: `https://github.com/${first}/${title.toLowerCase().replaceAll(' ', '-')}` }], professionalLinks: { linkedin: `https://www.linkedin.com/in/${first}`, github: `https://github.com/${first}`, portfolio: `https://${first}.example` }, codingProfiles: [{ platform: 'HackerRank', url: `https://www.hackerrank.com/${first}` }], resume, collegeResult })
    if (variation.policy) await StudentPolicyAcceptance.create({ studentId: user._id, policyId: policy._id, policyVersion: policy.version, acceptedAt: new Date() })
    return { userId: user._id, name, branch, email, characteristic: variation.note }
  } catch (error) { if (user) { await StudentPolicyAcceptance.deleteMany({ studentId: user._id }); await StudentProfile.deleteMany({ userId: user._id }); await User.deleteOne({ _id: user._id }) }; throw error }
}

async function run() {
  await connectDatabase(); try {
    const existing = await DemoSeedStore.findOne({ key: DEMO_SEED_KEY }); if (existing) { if (existing.status === 'ready') { console.info(JSON.stringify({ status: 'already_seeded', students: existing.studentUserIds.length, companies: existing.companyUserIds.length })); return }; throw new Error('A partial seeded dataset exists. Run npm run seed:demo:clean, then run the seed again.') }
    const institution = await InstitutionProfile.findOne({ singletonKey: 'placementhub-v2' }); const branches = [...new Set((institution?.branches ?? []).filter(Boolean))]
    if (!branches.length) throw new Error('Configure at least one Institution branch before running the seed.'); if (people.length < branches.length * PER_BRANCH) throw new Error('The finalized name pool is too small for the canonical branch count.'); if (branches.some(branch => !specialties[branch])) throw new Error('Every canonical branch needs a branch-aware seeded profile.')
    const emails = people.slice(0, branches.length * PER_BRANCH).map(([, first]) => `${first}@gmail.com`); if ((await User.find({ email: { $in: emails } }).select('email').lean()).length) throw new Error('A finalized seed email collides with an existing account; no records were created.')
    const directory = path.resolve(env.RESUME_UPLOAD_DIR, 'demo-seed'); await mkdir(directory, { recursive: true }); const store = await DemoSeedStore.create({ key: DEMO_SEED_KEY, status: 'starting', studentUserIds: [], companyUserIds: [], pdfDirectory: directory }); const passwordHash = await bcrypt.hash(PASSWORD, env.BCRYPT_SALT_ROUNDS); const policy = await getActivePolicy(); const students = []
    for (const [branchIndex, branch] of branches.entries()) for (let studentIndex = 0; studentIndex < PER_BRANCH; studentIndex += 1) { const student = await seedStudent(branch, branchIndex, studentIndex, passwordHash, directory, policy); students.push(student); store.studentUserIds.push(student.userId); await store.save() }
    store.status = 'ready'; await store.save(); console.info(JSON.stringify({ status: 'seeded', students: students.length, companies: 0, branches, studentLogins: students.map(({ userId, ...student }) => ({ ...student, password: PASSWORD })) }))
  } finally { await disconnectDatabase() }
}
run().catch(error => { console.error(error.message); process.exitCode = 1 })
