import mongoose from "mongoose";

const AccountSchema = mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: [true, "Username already exists"],
    },
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    avatarChoice: {
      type: String,
      required: true,
    },
    threadId: {
      type: String,
      required: true,
    },
    plan: {
      type: String,
      required: true,
    },
    expires: {
      type: String,
      required: true,
    },
    organizationName: {
      type: String,
      required: true,
    },
    organizationPrimaryObj: {
      type: String,
      required: true,
    },
    organizationSecondaryObj: {
      type: String,
      required: true,
    },
    organizationConstraints: {
      type: String,
      required: true,
    },
    organizationCompliance: {
      type: String,
      required: true,
    },
    organizationOperationalConst: {
      type: String,
      required: true,
    },
    organizationQtySystems: {
      type: String,
      required: true,
    },
    organizationTypeSystem: {
      type: String,
      required: true,
    },
    organizationMTBF: {
      type: String,
      required: true,
    },
    organizationHoursPerMonth: {
      type: String,
      required: true,
    },
    organizationIntervals: {
      type: String,
      required: true,
    },
    organizationDepotTurnAround: {
      type: String,
      required: true,
    },
    organizationRecentChanges: {
      type: String,
      required: true,
    },
    organizationHistorical: {
      type: String,
      required: true,
    },
    organizationTypeOptimization: {
      type: String,
      required: true,
    },
    organizationScenarios: {
      type: String,
      required: true,
    },
    organizationOptimPrefs: {
      type: String,
      required: true,
    },
    organizationSpecialConsideration: {
      type: String,
      required: true,
    },
    organizationRealtimeData: {
      type: String,
      required: true,
    },
    organizationStakeholders: {
      type: String,
      required: true,
    },
    organizationFormat: {
      type: String,
      required: true,
    },
    organizationTimeframe: {
      type: String,
      required: true,
    },
    organizationMetrics: {
      type: String,
      required: true,
    },
    organizationDescription: {
      type: String,
      required: true,
    },
    organizationPrimaries: {
      type: String,
      required: true,
    },
    organizationAdditionalComments: {
      type: String,
      required: true,
    },
    scopeNeedsUpdate: {
      type: Boolean,
      required: true,
    },
  },
  { collection: "accountData" },
  {
    timestamps: true,
  }
);

export const Account = mongoose.model("account", AccountSchema);
//module.exports = User;
