import { BrowserRouter } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { WorkspaceProvider } from '@/context/WorkspaceContext'
import { NotificationProvider } from '@/context/NotificationContext'
import { AppRoutes } from '@/routes'

function BrandingStyles() {
  const { branding } = useAuth()
  return (
    <style>{`
      :root {
        --brand-primary: ${branding.primaryColor};
        --brand-primary-light: color-mix(in srgb, var(--brand-primary) 85%, white);
        --brand-primary-muted: color-mix(in srgb, var(--brand-primary) 70%, white);
        --brand-accent: ${branding.accentColor};
        --brand-accent-light: color-mix(in srgb, var(--brand-accent) 85%, white);
        --brand-accent-dark: color-mix(in srgb, var(--brand-accent) 85%, black);
      }
    `}</style>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <BrandingStyles />
        <WorkspaceProvider>
          <NotificationProvider>
            <AppRoutes />
          </NotificationProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
