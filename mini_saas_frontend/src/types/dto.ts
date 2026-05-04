export type ActionDTO = {
  invoiceId: string;
  customerName: string;
  amountPaise: number;
  action: "send_reminder" | "collect";
  tone: string;
  reason: string;
  confidence: number;
};

export type SummaryDTO = {
  recoveryRate: number;
  avgCollectionTimeHours: number;
  totalRecoveredPaise: number;
  autoRecoveredPaise: number;
  manualRecoveredPaise: number;
  autoRecoveryRate: number; // 0-100
  avgAttributionDelayHours: number;
  pendingPaise: number;
  topReminderStage: number | null;
};
