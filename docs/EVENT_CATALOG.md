# Event Catalog

## Convention

### Events: `subject.past_tense_verb`

```
invoice.created
payment.recorded
reminder.sent
customer.promised
merchant.called_customer
```

### Commands: `verb_noun` (imperative, snake_case)

```
send_reminder
record_payment
mark_promise
schedule_reminder
```

**Events** are things that **happened** (past tense, dotted).
**Commands** are things a **merchant or system can do** (imperative, snake_case).

Never use the same name for a command and an event:

| Command | Event |
|---------|-------|
| `send_reminder` | `reminder.sent` |
| `record_payment` | `payment.recorded` |
| `mark_promise` | `promise.made` |
| `schedule_reminder` | `reminder.scheduled` |

---

## Grammar Rules

### 1. Events use `noun.past_participle`

```
invoice.created
invoice.updated
invoice.cancelled

payment.recorded
payment.reversed

customer.called
customer.promised_payment
customer.opened_message
customer.responded

reminder.sent
reminder.scheduled
reminder.failed

message.delivered
message.read
message.failed

recovery.scheduled
recovery.executed
recovery.completed
```

### 2. Merchant-initiated actions get `merchant.` prefix

```
merchant.called_customer
merchant.sent_reminder
merchant.recorded_payment
merchant.snoozed
merchant.flagged
merchant.marked_promise
merchant.marked_disputed
merchant.marked_resolved
```

### 3. Customer-initiated actions get `customer.` prefix

```
customer.promised_payment
customer.paid
customer.disputed
customer.opened_message
customer.responded
```

### 4. System-initiated actions get no actor prefix (bare noun)

```
reminder.sent
recovery.scheduled
payment.recorded
invoice.overdue
```

### 5. Never use:

```
❌ follow_up_call
❌ promise_followup
❌ sendReminder
❌ callCustomer
❌ customer.call
❌ reminder.send
```

---

## Current Events

| Event | Actor | When |
|-------|-------|------|
| `invoice.created` | merchant/system | Invoice generated |
| `invoice.overdue` | system | Due date passed |
| `invoice.cancelled` | merchant | Invoice voided |
| `payment.recorded` | merchant/system/customer | Payment captured |
| `payment.reversed` | system | Payment refunded |
| `payment.failed` | system | Payment declined |
| `customer.called` | merchant | Merchant called customer |
| `customer.promised_payment` | customer | Customer committed to pay |
| `customer.disputed` | customer | Customer disputed debt |
| `customer.responded` | customer | Customer replied to message |
| `customer.opened_message` | customer | Customer read WhatsApp |
| `customer.reminded` | system | Auto-reminder triggered |
| `reminder.sent` | merchant/system | Reminder dispatched |
| `reminder.scheduled` | merchant/system | Reminder queued |
| `reminder.failed` | system | Reminder delivery failed |
| `reminder.delivered` | system | Reminder arrived |
| `message.sent` | merchant/system | Outbound message |
| `message.delivered` | system | Message confirmed delivered |
| `message.read` | system | Message read by customer |
| `message.failed` | system | Message delivery failed |
| `recovery.scheduled` | system | Recovery plan action queued |
| `recovery.executed` | system | Recovery action executed |
| `recovery.completed` | merchant/system | Case resolved |
| `recovery.overridden` | merchant | Merchant overrode plan |
| `merchant.snoozed` | merchant | Merchant paused case |
| `merchant.flagged` | merchant | Merchant flagged account |
| `merchant.marked_promise` | merchant | Merchant recorded promise |
| `merchant.marked_disputed` | merchant | Merchant marked dispute |
| `merchant.marked_resolved` | merchant | Merchant closed case |

---

## Current Commands

| Command | Description |
|---------|-------------|
| `send_reminder` | Dispatch reminder message immediately |
| `schedule_reminder` | Queue reminder for later delivery |
| `record_payment` | Log payment against invoice |
| `mark_promise` | Record customer promise to pay |
| `snooze` | Pause recovery case temporarily |
| `mark_disputed` | Flag invoice as disputed |
| `mark_resolved` | Close recovery case |
| `call` | Initiate phone call (legacy — will be renamed to `call_customer`) |

---

## Migration Plan

When renaming, **never rename database enum values in-place** — add new values,
migrate code to write new values, then drop old values after one deploy cycle.

Example for `next_action_type` enum:

1. Add `call_customer` to the recovery_next_action enum  
2. Update all code to write `call_customer` instead of `call`  
3. Verify in production for one cycle  
4. Remove `call` from enum  

---

## Schema Versioning

If an event payload ever changes in a backward-incompatible way:

```json
{
  "event": "payment.recorded",
  "schemaVersion": 2,
  "payload": { ... }
}
```

Increment `schemaVersion` and keep the old version flowing for one migration
cycle to allow replays to process both versions.
