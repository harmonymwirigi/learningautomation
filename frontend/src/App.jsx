import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import RequireAdmin from './components/RequireAdmin';
import Login from './pages/Login';
import Register from './pages/Register';
import Profile from './pages/Profile';
import Progress from './pages/Progress';
import AdminAccounts from './pages/AdminAccounts';
import AdminSchools from './pages/AdminSchools';
import Dashboard from './pages/Dashboard';
import Units from './pages/Units';
import Notes from './pages/Notes';
import PastPapers from './pages/PastPapers';
import Assignments from './pages/Assignments';
import Study from './pages/Study';
import Notifications from './pages/Notifications';
import Calendar from './pages/Calendar';
import Timetable from './pages/Timetable';
import ExamPrep from './pages/ExamPrep';
import Quiz from './pages/Quiz';

export default function App() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route path="register" element={<Register />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="units" element={<Units />} />
          <Route path="notes" element={<Notes />} />
          <Route path="quizzes/:id" element={<Quiz />} />
          <Route path="past-papers" element={<PastPapers />} />
          <Route path="assignments" element={<Assignments />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="timetable" element={<Timetable />} />
          <Route path="exam-prep" element={<ExamPrep />} />
          <Route path="study" element={<Study />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="progress" element={<Progress />} />
          <Route path="profile" element={<Profile />} />

          <Route element={<RequireAdmin />}>
            <Route path="admin/accounts" element={<AdminAccounts />} />
            <Route path="admin/schools" element={<AdminSchools />} />
          </Route>

          {/* Anything unrecognised — including bookmarks to the removed
              /daily-skills page — lands on the dashboard rather than blank. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
