import { Route, Routes } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout.jsx'
import { RequireAuth } from './features/auth/RequireAuth.jsx'
import { RequireRole } from './features/auth/RequireRole.jsx'
import { AdminStudentsPage } from './pages/AdminStudentsPage.jsx'
import { DashboardPage } from './pages/DashboardPage.jsx'
import { HomePage } from './pages/HomePage.jsx'
import { LoginPage } from './pages/LoginPage.jsx'
import { NotFoundPage } from './pages/NotFoundPage.jsx'
import { RegisterPage } from './pages/RegisterPage.jsx'
import { StudentProfilePage } from './pages/StudentProfilePage.jsx'
import { CompanyProfilePage } from './pages/CompanyProfilePage.jsx'
import { AdminCompaniesPage } from './pages/AdminCompaniesPage.jsx'
import { AdminCompanyReviewPage } from './pages/AdminCompanyReviewPage.jsx'
import { AdminInstitutionPage } from './pages/AdminInstitutionPage.jsx'
import { AdminCandidateReviewPage } from './pages/AdminCandidateReviewPage.jsx'
import { StudentPolicyPage } from './pages/StudentPolicyPage.jsx'
import { AdminStudentPolicyPage } from './pages/AdminStudentPolicyPage.jsx'
import { AdminRecruiterPolicyPage } from './pages/AdminRecruiterPolicyPage.jsx'
import { RecruiterPolicyPage } from './pages/RecruiterPolicyPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="student/profile" element={<RequireAuth><RequireRole roles={['student']}><StudentProfilePage /></RequireRole></RequireAuth>} />
        <Route path="student/policy" element={<RequireAuth><RequireRole roles={['student']}><StudentPolicyPage /></RequireRole></RequireAuth>} />
        <Route path="admin/students" element={<RequireAuth><RequireRole roles={['placement_admin']}><AdminStudentsPage /></RequireRole></RequireAuth>} />
        <Route path="admin/students/:id" element={<RequireAuth><RequireRole roles={['placement_admin']}><AdminCandidateReviewPage /></RequireRole></RequireAuth>} />
        <Route path="company/profile" element={<RequireAuth><RequireRole roles={['company']}><CompanyProfilePage /></RequireRole></RequireAuth>} />
        <Route path="admin/companies" element={<RequireAuth><RequireRole roles={['placement_admin']}><AdminCompaniesPage /></RequireRole></RequireAuth>} />
        <Route path="admin/companies/:id" element={<RequireAuth><RequireRole roles={['placement_admin']}><AdminCompanyReviewPage /></RequireRole></RequireAuth>} />
        <Route path="admin/institution" element={<RequireAuth><RequireRole roles={['placement_admin']}><AdminInstitutionPage /></RequireRole></RequireAuth>} />
        <Route path="admin/student-policy" element={<RequireAuth><RequireRole roles={['placement_admin']}><AdminStudentPolicyPage /></RequireRole></RequireAuth>} />
        <Route path="admin/recruiter-policy" element={<RequireAuth><RequireRole roles={['placement_admin']}><AdminRecruiterPolicyPage /></RequireRole></RequireAuth>} />
        <Route path="company/policy" element={<RequireAuth><RequireRole roles={['company']}><RecruiterPolicyPage /></RequireRole></RequireAuth>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
