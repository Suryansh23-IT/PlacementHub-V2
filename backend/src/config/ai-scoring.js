// Versioned professional-evidence rules, separate from academic eligibility.
export const STUDENT_SCORING_VERSION = 'student-1'
export const PROFILE_WEIGHTS = Object.freeze({ skills: 20, projects: 30, experience: 15, credentials: 10, direction: 10, introduction: 5, links: 5, resume: 5 })
export const PROFILE_TARGETS = Object.freeze({ skills: 5, projects: 2, experience: 1, credentials: 2, links: 2 })
export const MATCH_WEIGHTS = Object.freeze({ required: 60, preferred: 15, evidence: 25 })
export const SKILL_ALIASES = Object.freeze({ 'js': 'javascript', 'nodejs': 'node.js', 'node js': 'node.js', 'reactjs': 'react', 'react.js': 'react', 'postgres': 'postgresql', 'c sharp': 'c#', 'csharp': 'c#', 'mongo db': 'mongodb', 'py': 'python' })
export const MATCH_LABELS = Object.freeze([{ minimum: 80, label: 'Strong' }, { minimum: 60, label: 'Good' }, { minimum: 40, label: 'Moderate' }, { minimum: 0, label: 'Low' }])
export const PROFESSIONAL_ACHIEVEMENT_TERMS = Object.freeze(['hackathon', 'programming', 'coding', 'research', 'publication', 'engineering', 'technical', 'robotics', 'design competition'])
export const ROLE_EVIDENCE = Object.freeze([
  { role: 'Frontend Developer', skills: ['javascript', 'react', 'html', 'css'], minimum: 2 },
  { role: 'Backend Developer', skills: ['node.js', 'python', 'java', 'sql', 'mongodb'], minimum: 2 },
  { role: 'Data Analyst', skills: ['python', 'sql', 'excel', 'power bi', 'statistics'], minimum: 2 },
  { role: 'Embedded Systems Engineer', skills: ['c', 'c++', 'embedded systems', 'arduino'], minimum: 2 },
  { role: 'Mechanical Design Engineer', skills: ['cad', 'solidworks', 'autocad', 'catia'], minimum: 2 },
  { role: 'Civil Design Engineer', skills: ['autocad', 'staad.pro', 'revit', 'structural analysis'], minimum: 2 },
])
