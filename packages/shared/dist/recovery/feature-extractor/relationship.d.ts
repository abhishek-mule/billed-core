import type { NormalizedRecoveryEvent } from '../normalized-event';
export declare const PREFERRED_ACTIONS: readonly ["reminder", "call", "visit", "escalate", "wait"];
export type PreferredAction = (typeof PREFERRED_ACTIONS)[number];
export declare const COMMUNICATION_PREFERENCES: readonly ["friendly", "professional", "urgent", "unknown"];
export type CommunicationPreference = (typeof COMMUNICATION_PREFERENCES)[number];
export interface RelationshipFeatures {
    preferredAction: PreferredAction;
    communicationPreference: CommunicationPreference;
    respondsToCall: boolean;
    respondsToReminder: boolean;
}
export declare function extractRelationshipFeatures(events: NormalizedRecoveryEvent[]): RelationshipFeatures;
//# sourceMappingURL=relationship.d.ts.map