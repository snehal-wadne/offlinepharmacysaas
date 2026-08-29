<<<<<<< HEAD
# PharmaFlow ERP — Pharmacy Billing & Inventory Management SaaS

Frontend enterprise implementation of the **Pharmacy Billing & Inventory System** for **PharmaFlow ERP**, built with **React Native** and **React Native Web**.

---

## 📁 Repository Structure

```text
pharmacyinventory/
├── backend/                                  # Reserved for backend microservices & database
│   └── README.md
└── frontend/                                 # Complete React Native Web Application
    ├── App.js                                # Root container rendering AppNavigator
    ├── app.json                              # Expo app configuration
    ├── package.json                          # Dependencies & build scripts
    ├── README.md                             # Documentation
    └── src/
        ├── navigation/
        │   └── AppNavigator.js               # Master layout & multi-module state router
        ├── components/
        │   ├── layout/
        │   │   ├── Header.js                 # Branch selector & online status indicator
        │   │   └── Sidebar.js                # Expandable multi-level navigation sidebar
        │   └── inventory/
        │       ├── InventoryStatCard.js      # Executive KPI metric cards
        │       ├── StockSummary.js           # Category summary table
        │       ├── PendingPurchaseOrders.js  # Outstanding PO card
        │       ├── RecentStockMovements.js   # Audit trail log table
        │       ├── QuickActions.js           # Action shortcuts panel
        │       └── SyncStatus.js             # Connectivity indicator
        ├── data/
        │   ├── inventoryDashboardMockData.js # Master dashboard mock dataset
        │   ├── currentStockMockData.js       # Stock adjustments dataset
        │   ├── stockTransferMockData.js      # Stock transfers dataset
        │   ├── lowStockExpiryMockData.js     # Stock status dataset
        │   ├── purchasesMockData.js          # Purchase orders dataset
        │   ├── goodsReceivingMockData.js     # Goods received notes (GRN) dataset
        │   ├── suppliersMockData.js          # Suppliers directory dataset
        │   └── reportsMockData.js            # Valuation, procurement & expiry reports dataset
        └── screens/
            ├── inventory/
            │   ├── InventoryDashboard.js     # Screen 1: Master Dashboard
            │   ├── StockAdjustmentsScreen.js # Screen 2: Stock Information & Add Medicine Form
            │   ├── StockTransferScreen.js    # Screen 3: Branch Stock Transfers & Modal
            │   └── StockStatusScreen.js      # Screen 4: Real-time Stock Levels & Batch Timeline
            ├── purchases/
            │   ├── PurchasesScreen.js        # Screen 5: Purchase Orders Management
            │   ├── GoodsReceivingScreen.js   # Screen 6: Goods Receiving (GRN) & Inspection
            │   └── SuppliersScreen.js        # Screen 7: Suppliers Directory & Terms
            └── reports/
                ├── InventoryReportsScreen.js # Screen 8: Valuation & Fast-Moving Forecast
                ├── PurchaseReportsScreen.js  # Screen 9: Spend & Vendor Lead Time Analytics
                └── ExpiryReportsScreen.js    # Screen 10: Expiry Timeline & Financial Loss Analytics
```

---

## 🧭 Complete Navigation Hierarchy

```text
Dashboard                      ← (Overview Dashboard)
Inventory         [▴ / ▾]      ← (Click to expand / collapse)
  ├── Stock Adjustments        ← (Stock Info Table + Add Medicine Entry Form)
  ├── Stock Transfer           ← (Branch Transfers + New Transfer Modal)
  └── Stock Status             ← (Real-time Stock Levels, Reorder Deficit & Batch Timeline)
Purchases         [▴ / ▾]      ← (Click to expand / collapse)
  ├── Purchases                ← (Purchase Orders + New PO Modal)
  ├── Goods Receiving          ← (GRN Logs & Inspection + Modal)
  └── Suppliers                ← (Vendor Directory & GSTIN + Modal)
Reports           [▴ / ▾]      ← (Click to expand / collapse)
  ├── Inventory Reports        ← (Stock Valuation & Demand Forecast)
  ├── Purchase Reports         ← (Procurement Spend & Vendor Scores)
  └── Expiry Reports           ← (Batch Expiry Timelines, Financial Exposure & Actions)
```

---

## 💻 How to Run the Frontend

```cmd
cd "C:\Users\Harshal\OneDrive\Desktop\paharmacyinventory\frontend"
npm run web
```
=======
# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
>>>>>>> origin/main
