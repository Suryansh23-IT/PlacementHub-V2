import { z } from 'zod'

// This is the only source for the M9A StudentProfile seed and future resumes.
// Values are synthetic except for the ten explicitly supplied IT names.
export const DEMO_2027_STUDENT_LOGIN_CONVENTION = Object.freeze({
  passwordEnvironmentVariable: 'DEMO_2027_STUDENT_PASSWORD',
  emailDescription: 'Lowercase branch code plus a two-digit within-branch serial, followed by @gmail.com.',
  passwordDescription: 'One locally configured demo password shared by all seeded Student accounts; no password is stored in this source.',
})

export const DEMO_2027_BRANCHES = Object.freeze([
  ['Biomedical Engineering', 'BM', 5, ['Biomedical Instrumentation', 'MATLAB', 'Python', 'Signal Processing', 'IoT'], 'Biomedical Data Associate', 'Clinical signal analysis'],
  ['Biotechnology', 'BT', 5, ['Molecular Biology', 'Bioinformatics', 'Python', 'R', 'Data Analysis'], 'Bioinformatics Associate', 'Genomics data analysis'],
  ['Chemical Engineering', 'CH', 5, ['Aspen HYSYS', 'Process Simulation', 'Python', 'Mass Transfer', 'Excel'], 'Process Engineer', 'Process optimisation'],
  ['Civil Engineering', 'CE', 5, ['AutoCAD', 'STAAD.Pro', 'GIS', 'Excel', 'Construction Planning'], 'Site Planning Engineer', 'Construction planning'],
  ['Computer Science and Engineering', 'CSE', 5, ['Java', 'Python', 'Data Structures', 'SQL', 'Git'], 'Software Development Engineer', 'Distributed application development'],
  ['Electrical Engineering', 'EE', 5, ['Power Systems', 'MATLAB', 'Python', 'PLC', 'AutoCAD Electrical'], 'Power Systems Engineer', 'Energy monitoring'],
  ['Electronics and Communication Engineering', 'ECE', 5, ['Embedded C', 'IoT', 'MATLAB', 'Python', 'PCB Design'], 'Embedded Systems Engineer', 'Connected device development'],
  ['Information Technology', 'IT', 10, ['JavaScript', 'React', 'Node.js', 'MongoDB', 'Git'], 'Software Development Engineer', 'Backend and cloud engineering'],
  ['Mechanical Engineering', 'ME', 5, ['SolidWorks', 'ANSYS', 'CAD', 'Manufacturing', 'Python'], 'Product Design Engineer', 'Design validation'],
  ['Metallurgical and Materials Engineering', 'MME', 5, ['Materials Characterization', 'Metallurgy', 'MATLAB', 'Python', 'Data Analysis'], 'Materials Engineer', 'Materials data analysis'],
  ['Mining Engineering', 'MI', 5, ['Mine Planning', 'AutoCAD', 'GIS', 'Safety Management', 'Python'], 'Mine Planning Engineer', 'Mine safety analytics'],
].map(([label, code, count, skills, targetRole, focus]) => ({ label, code, count, skills, targetRole, focus })))

const people = [
  ['Biomedical Engineering', 'Aarav Mehta', 'aarav.mehta', 'strong', 8.62, 91.4, 88.6, 'Wearable sensor analytics', 'research', 'Biomedical Society', 'Workshop coordinator'],
  ['Biomedical Engineering', 'Diya Kapoor', 'diya.kapoor', 'good', 7.84, 86.8, 84.2, 'Medical device prototyping', 'internship', 'HealthTech Club', 'Event volunteer'],
  ['Biomedical Engineering', 'Kabir Sethi', 'kabir.sethi', 'average', 7.28, 79.6, 77.4, 'Patient-monitoring systems', 'none', 'Robotics Club', 'Team member'],
  ['Biomedical Engineering', 'Meera Iyer', 'meera.iyer', 'strong', 8.41, 89.2, 90.1, 'Biosignal visualisation', 'research', 'IEEE Student Branch', 'Technical lead'],
  ['Biomedical Engineering', 'Rohan Verma', 'rohan.verma', 'good', 7.56, 82.7, 80.5, 'Assistive technology', 'internship', 'NSS Unit', 'Volunteer'],
  ['Biotechnology', 'Ananya Rao', 'ananya.rao', 'strong', 8.48, 92.1, 89.6, 'Microbial genome workflows', 'research', 'BioTech Society', 'Research coordinator'],
  ['Biotechnology', 'Vivaan Kapoor', 'vivaan.kapoor', 'good', 7.71, 84.5, 82.3, 'Protein sequence analysis', 'internship', 'Science Forum', 'Member'],
  ['Biotechnology', 'Ishita Sen', 'ishita.sen', 'average', 7.19, 78.8, 76.9, 'Laboratory sample tracking', 'none', 'Quiz Club', 'Team member'],
  ['Biotechnology', 'Arjun Patel', 'arjun.patel', 'strong', 8.31, 88.9, 87.7, 'Bioprocess data modelling', 'research', 'BioTech Society', 'Technical lead'],
  ['Biotechnology', 'Kavya Menon', 'kavya.menon', 'good', 7.63, 83.4, 81.8, 'Diagnostic data dashboards', 'internship', 'Women in STEM', 'Outreach volunteer'],
  ['Chemical Engineering', 'Reyansh Gupta', 'reyansh.gupta', 'strong', 8.37, 90.8, 88.4, 'Distillation yield optimisation', 'internship', 'Chemical Engineering Society', 'Industry relations lead'],
  ['Chemical Engineering', 'Nandini Bose', 'nandini.bose', 'good', 7.75, 85.3, 83.1, 'Heat-exchanger monitoring', 'research', 'Energy Club', 'Member'],
  ['Chemical Engineering', 'Siddharth Jain', 'siddharth.jain', 'average', 7.16, 77.5, 75.8, 'Batch quality analysis', 'none', 'NSS Unit', 'Volunteer'],
  ['Chemical Engineering', 'Tanvi Kulkarni', 'tanvi.kulkarni', 'strong', 8.52, 91.6, 89.5, 'Reaction kinetics simulation', 'research', 'Chemical Engineering Society', 'Technical secretary'],
  ['Chemical Engineering', 'Yash Bansal', 'yash.bansal', 'good', 7.58, 82.4, 80.2, 'Plant safety checklist', 'internship', 'Safety Cell', 'Student coordinator'],
  ['Civil Engineering', 'Aditi Malhotra', 'aditi.malhotra', 'strong', 8.45, 90.5, 88.7, 'Construction schedule risk', 'internship', 'Civil Engineering Association', 'Project coordinator'],
  ['Civil Engineering', 'Harsh Vardhan', 'harsh.vardhan', 'good', 7.69, 84.1, 82.6, 'Campus drainage mapping', 'research', 'Sustainable Campus Club', 'Member'],
  ['Civil Engineering', 'Ritika Deshmukh', 'ritika.deshmukh', 'average', 7.21, 78.3, 76.5, 'Material inventory planning', 'none', 'Photography Club', 'Volunteer'],
  ['Civil Engineering', 'Dev Chatterjee', 'dev.chatterjee', 'strong', 8.26, 88.7, 86.9, 'Structural inspection planning', 'internship', 'Civil Engineering Association', 'Technical lead'],
  ['Civil Engineering', 'Pooja Sinha', 'pooja.sinha', 'good', 7.54, 81.9, 80.4, 'GIS-enabled site reporting', 'research', 'NSS Unit', 'Volunteer'],
  ['Computer Science and Engineering', 'Kunal Mishra', 'kunal.mishra', 'strong', 8.74, 92.4, 90.6, 'API performance engineering', 'internship', 'Coding Club', 'Mentor'],
  ['Computer Science and Engineering', 'Sneha Joshi', 'sneha.joshi', 'good', 7.93, 86.5, 85.1, 'Database query optimisation', 'research', 'Developer Student Club', 'Project coordinator'],
  ['Computer Science and Engineering', 'Aditya Pradhan', 'aditya.pradhan', 'average', 7.34, 80.2, 78.9, 'Campus support ticketing', 'none', 'Quiz Club', 'Team member'],
  ['Computer Science and Engineering', 'Riya Tiwari', 'riya.tiwari', 'strong', 8.58, 90.1, 89.2, 'Secure document workflow', 'internship', 'Cybersecurity Club', 'Technical secretary'],
  ['Computer Science and Engineering', 'Manav Saxena', 'manav.saxena', 'good', 7.81, 84.7, 82.8, 'Route planning service', 'research', 'Open Source Club', 'Contributor'],
  ['Electrical Engineering', 'Neha Srivastava', 'neha.srivastava', 'strong', 8.39, 89.8, 87.9, 'Smart load forecasting', 'internship', 'Electrical Society', 'Industry outreach lead'],
  ['Electrical Engineering', 'Arnav Bhatt', 'arnav.bhatt', 'good', 7.66, 83.7, 81.5, 'Solar inverter monitoring', 'research', 'Energy Club', 'Member'],
  ['Electrical Engineering', 'Sakshi Dubey', 'sakshi.dubey', 'average', 7.14, 77.9, 76.2, 'PLC maintenance tracker', 'none', 'NSS Unit', 'Volunteer'],
  ['Electrical Engineering', 'Pranav Agrawal', 'pranav.agrawal', 'strong', 8.47, 91.2, 88.3, 'Fault detection dashboard', 'internship', 'Electrical Society', 'Technical lead'],
  ['Electrical Engineering', 'Manya Reddy', 'manya.reddy', 'good', 7.57, 82.6, 80.8, 'Substation inspection planner', 'research', 'Women in Engineering', 'Event coordinator'],
  ['Electronics and Communication Engineering', 'Nikhil Yadav', 'nikhil.yadav', 'strong', 8.43, 90.4, 88.8, 'IoT edge telemetry', 'internship', 'IEEE Student Branch', 'Workshop lead'],
  ['Electronics and Communication Engineering', 'Ira Choudhary', 'ira.choudhary', 'good', 7.76, 85.2, 83.4, 'Low-power sensor network', 'research', 'Electronics Society', 'Member'],
  ['Electronics and Communication Engineering', 'Varun Sehgal', 'varun.sehgal', 'average', 7.25, 79.1, 77.3, 'PCB component tracker', 'none', 'Robotics Club', 'Team member'],
  ['Electronics and Communication Engineering', 'Ayesha Qureshi', 'ayesha.qureshi', 'strong', 8.29, 88.5, 87.1, 'Embedded environmental monitor', 'internship', 'IEEE Student Branch', 'Technical secretary'],
  ['Electronics and Communication Engineering', 'Dhruv Arora', 'dhruv.arora', 'good', 7.61, 82.8, 81.2, 'Wireless test automation', 'research', 'Coding Club', 'Contributor'],
  ['Information Technology', 'Suyash Ghilahare', 'suyash.ghilahare', 'strong', 9.08, 94.1, 91.8, 'Event-driven backend services', 'internship', 'Developer Student Club', 'Technical lead'],
  ['Information Technology', 'Ishant Singh', 'ishant.singh', 'good', 8.46, 88.9, 86.7, 'Business intelligence pipelines', 'research', 'Data Science Club', 'Project coordinator'],
  ['Information Technology', 'Suryansh Dwivedi', 'suryansh.dwivedi', 'average', 8.12, 82.6, 80.4, 'Student support portal', 'none', 'NSS Unit', 'Volunteer'],
  ['Information Technology', 'Divyansh Sharma', 'divyansh.sharma', 'strong', 8.91, 91.7, 89.9, 'Cloud cost observability', 'internship', 'Cloud Computing Club', 'Mentor'],
  ['Information Technology', 'Satyam Tiwari', 'satyam.tiwari', 'good', 8.38, 86.1, 84.8, 'Data quality automation', 'research', 'Data Science Club', 'Member'],
  ['Information Technology', 'Adarsh Gupta', 'adarsh.gupta', 'average', 8.04, 80.5, 79.2, 'Placement calendar service', 'none', 'Quiz Club', 'Team member'],
  ['Information Technology', 'Akshat Mishra', 'akshat.mishra', 'strong', 8.76, 90.6, 88.5, 'Secure API gateway', 'internship', 'Cybersecurity Club', 'Technical secretary'],
  ['Information Technology', 'Devesh Agrawal', 'devesh.agrawal', 'good', 8.27, 85.3, 83.6, 'Analytics reporting workspace', 'research', 'Open Source Club', 'Contributor'],
  ['Information Technology', 'Raj Ganatara', 'raj.ganatara', 'average', 8.18, 81.4, 80.1, 'Alumni directory search', 'none', 'Cultural Council', 'Volunteer'],
  ['Information Technology', 'Suryakant Maurya', 'suryakant.maurya', 'strong', 8.64, 89.7, 87.9, 'Queue-based notification service', 'internship', 'Developer Student Club', 'Workshop coordinator'],
  ['Mechanical Engineering', 'Omkar Patil', 'omkar.patil', 'strong', 8.34, 89.6, 87.8, 'Fixture design validation', 'internship', 'SAE Collegiate Club', 'Design lead'],
  ['Mechanical Engineering', 'Bhavya Nanda', 'bhavya.nanda', 'good', 7.68, 83.9, 81.7, 'Predictive maintenance logs', 'research', 'Manufacturing Club', 'Member'],
  ['Mechanical Engineering', 'Tanishq Soni', 'tanishq.soni', 'average', 7.22, 78.1, 76.3, 'Workshop tool tracking', 'none', 'NSS Unit', 'Volunteer'],
  ['Mechanical Engineering', 'Nisha Khatri', 'nisha.khatri', 'strong', 8.44, 90.8, 88.6, 'Thermal test reporting', 'internship', 'SAE Collegiate Club', 'Technical secretary'],
  ['Mechanical Engineering', 'Raghav Bedi', 'raghav.bedi', 'good', 7.55, 82.2, 80.6, 'CAD revision workflow', 'research', 'Robotics Club', 'Team member'],
  ['Metallurgical and Materials Engineering', 'Simran Kohli', 'simran.kohli', 'strong', 8.31, 89.1, 87.4, 'Alloy property modelling', 'research', 'Materials Society', 'Research coordinator'],
  ['Metallurgical and Materials Engineering', 'Atharv Shetty', 'atharv.shetty', 'good', 7.65, 83.5, 81.9, 'Heat-treatment traceability', 'internship', 'Materials Society', 'Member'],
  ['Metallurgical and Materials Engineering', 'Charu Pillai', 'charu.pillai', 'average', 7.18, 77.6, 75.9, 'Lab sample catalogue', 'none', 'Quiz Club', 'Team member'],
  ['Metallurgical and Materials Engineering', 'Lakshya Narang', 'lakshya.narang', 'strong', 8.42, 90.2, 88.1, 'Microstructure image analysis', 'research', 'Materials Society', 'Technical lead'],
  ['Metallurgical and Materials Engineering', 'Madhav Batra', 'madhav.batra', 'good', 7.59, 82.7, 80.3, 'Foundry defect tracker', 'internship', 'Safety Cell', 'Volunteer'],
  ['Mining Engineering', 'Esha Lamba', 'esha.lamba', 'strong', 8.36, 89.9, 87.6, 'Mine ventilation analysis', 'internship', 'Mining Society', 'Safety coordinator'],
  ['Mining Engineering', 'Gaurav Bedi', 'gaurav.bedi', 'good', 7.72, 84.2, 82.5, 'Haul-road inspection planner', 'research', 'Mining Society', 'Member'],
  ['Mining Engineering', 'Palak Madaan', 'palak.madaan', 'average', 7.24, 78.4, 76.8, 'Shift safety checklist', 'none', 'NSS Unit', 'Volunteer'],
  ['Mining Engineering', 'Ritesh Bhatia', 'ritesh.bhatia', 'strong', 8.28, 88.6, 86.5, 'GIS mine-plan visualisation', 'internship', 'Mining Society', 'Technical secretary'],
  ['Mining Engineering', 'Tanya Roy', 'tanya.roy', 'good', 7.53, 82.1, 80.7, 'Incident trend dashboard', 'research', 'Environmental Club', 'Outreach volunteer'],
]

const branchByName = new Map(DEMO_2027_BRANCHES.map((branch) => [branch.label, branch]))
const certificationByStrength = { strong: ['Applied Data Analysis', 'Coursera'], good: ['Professional Communication', 'NPTEL'], average: ['Workplace Productivity', 'NPTEL'] }

function buildStudent([branchName, name, handle, strength, cgpa, class10Score, class12Score, projectFocus, experienceKind, activityOrganization, activityRole], serial, branchSerial) {
  const branch = branchByName.get(branchName)
  const email = `${branch.code.toLowerCase()}${String(branchSerial).padStart(2, '0')}@gmail.com`
  const [certificationTitle, certificationIssuer] = certificationByStrength[strength]
  const isDataInterest = /data|analysis|modelling|dashboard|visualisation|forecasting/i.test(projectFocus)
  const targetRole = branchName === 'Information Technology' && isDataInterest ? 'Data Analyst' : branch.targetRole
  const internships = experienceKind === 'none' ? [] : [{
    organization: experienceKind === 'research' ? 'Institute Applied Research Lab' : 'Vertex Engineering Solutions',
    role: experienceKind === 'research' ? 'Student Research Assistant' : `${targetRole} Intern`,
    employmentType: experienceKind === 'research' ? 'research' : 'internship',
    startDate: experienceKind === 'research' ? '2026-01-10' : '2026-05-15', endDate: experienceKind === 'research' ? '2026-04-30' : '2026-07-31',
    description: `${name} contributed to ${projectFocus.toLowerCase()} experiments, documentation, and review-ready deliverables.`,
    skills: branch.skills.slice(0, 3), url: `https://experience.demo.placementhub.local/${handle}`,
  }]
  return {
    sourceId: `DEMO2027-${branch.code}-${String(serial).padStart(2, '0')}`,
    name, email, login: { email, passwordEnvironmentVariable: DEMO_2027_STUDENT_LOGIN_CONVENTION.passwordEnvironmentVariable },
    branch: branch.label, graduationYear: 2027, verificationStatus: 'verified', placementPolicyAccepted: true, activeBacklogs: 0, disciplinaryRestriction: false,
    rollNumber: `PH27${branch.code}${String(serial).padStart(2, '0')}`, phone: `900${String(1000000 + serial * 137 + branch.code.charCodeAt(0)).slice(-7)}`,
    class10: { board: 'CBSE', schoolName: `${['Kendriya Vidyalaya', 'Central Public School', 'Model Senior Secondary School'][serial % 3]} ${branch.code}`, passingYear: 2021, score: class10Score },
    class12: { board: 'CBSE', schoolName: `${['Kendriya Vidyalaya', 'Central Public School', 'Model Senior Secondary School'][(serial + 1) % 3]} ${branch.code}`, passingYear: 2023, score: class12Score },
    cgpa, semesterSpis: [1, 2, 3, 4, 5, 6].map((semester, index) => ({ semester, spi: Number(Math.max(7, cgpa - 0.24 + index * 0.07).toFixed(2)) })),
    skills: [...branch.skills, strength === 'strong' ? 'Problem Solving' : strength === 'good' ? 'Technical Documentation' : 'Team Collaboration'],
    skillGroups: [{ name: 'Core domain skills', skills: branch.skills.slice(0, 3) }, { name: 'Tools and applied skills', skills: branch.skills.slice(3) }],
    targetRole, careerInterests: [branch.focus, targetRole, isDataInterest ? 'Data-informed decision making' : 'Industry-ready problem solving'],
    projects: [
      { title: `${projectFocus} Workspace`, description: `${name} designed a ${branchName} project focused on ${projectFocus.toLowerCase()}, with documented requirements, validation results, and a usable reporting workflow.`, technologies: branch.skills.slice(0, 3), url: `https://github.com/placementhub-demo-2027/${handle}-${branch.code.toLowerCase()}-workspace` },
      { title: `${branch.code} Practice Toolkit`, description: `A smaller applied project by ${name} that improves repeatable data capture, review, and technical communication for ${branch.focus.toLowerCase()}.`, technologies: branch.skills.slice(2, 5), url: `https://github.com/placementhub-demo-2027/${handle}-${branch.code.toLowerCase()}-toolkit` },
    ],
    internships,
    certifications: [{ title: certificationTitle, issuer: certificationIssuer, issuedOn: strength === 'strong' ? '2026-03-15' : '2026-02-20', credentialUrl: `https://credentials.demo.placementhub.local/${handle}` }],
    achievements: [{ title: strength === 'strong' ? 'Department technical showcase finalist' : strength === 'good' ? 'Applied project showcase participant' : 'Department skills workshop completer', issuer: `${branch.code} Academic Forum`, awardedOn: '2026-02-10', description: `${name} presented work related to ${projectFocus.toLowerCase()}.` }],
    extracurriculars: [{ title: activityOrganization, organization: activityOrganization, role: activityRole, description: `${name} participated in planning and delivery of student-facing technical activities.` }],
    leadership: ['strong', 'good'].includes(strength) ? [{ title: activityRole, organization: activityOrganization, role: activityRole, description: `${name} coordinated a small student activity with documented responsibilities and handover notes.` }] : [],
    professionalLinks: { linkedin: `https://www.linkedin.com/in/${handle}-demo-2027`, github: `https://github.com/placementhub-demo-2027/${handle}`, portfolio: `https://${handle}.demo.placementhub.local` },
    codingProfiles: /Engineering|Information Technology/.test(branchName) ? [{ platform: 'HackerRank', url: `https://www.hackerrank.com/${handle}_demo2027` }] : [],
    resumePlan: { sections: ['Education', 'Skills', 'Projects', 'Internship/Experience', 'Certifications/Achievements', 'Leadership/Extracurricular'], format: 'single_column_ats_friendly_pdf' },
  }
}

const branchSerials = new Map()
export const CANONICAL_STUDENTS_2027 = Object.freeze(people.map((person, index) => {
  const branchSerial = (branchSerials.get(person[0]) ?? 0) + 1
  branchSerials.set(person[0], branchSerial)
  return buildStudent(person, index + 1, branchSerial)
}))

const studentSchema = z.object({
  sourceId: z.string().regex(/^DEMO2027-[A-Z]+-\d{2}$/), name: z.string().min(2), email: z.string().email(), login: z.object({ email: z.string().email(), passwordEnvironmentVariable: z.literal(DEMO_2027_STUDENT_LOGIN_CONVENTION.passwordEnvironmentVariable) }),
  branch: z.string(), graduationYear: z.literal(2027), verificationStatus: z.literal('verified'), placementPolicyAccepted: z.literal(true), activeBacklogs: z.literal(0), disciplinaryRestriction: z.literal(false), rollNumber: z.string().min(2), phone: z.string().regex(/^\d{10}$/),
  class10: z.object({ score: z.number().min(0).max(100) }).passthrough(), class12: z.object({ score: z.number().min(0).max(100) }).passthrough(), cgpa: z.number().gt(7).max(10),
  semesterSpis: z.array(z.object({ semester: z.number().int().min(1).max(8), spi: z.number().min(0).max(10) })).length(6), skills: z.array(z.string()).min(5), skillGroups: z.array(z.object({ name: z.string(), skills: z.array(z.string()).min(1) })).min(2), targetRole: z.string().min(2), careerInterests: z.array(z.string()).min(2), projects: z.array(z.object({ title: z.string(), description: z.string(), technologies: z.array(z.string()).min(1), url: z.string().url() })).min(2), internships: z.array(z.object({ organization: z.string(), role: z.string(), description: z.string(), skills: z.array(z.string()).min(1) })).max(1), certifications: z.array(z.object({ title: z.string(), issuer: z.string() })).min(1), achievements: z.array(z.object({ title: z.string(), issuer: z.string() })).min(1), extracurriculars: z.array(z.object({ title: z.string(), organization: z.string() })).min(1), leadership: z.array(z.object({ title: z.string(), organization: z.string() })), professionalLinks: z.object({ linkedin: z.string().url(), github: z.string().url(), portfolio: z.string().url() }), resumePlan: z.object({ sections: z.array(z.string()).length(6), format: z.literal('single_column_ats_friendly_pdf') }),
}).passthrough()

export function validateCanonicalStudents2027(students = CANONICAL_STUDENTS_2027) {
  const parsed = z.array(studentSchema).safeParse(students)
  const issues = parsed.success ? [] : parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
  const countByBranch = Object.fromEntries(DEMO_2027_BRANCHES.map((branch) => [branch.label, 0]))
  for (const student of students) if (student.branch in countByBranch) countByBranch[student.branch] += 1
  const expectedItNames = ['Suyash Ghilahare', 'Ishant Singh', 'Suryansh Dwivedi', 'Divyansh Sharma', 'Satyam Tiwari', 'Adarsh Gupta', 'Akshat Mishra', 'Devesh Agrawal', 'Raj Ganatara', 'Suryakant Maurya']
  const unique = (field) => new Set(students.map((student) => student[field])).size === students.length
  if (students.length !== 60) issues.push(`Expected exactly 60 students; received ${students.length}.`)
  for (const branch of DEMO_2027_BRANCHES) if (countByBranch[branch.label] !== branch.count) issues.push(`${branch.label} must contain ${branch.count} students; received ${countByBranch[branch.label]}.`)
  if (!unique('sourceId') || !unique('email') || !unique('rollNumber')) issues.push('Source IDs, emails, and roll numbers must each be unique.')
  if (students.some((student) => student.login.email !== student.email)) issues.push('Each login email must match the Student email.')
  if (students.some((student) => student.branch === 'Information Technology' && student.cgpa <= 8)) issues.push('Every Information Technology student must have CPI above 8.0.')
  if (expectedItNames.some((name) => !students.some((student) => student.branch === 'Information Technology' && student.name === name))) issues.push('The locked Information Technology name set is incomplete.')
  if (students.some((student) => student.class10.score < 60 || student.class12.score < 60)) issues.push('All school academic scores must remain realistic and complete.')
  if (new Set(students.map((student) => student.projects[0].title)).size !== students.length) issues.push('Every student needs a distinct primary project.')
  if (issues.length) throw new Error(`Invalid 2027 canonical student source:\n- ${issues.join('\n- ')}`)
  return { studentCount: students.length, countByBranch, itStudentCount: students.filter((student) => student.branch === 'Information Technology').length, strengthCounts: Object.fromEntries(['strong', 'good', 'average'].map((strength) => [strength, people.filter((person) => person[3] === strength).length])) }
}
