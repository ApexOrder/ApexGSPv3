import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import AuthCallback from '@/pages/AuthCallback'
import Dashboard from '@/pages/Dashboard'
import Nodes from '@/pages/Nodes'
import AddNode from '@/pages/AddNode'
import Jobs from '@/pages/Jobs'
import JobConsole from '@/pages/JobConsole'
import Servers from '@/pages/Servers'
import NewServer from '@/pages/NewServer'
import ServerDetails from '@/pages/ServerDetails'
import ServerBackups from '@/pages/ServerBackups'
import ServerConsole from '@/pages/ServerConsole'
import ServerFiles from '@/pages/ServerFiles'
import ServerSettings from '@/pages/ServerSettings'
import ServerScheduler from '@/pages/ServerScheduler'
import ServerWorkshop from '@/pages/ServerWorkshop'
import Profile from '@/pages/Profile'
import Settings from '@/pages/Settings'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/nodes" element={<Nodes />} />
            <Route path="/nodes/add" element={<AddNode />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/jobs/:id" element={<JobConsole />} />
            <Route path="/servers" element={<Servers />} />
            <Route path="/servers/new" element={<NewServer />} />
            <Route path="/servers/:id" element={<ServerDetails />} />
            <Route path="/servers/:id/backups" element={<ServerBackups />} />
            <Route path="/servers/:id/console" element={<ServerConsole />} />
            <Route path="/servers/:id/files" element={<ServerFiles />} />
            <Route path="/servers/:id/settings" element={<ServerSettings />} />
            <Route path="/servers/:id/scheduler" element={<ServerScheduler />} />
            <Route path="/servers/:id/workshop" element={<ServerWorkshop />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
