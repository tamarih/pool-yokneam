import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import LoginPage from '@/pages/LoginPage'
import AdminLayout from '@/components/shared/AdminLayout'
import GuardLayout from '@/components/shared/GuardLayout'
import MemberLayout from '@/components/shared/MemberLayout'
import AdminDashboard from '@/pages/admin/Dashboard'
import AdminFamilies from '@/pages/admin/Families'
import AdminFamilyDetail from '@/pages/admin/FamilyDetail'
import AdminEntries from '@/pages/admin/Entries'
import AdminReports from '@/pages/admin/Reports'
import AdminImport from '@/pages/admin/Import'
import GuardScanner from '@/pages/guard/Scanner'
import GuardEntries from '@/pages/guard/Entries'
import MemberCard from '@/pages/member/Card'
import LoadingSpinner from '@/components/shared/LoadingSpinner'

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles: string[] }) {
  const { role, loading } = useAuth()
  if (loading) return <LoadingSpinner />
  if (!role) return <Navigate to="/login" replace />
  if (!roles.includes(role)) return <Navigate to="/" replace />
  return <>{children}</>
}

function RootRedirect() {
  const { role, loading } = useAuth()
  if (loading) return <LoadingSpinner />
  if (!role) return <Navigate to="/login" replace />
  if (role === 'admin') return <Navigate to="/admin" replace />
  if (role === 'guard') return <Navigate to="/guard" replace />
  return <Navigate to="/member" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RootRedirect />} />

      {/* Admin routes */}
      <Route path="/admin" element={
        <ProtectedRoute roles={['admin']}>
          <AdminLayout />
        </ProtectedRoute>
      }>
        <Route index element={<AdminDashboard />} />
        <Route path="families" element={<AdminFamilies />} />
        <Route path="families/:id" element={<AdminFamilyDetail />} />
        <Route path="entries" element={<AdminEntries />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="import" element={<AdminImport />} />
      </Route>

      {/* Guard routes */}
      <Route path="/guard" element={
        <ProtectedRoute roles={['admin', 'guard']}>
          <GuardLayout />
        </ProtectedRoute>
      }>
        <Route index element={<GuardScanner />} />
        <Route path="entries" element={<GuardEntries />} />
      </Route>

      {/* Member routes */}
      <Route path="/member" element={
        <ProtectedRoute roles={['admin', 'guard', 'member']}>
          <MemberLayout />
        </ProtectedRoute>
      }>
        <Route index element={<MemberCard />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
