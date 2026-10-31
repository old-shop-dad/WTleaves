import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { Layout } from '@/components/Layout';
import { ErrorFallback } from '@/components/ErrorFallback';

const TodayPage = lazy(() => import('@/pages/TodayPage/TodayPage'));
const SchedulePage = lazy(() => import('@/pages/SchedulePage/SchedulePage'));
const TasksPage = lazy(() => import('@/pages/TasksPage/TasksPage'));
const NotesPage = lazy(() => import('@/pages/NotesPage/NotesPage'));
const NoteEditorPage = lazy(() => import('@/pages/NoteEditorPage/NoteEditorPage'));
const HabitsPage = lazy(() => import('@/pages/HabitsPage/HabitsPage'));
const FocusPage = lazy(() => import('@/pages/FocusPage/FocusPage'));
const FinancePage = lazy(() => import('@/pages/FinancePage/FinancePage'));
const LauncherPage = lazy(() => import('@/pages/LauncherPage/LauncherPage'));
const ChatPage = lazy(() => import('@/pages/ChatPage/ChatPage'));
// DocsPage 静态引入：避免 lazy 动态 import 在模块图异常时缓存旧版本（曾导致运行时加载旧代码、转换卡死）
import DocsPage from '@/pages/DocsPage/DocsPage';
const SettingsPage = lazy(() => import('@/pages/SettingsPage/SettingsPage'));
const QuizHomePage = lazy(() => import('@/pages/QuizPage/QuizHomePage'));
const QuizBankDetailPage = lazy(() => import('@/pages/QuizPage/QuizBankDetailPage'));
const QuizPracticePage = lazy(() => import('@/pages/QuizPage/QuizPracticePage'));
const QuizImportPage = lazy(() => import('@/pages/QuizPage/QuizImportPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage/NotFoundPage'));

function PageFallback() {
  return (
    <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
      加载中…
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/today" replace />} />
            <Route path="today" element={<TodayPage />} />
            <Route path="schedule" element={<SchedulePage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="notes" element={<NotesPage />} />
            <Route path="notes/:id" element={<NoteEditorPage />} />
            <Route path="habits" element={<HabitsPage />} />
            <Route path="focus" element={<FocusPage />} />
            <Route path="finance" element={<FinancePage />} />
            <Route path="launcher" element={<LauncherPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="docs" element={<DocsPage />} />
            <Route path="quiz" element={<QuizHomePage />} />
            <Route path="quiz/import" element={<QuizImportPage />} />
            <Route path="quiz/bank/:id" element={<QuizBankDetailPage />} />
            <Route path="quiz/practice/:id" element={<QuizPracticePage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
