import { Route, Routes } from 'react-router-dom';
import SiteLayout from './components/SiteLayout.jsx';
import HomePage from './pages/HomePage.jsx';
import NewsPage from './pages/NewsPage.jsx';
import ArticlePage from './pages/ArticlePage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import AdminRoutes from './admin/AdminRoutes.jsx';
import { ProtectedAdmin } from './admin/AdminRoutes.jsx';
import AdminLayout from './admin/components/AdminLayout.jsx';
import AdminDashboardPage from './admin/pages/AdminDashboardPage.jsx';
import AdminNewsPage from './admin/pages/AdminNewsPage.jsx';
import AdminArticleEditorPage from './admin/pages/AdminArticleEditorPage.jsx';
import AdminLoginPage from './admin/pages/AdminLoginPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/admin" element={<AdminRoutes />}>
        <Route path="login" element={<AdminLoginPage />} />
        <Route element={<ProtectedAdmin />}>
          <Route element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="news" element={<AdminNewsPage />} />
            <Route path="news/new" element={<AdminArticleEditorPage />} />
            <Route path="news/:id/edit" element={<AdminArticleEditorPage />} />
          </Route>
        </Route>
      </Route>
      <Route element={<SiteLayout />}>
        <Route index element={<HomePage />} />
        <Route path="/news/" element={<NewsPage />} />
        <Route path="/news/:slug" element={<ArticlePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
