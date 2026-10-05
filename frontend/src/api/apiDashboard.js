
import { apiGet } from "./apiClient";
import { getOfflineDashboard } from "../offline/offlineInventoryService";

export const fetchMainDashboard = async (branchId = null) => {
    try {
        let endpoint = "/api/dashboard";

        if (
            branchId &&
            branchId !== "all" &&
            branchId !== "ALL"
        ) {
            endpoint += `?branchId=${encodeURIComponent(branchId)}`;
        }

        console.log("========================================");
        console.log("📊 MAIN DASHBOARD API");
        console.log("========================================");
        console.log("Endpoint:", endpoint);
        console.log(
            "Branch:",
            branchId || "ALL ACTIVE BRANCHES"
        );

        const response = await apiGet(endpoint);

        if (response?.success) {
            console.log("✅ MAIN DASHBOARD SUCCESS");
            // Cache successful dashboard payload locally
            if (typeof window !== "undefined") {
                try {
                    window.localStorage?.setItem(
                        `cached_dashboard_${branchId || "all"}`,
                        JSON.stringify(response.data)
                    );
                } catch (_) {}
            }
            return response;
        } else {
            console.warn("⚠️ Online fetchMainDashboard failed, computing from local Dexie:", response?.error);
        }
    } catch (error) {
        console.warn("⚠️ MAIN DASHBOARD API EXCEPTION, computing from local Dexie:", error?.message);
    }

    // Resilient offline fallback: Compute from local IndexedDB
    try {
        const offlineRes = await getOfflineDashboard(branchId);
        if (offlineRes?.success) {
            return offlineRes;
        }
    } catch (offlineErr) {
        console.warn("Failed to compute offline dashboard:", offlineErr?.message);
    }

    // Secondary fallback: Retrieve last cached payload from localStorage
    if (typeof window !== "undefined") {
        try {
            const cached = window.localStorage?.getItem(`cached_dashboard_${branchId || "all"}`);
            if (cached) {
                return {
                    success: true,
                    isOffline: true,
                    data: JSON.parse(cached),
                };
            }
        } catch (_) {}
    }

    return {
        success: false,
        error: "Failed to load dashboard data (offline and no local cache available)",
        isOffline: true,
    };
};

export const testMainDashboardApi = async () => {
    console.log("🧪 TESTING MAIN DASHBOARD API...");

    const response = await fetchMainDashboard();

    console.log(
        "🧪 MAIN DASHBOARD TEST RESULT:",
        response
    );

    return response;
};

