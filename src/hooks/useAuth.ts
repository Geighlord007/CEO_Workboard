import { trpc } from "@/providers/trpc";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { LOGIN_PATH } from "@/const";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = LOGIN_PATH } =
    options ?? {};

  const navigate = useNavigate();

  const utils = trpc.useUtils();

  const {
    data: user,
    isLoading,
    error,
    refetch,
  } = trpc.auth.me.useQuery(undefined, {
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      navigate(redirectPath);
    },
  });

  const logout = useCallback(() => logoutMutation.mutate(), [logoutMutation]);

  /**
   * 本地开发免登录：仅在 vite dev（import.meta.env.DEV）下自动调用 /api/auth/dev-login，
   * 生产构建里这段代码会被剔除，且后端该路由在生产返回 404，双重保险。
   */
  const [devPending, setDevPending] = useState(import.meta.env.DEV);
  const devTried = useRef(false);
  useEffect(() => {
    if (!import.meta.env.DEV || devTried.current) return;
    if (isLoading || user) {
      if (user) setDevPending(false);
      return;
    }
    devTried.current = true;
    void (async () => {
      try {
        await fetch("/api/auth/dev-login", { method: "POST" });
        await refetch();
      } catch {
        /* 忽略：失败则回到正常登录流程 */
      } finally {
        setDevPending(false);
      }
    })();
  }, [isLoading, user, refetch]);

  useEffect(() => {
    if (redirectOnUnauthenticated && !isLoading && !devPending && !user) {
      const currentPath = window.location.pathname;
      if (currentPath !== redirectPath) {
        navigate(redirectPath);
      }
    }
  }, [redirectOnUnauthenticated, isLoading, devPending, user, navigate, redirectPath]);

  return useMemo(
    () => ({
      user: user ?? null,
      isAuthenticated: !!user,
      isLoading: isLoading || logoutMutation.isPending || devPending,
      error,
      logout,
      refresh: refetch,
    }),
    [user, isLoading, logoutMutation.isPending, devPending, error, logout, refetch],
  );
}
