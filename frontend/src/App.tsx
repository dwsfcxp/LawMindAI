import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';

// React.lazy for code splitting - Iteration 40
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Cases = lazy(() => import('./pages/Cases'));
const DocumentGenerate = lazy(() => import('./pages/DocumentGenerate'));
const Search = lazy(() => import('./pages/Search'));
const Templates = lazy(() => import('./pages/Templates'));
const Settings = lazy(() => import('./pages/Settings'));
const Evidence = lazy(() => import('./pages/Evidence'));
const Research = lazy(() => import('./pages/Research'));
const ContractReview = lazy(() => import('./pages/ContractReview'));
const Knowledge = lazy(() => import('./pages/Knowledge'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Suspense fallback={<PageLoader />}><Dashboard /></Suspense>} />
        <Route path="cases" element={<Suspense fallback={<PageLoader />}><Cases /></Suspense>} />
        <Route path="documents" element={<Suspense fallback={<PageLoader />}><DocumentGenerate /></Suspense>} />
        <Route path="search" element={<Suspense fallback={<PageLoader />}><Search /></Suspense>} />
        <Route path="templates" element={<Suspense fallback={<PageLoader />}><Templates /></Suspense>} />
        <Route path="evidence" element={<Suspense fallback={<PageLoader />}><Evidence /></Suspense>} />
        <Route path="research" element={<Suspense fallback={<PageLoader />}><Research /></Suspense>} />
        <Route path="contracts" element={<Suspense fallback={<PageLoader />}><ContractReview /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
        <Route path="knowledge" element={<Suspense fallback={<PageLoader />}><Knowledge /></Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
