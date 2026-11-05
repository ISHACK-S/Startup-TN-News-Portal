import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SiteLayout from './components/SiteLayout.jsx';
import HomePage from './pages/HomePage.jsx';
import NewsPage from './pages/NewsPage.jsx';
import ArticlePage from './pages/ArticlePage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import WebStoriesPage from './pages/WebStoriesPage.jsx';
import WebStoryPage from './pages/WebStoryPage.jsx';
import VideosPage from './pages/VideosPage.jsx';
import VideoPage from './pages/VideoPage.jsx';
import AdminRoutes from './admin/AdminRoutes.jsx';
import { ProtectedAdmin, ProtectedSuperAdmin } from './admin/AdminRoutes.jsx';
import AdminLayout from './admin/components/AdminLayout.jsx';
import AdminDashboardPage from './admin/pages/AdminDashboardPage.jsx';
import AdminNewsPage from './admin/pages/AdminNewsPage.jsx';
import AdminArticleEditorPage from './admin/pages/AdminArticleEditorPage.jsx';
import AdminLoginPage from './admin/pages/AdminLoginPage.jsx';
import AdminUsersPage from './admin/pages/AdminUsersPage.jsx';
import AdminRoleBuilderPage from './admin/pages/AdminRoleBuilderPage.jsx';
import AdminAccountPermissionsPage from './admin/pages/AdminAccountPermissionsPage.jsx';
import AdminProfilePage from './admin/pages/AdminProfilePage.jsx';
import {
  AdminBrandingPage,
  AdminFooterManagementPage,
  AdminMenuManagementPage
} from './admin/pages/AdminWebsiteConfigurationPages.jsx';
import {
  AdminHeroSliderPage,
  AdminMediaLibraryPage,
  AdminVideosPage,
  AdminWebStoriesPage
} from './admin/pages/AdminContentPages.jsx';
import { RequireAdminPermission } from './admin/AdminPermissionContext.jsx';
import ScrollToTop from './components/ScrollToTop.jsx';
import { PublicPreferencesProvider } from './contexts/PublicPreferencesContext.jsx';
import AdminMonthlyReportsPage from './admin/pages/AdminMonthlyReportsPage.jsx';

export default function App() {
  const location = useLocation();
  const { t } = useTranslation(['admin', 'public']);

  useEffect(() => {
    document.title = location.pathname.startsWith('/admin')
      ? t('StartupTN News admin dashboard', { ns: 'admin' })
      : `StartupTN News — ${t('Stories shaping tomorrow', { ns: 'public', defaultValue: 'Stories shaping tomorrow' })}`;
  }, [location.pathname, t]);

  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/admin" element={<AdminRoutes />}>
          <Route path="login" element={<AdminLoginPage />} />
          <Route element={<ProtectedAdmin />}>
            <Route element={<AdminLayout />}>
              <Route path="profile" element={<AdminProfilePage />} />
              <Route element={<RequireAdminPermission moduleId="overview" />}>
                <Route index element={<AdminDashboardPage />} />
              </Route>
              <Route element={<RequireAdminPermission moduleId="news-articles" />}>
                <Route path="news" element={<AdminNewsPage />} />
              </Route>
              <Route element={<RequireAdminPermission moduleId="news-articles" actionId="create" />}>
                <Route path="news/new" element={<AdminArticleEditorPage />} />
              </Route>
              <Route element={<RequireAdminPermission moduleId="news-articles" actionId="edit" />}>
                <Route path="news/:id/edit" element={<AdminArticleEditorPage />} />
              </Route>
              <Route element={<RequireAdminPermission moduleId="user-management" />}>
                <Route path="access-control/users" element={<AdminUsersPage />} />
              </Route>
              <Route element={<RequireAdminPermission moduleId="role-builder" />}>
                <Route path="role-builder" element={<AdminRoleBuilderPage />} />
              </Route>
              <Route element={<RequireAdminPermission moduleId="access-control" actionId="manage" />}>
                <Route path="access-control/permissions" element={<AdminAccountPermissionsPage />} />
              </Route>
              <Route element={<RequireAdminPermission moduleId="menu-management" actionId="manage" />}>
                <Route path="menu-management" element={<AdminMenuManagementPage />} />
              </Route>
              <Route element={<RequireAdminPermission moduleId="footer-management" actionId="manage" />}>
                <Route path="footer-management" element={<AdminFooterManagementPage />} />
              </Route>
              <Route element={<RequireAdminPermission moduleId="branding-theme-editor" actionId="manage" />}>
                <Route path="branding" element={<AdminBrandingPage />} />
              </Route>
              <Route element={<RequireAdminPermission moduleId="media-library" />}>
                <Route path="media-library" element={<AdminMediaLibraryPage />} />
              </Route>
              <Route element={<RequireAdminPermission moduleId="web-stories" />}>
                <Route path="web-stories" element={<AdminWebStoriesPage />} />
              </Route>
              <Route element={<RequireAdminPermission moduleId="hero-slider" />}>
                <Route path="hero-slider" element={<AdminHeroSliderPage />} />
              </Route>
              <Route element={<RequireAdminPermission moduleId="video-media" />}>
                <Route path="videos" element={<AdminVideosPage />} />
              </Route>
              <Route element={<ProtectedSuperAdmin />}>
                <Route path="monthly-reports" element={<AdminMonthlyReportsPage />} />
              </Route>
            </Route>
          </Route>
        </Route>
        <Route element={<PublicSite />}>
          <Route index element={<HomePage />} />
          <Route path="/news/" element={<NewsPage />} />
          <Route path="/news/:slug" element={<ArticlePage />} />
          <Route path="/stories" element={<WebStoriesPage />} />
          <Route path="/stories/:slug" element={<WebStoryPage />} />
          <Route path="/videos" element={<VideosPage />} />
          <Route path="/videos/:id" element={<VideoPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}

function PublicSite() {
  return (
    <div className="public-site">
      <PublicPreferencesProvider>
        <SiteLayout />
      </PublicPreferencesProvider>
    </div>
  );
}
