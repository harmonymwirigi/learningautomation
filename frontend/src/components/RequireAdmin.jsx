import { Navigate, Outlet } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Sits inside RequireAuth, so by here the user is known to be signed in — the
// only question left is whether they are an admin.
export default function RequireAdmin() {
  const { user, isAdmin } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <ShieldAlert size={40} className="mx-auto mb-4 text-slate-600" />
        <h1 className="text-xl font-semibold text-white">Admin access required</h1>
        <p className="mt-2 text-sm text-slate-400">
          This area is for administrators. Ask an admin to grant you access if you need it.
        </p>
      </div>
    );
  }

  return <Outlet />;
}
