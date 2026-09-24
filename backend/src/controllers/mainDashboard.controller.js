// controllers/mainDashboard.controller.js

const mainDashboardRepository = require("../repositories/mainDashboard.repo");

// ============================================================
// GET MAIN DASHBOARD
// ============================================================
// GET /api/dashboard
// GET /api/dashboard?branchId=<uuid>
//
// Without branchId:
//   -> All active branches
//
// With branchId:
//   -> Selected branch only
// ============================================================

const getMainDashboard = async (req, res, next) => {
  try {
    // ----------------------------------------------------------
    // Get organisation from authenticated user
    // ----------------------------------------------------------
    console.log("this is user" , req.user);

    const organisationId =
      req.user?.organisationId ||
      req.user?.organisation_id ||
      req.organisationId ||
      req.organisation_id;

    if (!organisationId) {
      return res.status(401).json({
        success: false,
        error: "Organisation context is required",
        isOffline: false,
      });
    }

    // ----------------------------------------------------------
    // Branch filter
    // ----------------------------------------------------------

    let branchId = req.query?.branchId || null;

    // Frontend may send:
    // ?branchId=all
    // ?branchId=ALL
    // ?branchId=
    if (
      !branchId ||
      branchId.toLowerCase?.() === "all"
    ) {
      branchId = null;
    }

    // ----------------------------------------------------------
    // Repository
    // ----------------------------------------------------------

    const dashboard =
      await mainDashboardRepository.getMainDashboard({
        organisationId,
        branchId,
      });

    // ----------------------------------------------------------
    // Response
    // ----------------------------------------------------------

    return res.status(200).json({
      success: true,
      data: dashboard,
      isOffline: false,
    });

  } catch (error) {
    console.error("Main Dashboard Error:", error);

    if (next) {
      return next(error);
    }

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to load dashboard",
      isOffline: false,
    });
  }
};


// ============================================================
// SUPERADMIN DASHBOARD - METRICS
// ============================================================
// GET /api/v1/superadmin/dashboard/metrics
// ============================================================

const getMetrics = async (req, res, next) => {
  try {
    const metrics =
      await mainDashboardRepository.getDashboardMetrics();

    return res.status(200).json({
      success: true,
      data: metrics,
      isOffline: false,
    });

  } catch (error) {
    console.error("Dashboard Metrics Error:", error);
    return next(error);
  }
};


// ============================================================
// SUPERADMIN DASHBOARD - CHARTS
// ============================================================
// GET /api/v1/superadmin/dashboard/charts
// ============================================================

const getCharts = async (req, res, next) => {
  try {
    const charts =
      await mainDashboardRepository.getDashboardCharts();

    return res.status(200).json({
      success: true,
      data: charts,
      isOffline: false,
    });

  } catch (error) {
    console.error("Dashboard Charts Error:", error);
    return next(error);
  }
};


// ============================================================
// SUPERADMIN DASHBOARD - RECENT ACTIVITY
// ============================================================
// GET /api/v1/superadmin/dashboard/recent-activity
// ============================================================

const getRecentActivity = async (req, res, next) => {
  try {
    const activity =
      await mainDashboardRepository.getRecentActivity();

    return res.status(200).json({
      success: true,
      data: activity,
      isOffline: false,
    });

  } catch (error) {
    console.error("Dashboard Recent Activity Error:", error);
    return next(error);
  }
};


// ============================================================
// SUPERADMIN DASHBOARD - OVERVIEW
// ============================================================
// GET /api/v1/superadmin/dashboard/overview
// ============================================================

const getDashboardOverview = async (req, res, next) => {
  try {
    const [
      metrics,
      charts,
      recentActivity,
    ] = await Promise.all([
      mainDashboardRepository.getDashboardMetrics(),
      mainDashboardRepository.getDashboardCharts(),
      mainDashboardRepository.getRecentActivity(),
    ]);

    return res.status(200).json({
      success: true,

      data: {
        metrics,
        charts,
        recentActivity,
      },

      isOffline: false,
    });

  } catch (error) {
    console.error("Dashboard Overview Error:", error);
    return next(error);
  }
};


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  getMainDashboard,
  getMetrics,
  getCharts,
  getRecentActivity,
  getDashboardOverview,
};