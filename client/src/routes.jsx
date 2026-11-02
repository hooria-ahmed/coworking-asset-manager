// Every screen in the app, already registered so members never edit this file.
// label = text in the top-bar menu (null = not in the menu). roles = who may open it.
// icon = lucide-react icon in the menu. group = top-bar pill the screen sits under (a group with several
// screens becomes a drop-down pill; see GROUPS in components/Layout.jsx).
// Owner: integrator.
import {
  ArrowLeftRight, BarChart3, Boxes, CheckSquare, ClipboardList, History, LayoutDashboard, Package, Sparkles, Tags, Users, Wand2, Wrench,
} from 'lucide-react';
import CataloguePage from './modules/assets/CataloguePage';
import AssetDetailsPage from './modules/assets/AssetDetailsPage';
import RequestFormPage from './modules/requests/RequestFormPage';
import MyRequestsPage from './modules/requests/MyRequestsPage';
import AssistantPage from './modules/ai/AssistantPage';
import RecommendPage from './modules/ai/RecommendPage';
import MyHistoryPage from './modules/history/MyHistoryPage';
import ReportProblemPage from './modules/maintenance/ReportProblemPage';
import NotificationsPage from './modules/notifications/NotificationsPage';
import AdminDashboardPage from './modules/reports/AdminDashboardPage';
import MemberDashboardPage from './modules/reports/MemberDashboardPage';
import ManageAssetsPage from './modules/assets/ManageAssetsPage';
import CategoriesPage from './modules/assets/CategoriesPage';
import ApprovalsPage from './modules/approvals/ApprovalsPage';
import IssueReturnPage from './modules/borrowing/IssueReturnPage';
import MaintenancePage from './modules/maintenance/MaintenancePage';
import AssetHistoryPage from './modules/history/AssetHistoryPage';
import ReportsPage from './modules/reports/ReportsPage';
import UsersPage from './modules/users/UsersPage';
import UiTemplatePage from './modules/_template/UiTemplatePage';

export const ROUTES = [
  { path: '/admin', element: <AdminDashboardPage />, roles: ['Admin'], label: 'Dashboard', icon: LayoutDashboard, group: 'Dashboard', owner: 'Misbah' },
  { path: '/dashboard', element: <MemberDashboardPage />, roles: ['Member'], label: 'Dashboard', icon: LayoutDashboard, group: 'Dashboard', owner: 'Misbah' },
  { path: '/assets', element: <CataloguePage />, roles: ['Admin', 'Member'], label: 'Asset Catalogue', icon: Boxes, group: 'Assets', owner: 'Azlaan' },
  { path: '/assets/:id', element: <AssetDetailsPage />, roles: ['Admin', 'Member'], label: null, owner: 'Azlaan' },
  { path: '/request/:assetId', element: <RequestFormPage />, roles: ['Member'], label: null, owner: 'Hamza' },
  { path: '/my-requests', element: <MyRequestsPage />, roles: ['Member'], label: 'My Requests', icon: ClipboardList, group: 'Activity', owner: 'Hamza' },
  { path: '/ai/assistant', element: <AssistantPage />, roles: ['Admin', 'Member'], label: 'AI Assistant', icon: Sparkles, group: 'AI', owner: 'Hooria' },
  { path: '/ai/recommend', element: <RecommendPage />, roles: ['Admin', 'Member'], label: 'AI Recommendation', icon: Wand2, group: 'AI', owner: 'Hooria' },
  { path: '/history', element: <MyHistoryPage />, roles: ['Member'], label: 'My History', icon: History, group: 'Activity', owner: 'Hooria' },
  { path: '/report-problem', element: <ReportProblemPage />, roles: ['Member'], label: 'Report a Problem', icon: Wrench, group: 'Assets', owner: 'Azlaan' },
  { path: '/notifications', element: <NotificationsPage />, roles: ['Admin', 'Member'], label: null, owner: 'Hooria' },
  { path: '/admin/assets', element: <ManageAssetsPage />, roles: ['Admin'], label: 'Manage Assets', icon: Package, group: 'Assets', owner: 'Azlaan' },
  { path: '/admin/categories', element: <CategoriesPage />, roles: ['Admin'], label: 'Categories', icon: Tags, group: 'Assets', owner: 'Azlaan' },
  { path: '/admin/approvals', element: <ApprovalsPage />, roles: ['Admin'], label: 'Approvals', icon: CheckSquare, group: 'Operations', owner: 'Hamza' },
  { path: '/admin/borrowing', element: <IssueReturnPage />, roles: ['Admin'], label: 'Issue / Return', icon: ArrowLeftRight, group: 'Operations', owner: 'Hamza' },
  { path: '/admin/maintenance', element: <MaintenancePage />, roles: ['Admin'], label: 'Maintenance', icon: Wrench, group: 'Assets', owner: 'Azlaan' },
  { path: '/admin/history/:assetId', element: <AssetHistoryPage />, roles: ['Admin'], label: null, owner: 'Hooria' },
  { path: '/admin/reports', element: <ReportsPage />, roles: ['Admin'], label: 'Reports', icon: BarChart3, group: 'Reports', owner: 'Misbah' },
  { path: '/admin/users', element: <UsersPage />, roles: ['Admin'], label: 'Users', icon: Users, group: 'Operations', owner: 'Hamza' },
  // Living style guide + copy-me page template for the team (docs/UI_TEMPLATE.md). Not in the menu.
  { path: '/ui-template', element: <UiTemplatePage />, roles: ['Admin', 'Member'], label: null, owner: 'Integrator' },
];
