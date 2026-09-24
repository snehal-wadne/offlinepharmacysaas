
import { apiGet } from "./apiClient";

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

        console.log("📥 MAIN DASHBOARD RESPONSE:");
        console.log(response);

        if (response?.success) {
            console.log("✅ MAIN DASHBOARD SUCCESS");
            console.log("📊 DASHBOARD DATA:", response.data);
        } else {
            console.error(
                "❌ MAIN DASHBOARD FAILED:",
                response?.error
            );
        }

        console.log("========================================");

        return response;
    } catch (error) {
        console.error(
            "❌ MAIN DASHBOARD API EXCEPTION:",
            error
        );

        return {
            success: false,
            error:
                error?.message ||
                "Failed to load main dashboard",
            isOffline: false,
        };
    }
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

