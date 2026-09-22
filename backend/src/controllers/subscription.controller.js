/**
 * Organisation Subscription Controller
 *
 * Read-only, tenant-scoped view of an organisation's own current
 * subscription plan. Plan changes/payments are handled by the
 * existing public superadmin payment endpoints (create-order/verify),
 * which this screen's checkout flow calls directly.
 */

const subscriptionRepository = require("../repositories/subscription.repository");
const { getAuthorizedOrgId } = require("../utils/tenant-context");

const getCurrentSubscription = async (req, res) => {
  try {
    const organisationId = await getAuthorizedOrgId(req);
    const subscription =
      await subscriptionRepository.getCurrentSubscriptionByOrgId(
        organisationId,
      );

    res.status(200).json({ success: true, data: subscription });
  } catch (error) {
    console.error("Error fetching current subscription:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || "Failed to fetch current subscription",
    });
  }
};

module.exports = { getCurrentSubscription };
