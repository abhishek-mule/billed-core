/**
 * MerchantLanguage — frozen vocabulary contract.
 *
 * All merchant-facing UI copy lives here. No hardcoded strings
 * in pages or components. Computed/business language goes in
 * work-engine builders, not here.
 *
 * Adding a key: 1) add key + value, 2) wire into pages.
 * Never hardcode text in a page again.
 */
export declare const MerchantLanguage: {
    readonly common: {
        readonly reason: "Reason";
        readonly automatic: "Automatic";
        readonly manual: "Manual";
        readonly all: "All";
        readonly done: "Done";
        readonly reset: "Reset";
        readonly change: "Change";
        readonly pause: "Pause";
        readonly cancel: "Cancel";
        readonly save: "Save";
        readonly edit: "Edit";
        readonly back: "Back";
        readonly next: "Next";
        readonly search: "Search";
        readonly import: "Import";
        readonly noResults: "No results";
        readonly retry: "Retry";
        readonly refresh: "Refresh";
        readonly sync: "Sync";
        readonly viewAll: "View all";
        readonly noActivityYet: "No activity yet.";
        readonly noActivityYetToday: "No activity yet today.";
        readonly send: "Send";
        readonly schedule: "Schedule";
    };
    readonly dashboard: {
        readonly heading: "Today's Work";
        readonly cashPosition: "Today's cash position";
        readonly recentActivity: "Recent activity";
        readonly todaysWorkComplete: "Today's work is complete";
        readonly nothingNeedsAttention: "Nothing needs your attention today";
        readonly allFollowupsScheduled: "All follow-ups are scheduled. We'll remind you when action is needed.";
        readonly nobodyOwesYou: "Nobody owes you money today.";
        readonly allCaughtUp: "All caught up.";
        readonly waitingToBeCollected: "waiting to be collected";
        readonly moneyToCollect: "Money to Collect";
        readonly receivedToday: "Received Today";
        readonly expectedToday: "expected today";
        readonly noPaymentsExpected: "No payments expected today";
        readonly doTheseFirst: "Do these first";
        readonly openUdhar: "Open Udhar";
        readonly viewOutstanding: "View Outstanding";
        readonly fromCustomers: (n: number) => string;
        readonly reports: "Reports";
        readonly couldNotLoad: "Could not load your day";
        readonly customersNeedAttention: (n: number) => string;
    };
    readonly customer: {
        readonly heading: "Customers";
        readonly allCustomers: "All customers";
        readonly backToCustomers: "Back to customers";
        readonly selectACustomer: "Select a customer to view details";
        readonly activeCustomers: "Active Customers";
        readonly noCustomersYet: "No customers yet";
        readonly addCustomer: "Add Customer";
        readonly noMatch: "No customers match your search";
        readonly failedToLoad: "Failed to load customers. Please try again.";
        readonly outstanding: "Outstanding";
        readonly lifetimePurchases: "Lifetime purchases";
        readonly paymentsReceived: "Payments Received";
        readonly everythingLooksGood: "Everything looks good";
        readonly nothingToDo: "Nothing to do.";
        readonly noPendingInvoices: "No pending invoices.";
        readonly notFound: "Customer not found.";
        readonly reliable: "Reliable customer";
        readonly needsAttention: "Needs attention";
        readonly overdue: "Overdue";
        readonly dueSoon: "Due Soon";
        readonly clear: "Clear";
        readonly critical: "Critical";
        readonly invoices: "Invoices";
        readonly payments: "Payments";
        readonly noInvoicesYet: "No invoices yet";
        readonly noPaymentsYet: "No payments yet";
        readonly totalReceivables: "Total Receivables";
        readonly totalPayables: "Total Payables";
        readonly pendingInvoices: "Pending Invoices";
        readonly oldestDue: "Oldest Due";
        readonly lifetime: "Lifetime";
        readonly phone: "Phone";
        readonly whatsapp: "WhatsApp";
        readonly email: "Email";
        readonly gstin: "GSTIN";
        readonly address: "Address";
        readonly remind: "Remind";
        readonly pay: "Pay";
        readonly call: "Call";
        readonly profile: "Profile";
    };
    readonly payment: {
        readonly received: "Payment received";
        readonly reminderSent: "Reminder sent";
        readonly waiting: "Waiting";
        readonly receivePayment: "Receive Payment";
        readonly sendReminder: "Send Reminder";
        readonly recordPayment: "Record Payment";
        readonly promise: "Promise";
        readonly reversePayment: "Reverse Payment";
        readonly paymentDetails: "Payment Details";
        readonly method: "Method";
        readonly time: "Time";
        readonly notes: "Notes";
        readonly refId: "Ref ID";
        readonly selectParty: "Select party";
        readonly enterAmount: "Enter amount";
        readonly paymentMethod: "Payment method";
        readonly fullAmount: "Full amount";
        readonly half: "Half";
        readonly noPaymentsRecorded: "No payments recorded yet";
        readonly createInvoice: "Create invoice";
        readonly collected: "collected";
        readonly todayCollected: "Today collected";
        readonly thisMonth: "This month";
        readonly reversal: "Reversal";
    };
    readonly udhar: {
        readonly heading: "Udhar";
        readonly subtitle: "Who owes you money and what to do next.";
        readonly waitingToBeCollected: "waiting to be collected";
        readonly allCaughtUp: "All caught up";
        readonly noOutstandingPayments: "No outstanding payments to follow up on.";
        readonly searchCustomer: "Search customer...";
        readonly needAction: "Need Action";
        readonly reminder: "Reminder";
        readonly history: "History";
        readonly overdueDays: (days: number) => string;
        readonly paymentPending: "Payment pending";
        readonly promiseDate: (date: string) => string;
    };
    readonly recovery: {
        readonly queue: "Recovery Queue";
        readonly manage: "Recovery Manage";
        readonly history: "Recovery History";
        readonly manageSubtitle: "Upcoming automations and actions";
        readonly noUpcomingActions: "No upcoming actions";
        readonly needsCall: "Needs call";
        readonly todaysCollection: "Today's collection";
        readonly toCollect: "To collect";
        readonly noActivityYet: "No activity yet";
        readonly totalCustomers: "Total Customers";
        readonly atRisk: "At Risk";
        readonly overdueToday: "Overdue Today";
        readonly promises: "Promises";
        readonly allDone: "All done";
        readonly sendNow: "Send now";
        readonly searchByNameOrPhone: "Search by name or phone...";
        readonly completed: (done: number, total: number) => string;
        readonly stillOutstanding: (amount: string) => string;
    };
    readonly state: {
        readonly allClear: "All clear";
        readonly active: "Active";
        readonly allCaughtUp: "All caught up";
        readonly autoFollowup: "Auto follow-up";
        readonly autoFollowupResumes: "Auto follow-up resumes";
        readonly managedAutomatically: "Managed automatically";
        readonly manualMode: "Manual mode";
        readonly manualOnly: "Manual only";
        readonly paused: "Paused";
        readonly pausedByYou: "Paused by you";
        readonly waiting: "Waiting";
        readonly completed: "Completed";
        readonly today: "Today";
        readonly tomorrow: "Tomorrow";
        readonly thisWeek: "This week";
        readonly later: "Later";
        readonly overdue: "Overdue";
        readonly needsReview: "Needs Review";
    };
    readonly action: {
        readonly callCustomer: "Call customer";
        readonly sendReminder: "Send reminder";
        readonly receivePayment: "Receive Payment";
        readonly addCustomer: "Add Customer";
        readonly createInvoice: "Create Invoice";
        readonly viewHistory: "View History";
        readonly refresh: "Refresh";
        readonly retry: "Retry";
        readonly save: "Save";
        readonly cancel: "Cancel";
        readonly change: "Change";
        readonly edit: "Edit";
        readonly invite: "Invite";
        readonly upgrade: "Upgrade to Pro";
        readonly upgradeNow: "Upgrade Now";
        readonly seeCustomerNames: "See customer names, send reminders, and track promises.";
    };
    readonly empty: {
        readonly noCustomers: "No customers yet. Add your first customer.";
        readonly noInvoices: "No invoices yet. Create your first invoice.";
        readonly noPayments: "No payments recorded yet.";
        readonly noActivity: "No activity yet today.";
        readonly allCaughtUp: "All caught up";
    };
    readonly error: {
        readonly loadFailed: "Could not load data.";
        readonly generic: "Something went wrong.";
        readonly networkError: "Network error — could not send reminder";
        readonly upgradeRequired: "Upgrade to Pro to send reminders from the queue";
    };
};
//# sourceMappingURL=index.d.ts.map