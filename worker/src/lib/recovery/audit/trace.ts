// ============================================================
// Trace CLI - Single Invoice Financial Debugger
// ============================================================

import { loadInvoiceEvents, loadInvoiceCurrentState } from './event-loader';
import { applyEvent, INITIAL_PROJECTION } from '../reducer';
import { TraceResult, InvoiceTraceStep, FinancialEvent } from './types';

export async function traceInvoice(invoiceId: string, tenantId: string): Promise<TraceResult> {
  // 1. Load current state
  const currentState = await loadInvoiceCurrentState(invoiceId, tenantId);
  
  // 2. Load financial events
  const events = await loadInvoiceEvents(invoiceId, tenantId);
  
  // 3. Filter to only financial events that affect money
  const financialEvents = events.filter(event => 
    ['invoice.created', 'invoice.overdue', 'payment.recorded', 
     'payment.reversed', 'invoice.adjusted', 'invoice.cancelled',
     'payment.completed', 'payment.reconciled'].includes(event.type)
  );
  
  // 4. Replay events through reducer to compute reducer state
  let reducerProjection = { ...INITIAL_PROJECTION };
  const steps: InvoiceTraceStep[] = [];
  let invariantViolations = 0;
  
  for (let i = 0; i < financialEvents.length; i++) {
    const event = financialEvents[i];
    
    // Map event type to reducer event format
    const reducerEvent = mapToReducerEvent(event);
    
    // Take snapshot before
    const before = {
      invoiceAmount: reducerProjection.invoiceAmount,
      totalPaid: reducerProjection.totalPaid,
      totalReversed: reducerProjection.totalReversed,
      totalAdjusted: reducerProjection.totalAdjusted,
      outstanding: reducerProjection.outstanding,
      status: reducerProjection.status,
    };
    
    // Apply event
    const after = applyEvent(reducerProjection, reducerEvent);
    reducerProjection = after;
    
    // Calculate invariant
    const invariant = calculateInvariant(before, after, event);
    if (!invariant.passed) invariantViolations++;
    
    // Create step
    const step: InvoiceTraceStep = {
      eventIndex: i,
      eventType: event.type,
      eventId: event.id,
      occurredAt: event.occurredAt,
      before,
      event,
      after,
      invariant,
    };
    
    steps.push(step);
  }
  
  // 5. Calculate drift
  const drift = currentState.triggerOutstanding - reducerProjection.outstanding;
  const driftDetected = drift !== 0;
  
  // 6. Build result
  const result: TraceResult = {
    invoiceId,
    tenantId: currentState.invoiceData?.tenant_id || tenantId,
    customerId: currentState.invoiceData?.customer_id || '',
    invoiceNumber: currentState.invoiceData?.invoice_number,
    steps,
    currentState: {
      triggerOutstanding: currentState.triggerOutstanding,
      reducerOutstanding: reducerProjection.outstanding,
      recoveryCaseOutstanding: currentState.recoveryCaseOutstanding,
    },
    drift,
    driftDetected,
    summary: {
      totalEvents: financialEvents.length,
      financialEvents: financialEvents.length,
      invariantViolations,
    },
  };
  
  console.log('[Trace]', 'Trace completed', {
    invoiceId,
    totalEvents: financialEvents.length,
    drift,
    invariantViolations,
  });
  
  return result;
}

function mapToReducerEvent(event: FinancialEvent): any {
  switch (event.type) {
    case 'invoice.created':
      return { type: 'invoice.created', amount: event.amount || 0 };
    case 'invoice.overdue':
      return { type: 'invoice.overdue' };
    case 'payment.recorded':
      return { type: 'payment.recorded', amount: event.amount || 0 };
    case 'payment.reversed':
      return { type: 'payment.reversed', amount: event.amount || 0 };
    case 'invoice.adjusted':
      return { type: 'invoice.adjusted', amount: event.adjustmentAmount || 0, adjustmentType: event.adjustmentType || 'debit' as const };
    case 'invoice.cancelled':
      return { type: 'invoice.cancelled' };
    case 'payment.completed':
    case 'payment.reconciled':
      return { type: 'payment.recorded', amount: event.amount || 0 };
    default:
      throw new Error(`Unknown financial event type: ${event.type}`);
  }
}

function calculateInvariant(before: any, after: any, event: FinancialEvent) {
  const eventType = event.type;
  const amount = event.amount || 0;
  let check = '';
  let passed = true;
  let expected = 0;
  let actual = 0;

  // Balance identity: outstanding = invoiceAmount - totalPaid + totalReversed + totalAdjusted
  if (eventType !== 'invoice.cancelled') {
    const computedOutstanding = after.invoiceAmount - after.totalPaid + after.totalReversed + after.totalAdjusted;
    const balanceCheck = computedOutstanding === after.outstanding;
    if (!balanceCheck) {
      return {
        check: `Balance identity violated: invoiceAmount - totalPaid + totalReversed + totalAdjusted = ${computedOutstanding} but outstanding = ${after.outstanding}`,
        passed: false,
        expected: computedOutstanding,
        actual: after.outstanding,
      };
    }
  }

  switch (eventType) {
    case 'invoice.created':
      passed = after.outstanding === amount;
      check = `Outstanding should equal invoice amount after creation`;
      expected = amount;
      actual = after.outstanding;
      break;
    case 'payment.recorded':
      passed = after.outstanding === before.outstanding - amount;
      check = `Outstanding should decrease by payment amount`;
      expected = before.outstanding - amount;
      actual = after.outstanding;

      // Overpayment guard: outstanding should not go negative
      if (after.outstanding < 0) {
        check += ` | ⚠️ Overpayment: outstanding went negative (${after.outstanding})`;
        passed = false;
      }
      break;
    case 'payment.reversed':
      expected = before.outstanding + amount;
      passed = after.outstanding === expected;
      check = `Outstanding should increase by reversal amount`;
      actual = after.outstanding;
      break;
    case 'invoice.adjusted':
      expected = before.outstanding + (event.adjustmentType === 'credit' ? -amount : amount);
      passed = after.outstanding === expected;
      check = `Outstanding should adjust by ${event.adjustmentType || 'unknown'} amount`;
      actual = after.outstanding;
      break;
    case 'invoice.cancelled':
      passed = after.outstanding === 0;
      check = `Cancelled invoice outstanding should be 0`;
      expected = 0;
      actual = after.outstanding;
      break;
    case 'invoice.overdue':
      passed = after.outstanding === before.outstanding;
      check = `Overdue status should not affect outstanding amount`;
      expected = before.outstanding;
      actual = after.outstanding;
      break;
    default:
      check = `No invariant check defined for ${eventType}`;
      passed = true;
      break;
  }

  return { check, passed, expected, actual };
}

export async function runTrace(invoiceId: string, tenantId: string): Promise<void> {
  const result = await traceInvoice(invoiceId, tenantId);
  
  console.log('\n' + '='.repeat(60));
  console.log(`INVOICE TRACE: ${result.invoiceNumber || result.invoiceId}`);
  console.log('='.repeat(60));
  console.log(`Tenant: ${result.tenantId}`);
  console.log(`Customer: ${result.customerId}`);
  console.log('\nCURRENT STATE:');
  console.log(`  Trigger (invoices.outstanding_amount): ${result.currentState.triggerOutstanding}`);
  console.log(`  Reducer (replayed events):        ${result.currentState.reducerOutstanding}`);
  console.log(`  RecoveryCase (aggregate):         ${result.currentState.recoveryCaseOutstanding || 'N/A'}`);
  console.log(`  DRIFT:                              ${result.drift}`);
  console.log('\nEVENTS:');
  
  for (const step of result.steps) {
    const status = step.invariant.passed ? '✓' : '✗';
    console.log(`\n${status} ${step.eventIndex + 1}. ${step.eventType} (${step.occurredAt.slice(0, 10)})`);
    if (!step.invariant.passed) {
      console.log(`   VIOLATION: ${step.invariant.check}`);
      console.log(`   Expected: ${step.invariant.expected}, Got: ${step.invariant.actual}`);
    } else {
      console.log(`   ${step.invariant.check}`);
    }
  }
  
  console.log('\nSUMMARY:');
  console.log(`  Total Events: ${result.summary.totalEvents}`);
  console.log(`  Invariant Violations: ${result.summary.invariantViolations}`);
  
  if (result.driftDetected) {
    console.log('\n⚠️  DRIFT DETECTED!');
    console.log('   Your financial truth is inconsistent.');
  } else {
    console.log('\n✅ NO DRIFT - Financial truth is consistent.');
  }
  
  console.log('\n' + '='.repeat(60));
}

// CLI (lightweight — no commander dependency)
export function parseArgs(): { invoice: string; tenant: string } {
  const args = process.argv.slice(2);
  let invoice = '';
  let tenant = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-i' || args[i] === '--invoice') invoice = args[++i] || '';
    else if (args[i] === '-t' || args[i] === '--tenant') tenant = args[++i] || '';
  }
  if (!invoice || !tenant) {
    console.error('Usage: pnpm recovery:trace -i <invoiceId> -t <tenantId>');
    process.exit(1);
  }
  return { invoice, tenant };
}

if (require.main === module) {
  const { invoice, tenant } = parseArgs();
  runTrace(invoice, tenant).catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}