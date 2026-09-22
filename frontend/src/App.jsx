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

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="student/profile" element={<RequireAuth><RequireRole roles={['student']}><StudentProfilePage /></RequireRole></RequireAuth>} />
        <Route path="admin/students" element={<RequireAuth><RequireRole roles={['placement_admin']}><AdminStudentsPage /></RequireRole></RequireAuth>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
