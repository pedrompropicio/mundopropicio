import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export type AppRole = "admin" | "manager" | "editor" | "viewer" | "user";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  permissions: string[];
  isAdmin: boolean;
  loading: boolean;
  hasPermission: (permission: string) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  permissions: [],
  isAdmin: false,
  loading: true,
  hasPermission: () => false,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  manager: "Manager",
  editor: "Editor",
  viewer: "Viewer",
  user: "Utilizador",
};

export const ROLE_COLORS: Record<AppRole, string> = {
  admin: "bg-primary/15 text-primary",
  manager: "bg-blue-500/15 text-blue-600",
  editor: "bg-amber-500/15 text-amber-600",
  viewer: "bg-emerald-500/15 text-emerald-600",
  user: "bg-secondary text-secondary-foreground",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRoleAndPermissions = async (userId: string) => {
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .limit(1)
      .single();

    const userRole = (roleData?.role as AppRole) ?? "user";
    setRole(userRole);

    const { data: permsData } = await supabase
      .from("role_permissions")
      .select("permission")
      .eq("role", userRole);

    setPermissions(permsData?.map((p) => p.permission) ?? []);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchRoleAndPermissions(session.user.id), 0);
        } else {
          setRole(null);
          setPermissions([]);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRoleAndPermissions(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const hasPermission = (permission: string) => permissions.includes(permission);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setPermissions([]);
  };

  return (
    <AuthContext.Provider value={{
      user, session, role, permissions,
      isAdmin: role === "admin",
      loading, hasPermission, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
