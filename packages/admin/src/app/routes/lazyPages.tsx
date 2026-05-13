import { lazy, type ComponentType } from "react";

// Vite/Vercel 배포가 바뀌면 옛 index.html이 참조하던 chunk hash 파일이 404가 됨.
// dynamic import 실패 시 한 번만 자동 새로고침해서 새 index.html을 받아오게 한다.
// sessionStorage 플래그로 reload loop 방지.
const RELOAD_KEY = "mozu-chunk-reload";

const lazyWithRetry = <T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): ReturnType<typeof lazy<T>> => {
  return lazy(async () => {
    try {
      const mod = await factory();
      // 성공했으면 flag 제거 — 다음 chunk 실패 시 다시 1회 reload 가능
      sessionStorage.removeItem(RELOAD_KEY);
      return mod;
    } catch (err) {
      const alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === "1";
      if (!alreadyReloaded) {
        sessionStorage.setItem(RELOAD_KEY, "1");
        console.warn("[lazy] dynamic import 실패 — 새 빌드 감지, 자동 새로고침:", err);
        window.location.reload();
        // reload 직전 promise는 무한 대기로 두어 React가 ErrorBoundary로 떨어지지 않게 함
        return new Promise<{ default: T }>(() => {});
      }
      console.error("[lazy] dynamic import 재시도 실패:", err);
      throw err;
    }
  });
};

export const StockManagementLayout = lazyWithRetry(() => import("@/pages/stock/ui/StockManagementLayout").then(module => ({ default: module.StockManagementLayout })));
export const StockManagementPage = lazyWithRetry(() => import("@/pages/stock/ui/StockManagementPage").then(module => ({ default: module.StockManagementPage })));
export const StockManagementEditPage = lazyWithRetry(() => import("@/pages/stock/ui/StockManagementEditPage").then(module => ({ default: module.StockManagementEditPage })));
export const StockManagementAddPage = lazyWithRetry(() => import("@/pages/stock/ui/StockManagementAddPage").then(module => ({ default: module.StockManagementAddPage })));

export const ArticleManagementLayout = lazyWithRetry(() => import("@/pages/article/ui/ArticleManagementLayout").then(module => ({ default: module.ArticleManagementLayout })));
export const ArticleManagementPage = lazyWithRetry(() => import("@/pages/article/ui/ArticleManagementPage").then(module => ({ default: module.ArticleManagementPage })));
export const ArticleManagementEditPage = lazyWithRetry(() => import("@/pages/article/ui/ArticleManagementEditPage").then(module => ({ default: module.ArticleManagementEditPage })));
export const ArticleManagementAddPage = lazyWithRetry(() => import("@/pages/article/ui/ArticleManagementAddPage").then(module => ({ default: module.ArticleManagementAddPage })));

export const ClassManagement = lazyWithRetry(() => import("@/pages/class/ui/ClassManagement").then(module => ({ default: module.ClassManagement })));
export const ClassEnvironment = lazyWithRetry(() => import("@/pages/class/ui/ClassEnvironment").then(module => ({ default: module.ClassEnvironment })));
export const ClassEdit = lazyWithRetry(() => import("@/pages/class/ui/ClassEdit").then(module => ({ default: module.ClassEdit })));
export const CreateClass = lazyWithRetry(() => import("@/pages/class/ui/ClassCreate").then(module => ({ default: module.CreateClass })));

export const InvestmentPreparation = lazyWithRetry(() => import("@/pages/monitoring/ui/InvestmentPreparation").then(module => ({ default: module.InvestmentPreparation })));
export const ImprovedClassMonitoringPage = lazyWithRetry(() => import("@/pages/monitoring/ui/ImprovedClassMonitoringPage").then(module => ({ default: module.ImprovedClassMonitoringPage })));
