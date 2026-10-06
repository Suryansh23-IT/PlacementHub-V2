import { Route, Routes } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout.jsx'
import { RequireAuth } from './features/auth/RequireAuth.jsx'
import { RequireRole } from './features/auth/RequireRole.jsx'
import { AdminStudentsPage } from './pages/AdminStudentsPage.jsx'
import { DashboardPage } from './pages/DashboardPage.jsx'
import { HomePage } from './pages/HomePage.jsx'
import { EmployersPage, InstitutionsPage, StudentsPage } from './pages/PublicRolePage.jsx'
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
import { CompanyPlacementDrivesPage } from './pages/CompanyPlacementDrivesPage.jsx'
import { CompanyPlacementDriveFormPage } from './pages/CompanyPlacementDriveFormPage.jsx'
import { AdminPlacementDrivesPage } from './pages/AdminPlacementDrivesPage.jsx'
import { AdminPlacementDriveReviewPage } from './pages/AdminPlacementDriveReviewPage.jsx'
import { StudentPlacementCenterPage } from './pages/StudentPlacementCenterPage.jsx'
import { StudentPlacementDriveDetailPage } from './pages/StudentPlacementDriveDetailPage.jsx'
import { StudentRecruitmentJourneyPage } from './pages/StudentRecruitmentJourneyPage.jsx'
import { CompanyPlacementDriveApplicantsPage } from './pages/CompanyPlacementDriveApplicantsPage.jsx'
import { CompanyPlacementDriveApplicantPage } from './pages/CompanyPlacementDriveApplicantPage.jsx'
import { CompanyCandidateExplorerPage } from './pages/CompanyCandidateExplorerPage.jsx'
import { AdminPlacementDriveMonitoringPage } from './pages/AdminPlacementDriveMonitoringPage.jsx'
import { AdminPlacementDriveMonitoringDetailPage } from './pages/AdminPlacementDriveMonitoringDetailPage.jsx'
import { StudentNotificationsPage } from './pages/StudentNotificationsPage.jsx'
import { CompanyNotificationsPage } from './pages/CompanyNotificationsPage.jsx'
import { AdminNotificationsPage } from './pages/AdminNotificationsPage.jsx'
import { AdminPlacementDisciplinePage } from './pages/AdminPlacementDisciplinePage.jsx'
import { AdminPlacementOutcomesPage } from './pages/AdminPlacementOutcomesPage.jsx'
import { AdminReportsPage } from './pages/AdminReportsPage.jsx'
import { HelpSupportPage } from './pages/HelpSupportPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="institutions" element={<InstitutionsPage />} />
        <Route path="employers" element={<EmployersPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="admin/dashboard" element={<RequireAuth><RequireRole roles={['placement_admin']}><DashboardPage /></RequireRole></RequireAuth>} />
        <Route path="help-support" element={<HelpSupportPage />} />
        <Route path="student/profile" element={<RequireAuth><RequireRole roles={['student']}><StudentProfilePage /></RequireRole></RequireAuth>} />
        <Route path="student/policy" element={<RequireAuth><RequireRole roles={['student']}><StudentPolicyPage /></RequireRole></RequireAuth>} />
        <Route path="student/placement" element={<RequireAuth><RequireRole roles={['student']}><StudentPlacementCenterPage /></RequireRole></RequireAuth>} />
        <Route path="student/placement/:id" element={<RequireAuth><RequireRole roles={['student']}><StudentPlacementDriveDetailPage /></RequireRole></RequireAuth>} />
        <Route path="student/applications/:id/journey" element={<RequireAuth><RequireRole roles={['student']}><StudentRecruitmentJourneyPage /></RequireRole></RequireAuth>} />
        <Route path="student/notifications" element={<RequireAuth><RequireRole roles={['student']}><StudentNotificationsPage /></RequireRole></RequireAuth>} />
        <Route path="admin/students" element={<RequireAuth><RequireRole roles={['placement_admin']}><AdminStudentsPage /></RequireRole></RequireAuth>} />
        <Route path="admin/students/:id" element={<RequireAuth><RequireRole roles={['placement_admin']}><AdminCandidateReviewPage /></RequireRole></RequireAuth>} />
        <Route path="company/profile" element={<RequireAuth><RequireRole roles={['company']}><CompanyProfilePage /></RequireRole></RequireAuth>} />
        <Route path="admin/companies" element={<RequireAuth><RequireRole roles={['placement_admin']}><AdminCompaniesPage /></RequireRole></RequireAuth>} />
        <Route path="admin/companies/:id" element={<RequireAuth><RequireRole roles={['placement_admin']}><AdminCompanyReviewPage /></RequireRole></RequireAuth>} />
        <Route path="admin/placement-drives" element={<RequireAuth><RequireRole roles={['placement_admin']}><AdminPlacementDrivesPage /></RequireRole></RequireAuth>} />
        <Route path="admin/placement-drives/monitoring" element={<RequireAuth><RequireRole roles={['placement_admin']}><AdminPlacementDriveMonitoringPage /></RequireRole></RequireAuth>} />
        <Route path="admin/placement-drives/:id/monitoring" element={<RequireAuth><RequireRole roles={['placement_admin']}><AdminPlacementDriveMonitoringDetailPage /></RequireRole></RequireAuth>} />
        <Route path="admin/placement-drives/:id" element={<RequireAuth><RequireRole roles={['placement_admin']}><AdminPlacementDriveReviewPage /></RequireRole></RequireAuth>} />
        <Route path="admin/institution" element={<RequireAuth><RequireRole roles={['placement_admin']}><AdminInstitutionPage /></RequireRole></RequireAuth>} />
        <Route path="admin/student-policy" element={<RequireAuth><RequireRole roles={['placement_admin']}><AdminStudentPolicyPage /></RequireRole></RequireAuth>} />
        <Route path="admin/recruiter-policy" element={<RequireAuth><RequireRole roles={['placement_admin']}><AdminRecruiterPolicyPage /></RequireRole></RequireAuth>} />
        <Route path="admin/notifications" element={<RequireAuth><RequireRole roles={['placement_admin']}><AdminNotificationsPage /></RequireRole></RequireAuth>} />
        <Route path="admin/placement-discipline" element={<RequireAuth><RequireRole roles={['placement_admin']}><AdminPlacementDisciplinePage /></RequireRole></RequireAuth>} />
        <Route path="admin/placement-outcomes" element={<RequireAuth><RequireRole roles={['placement_admin']}><AdminPlacementOutcomesPage /></RequireRole></RequireAuth>} />
        <Route path="admin/reports" element={<RequireAuth><RequireRole roles={['placement_admin']}><AdminReportsPage /></RequireRole></RequireAuth>} />
        <Route path="company/policy" element={<RequireAuth><RequireRole roles={['company']}><RecruiterPolicyPage /></RequireRole></RequireAuth>} />
        <Route path="company/notifications" element={<RequireAuth><RequireRole roles={['company']}><CompanyNotificationsPage /></RequireRole></RequireAuth>} />
        <Route path="company/placement-drives" element={<RequireAuth><RequireRole roles={['company']}><CompanyPlacementDrivesPage /></RequireRole></RequireAuth>} />
        <Route path="company/placement-drives/new" element={<RequireAuth><RequireRole roles={['company']}><CompanyPlacementDriveFormPage /></RequireRole></RequireAuth>} />
        <Route path="company/placement-drives/:id/applicants" element={<RequireAuth><RequireRole roles={['company']}><CompanyPlacementDriveApplicantsPage /></RequireRole></RequireAuth>} />
        <Route path="company/placement-drives/:id/applicants/:studentId" element={<RequireAuth><RequireRole roles={['company']}><CompanyPlacementDriveApplicantPage /></RequireRole></RequireAuth>} />
        <Route path="company/candidates" element={<RequireAuth><RequireRole roles={['company']}><CompanyCandidateExplorerPage /></RequireRole></RequireAuth>} />
        <Route path="company/placement-drives/:id" element={<RequireAuth><RequireRole roles={['company']}><CompanyPlacementDriveFormPage /></RequireRole></RequireAuth>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
