import { Routes, Route } from "react-router-dom";
import { LoginPage, RoleHomeRedirect } from "./features/auth/LoginPage";
import { ProtectedRoute } from "./features/auth/ProtectedRoute";
import { ROLE_ACCESS } from "./features/auth/roleRoutes";
import { ModulePlaceholder } from "./components/ModulePlaceholder";
import { MenuManagementScreen } from "./features/menu";
import { TablesScreen } from "./features/tables";
import { KitchenDisplayScreen } from "./features/kitchen";
import { OrderScreen } from "./features/order";
import { CashierScreen } from "./features/cashier";

/**
 * Top-level route table. Each module lives behind a ProtectedRoute scoped to
 * the roles allowed in ROLE_ACCESS. Module subagents replace the
 * <ModulePlaceholder/> elements with their real screens.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RoleHomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Menu management — admin only */}
      <Route
        path="/menu"
        element={
          <ProtectedRoute allow={ROLE_ACCESS.menuAdmin}>
            <MenuManagementScreen />
          </ProtectedRoute>
        }
      />

      {/* Table management — floor staff */}
      <Route
        path="/tables"
        element={
          <ProtectedRoute allow={ROLE_ACCESS.tables}>
            <TablesScreen />
          </ProtectedRoute>
        }
      />

      {/* Waiter order + KOT */}
      <Route
        path="/order/:tableId?"
        element={
          <ProtectedRoute allow={ROLE_ACCESS.order}>
            <OrderScreen />
          </ProtectedRoute>
        }
      />

      {/* Kitchen display */}
      <Route
        path="/kds"
        element={
          <ProtectedRoute allow={ROLE_ACCESS.kds}>
            <KitchenDisplayScreen />
          </ProtectedRoute>
        }
      />

      {/* Cashier billing */}
      <Route
        path="/bills"
        element={
          <ProtectedRoute allow={ROLE_ACCESS.bills}>
            <CashierScreen />
          </ProtectedRoute>
        }
      />

      {/* Reports / insights */}
      <Route
        path="/insights"
        element={
          <ProtectedRoute allow={ROLE_ACCESS.insights}>
            <ModulePlaceholder title="Insights" />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<RoleHomeRedirect />} />
    </Routes>
  );
}
