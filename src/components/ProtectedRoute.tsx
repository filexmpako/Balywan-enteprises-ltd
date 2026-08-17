import React from 'react';
import { useAuth, UserRole } from './AuthContext';
import ForbiddenView from './ForbiddenView';
import { ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';

interface ProtectedRouteProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}

export default function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center p-6 text-center font-sans">
        <motion.div
          animate={{ scale: [0.9, 1.1, 0.9], rotate: [0, 10, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-primary text-brand-accent shadow-lg mb-4"
        >
          <ShieldCheck className="h-8 w-8" />
        </motion.div>
        <h2 className="text-sm font-bold text-brand-primary uppercase tracking-widest font-mono">
          Verifying Credential Mapping...
        </h2>
        <p className="text-[11px] text-brand-text-variant mt-1">
          Establishing encrypted handshake with Dodoma cluster node.
        </p>
      </div>
    );
  }

  if (!user) {
    // Unauthenticated! Force return to system gateway or login
    window.location.hash = '#/';
    return null;
  }

  if (!allowedRoles.includes(user.role)) {
    // Authenticated but does not possess required credentials
    return <ForbiddenView />;
  }

  return <>{children}</>;
}
