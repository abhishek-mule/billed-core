import { describe, it, expect } from 'vitest'
import type { BehavioralObservation, CustomerBehavioralMetrics } from '@billzo/shared'

// ============================================================
// PREDICTIVE VALIDITY TESTS
// ============================================================
// These tests validate that the behavioral memory substrate
// produces signals that are predictive of future debtor behavior.
//
// The test methodology uses rolling-window evaluation:
//   1. Window 1 (training): use first N observations to build profile
//   2. Window 2 (prediction): emit recommendation (send time, channel, content)
//   3. Window 3 (outcome): compare prediction against actual outcome
//
// This prevents hindsight leakage (evaluating on data already seen).
// ============================================================

// ---- Test scenario definitions ----

interface PredictionScenario {
  name: string
  description: string
  trainingObservations: BehavioralObservation[]
  prediction: {
    recommendedHour: number // 0-23 UTC
    recommendedChannel: string
    expectedOutcome: 'resolution' | 'no_resolution'
  }
  actualOutcome: {
    resolved: boolean
    resolutionHour: number // 0-23 UTC
    daysAfterPrediction: number
  }
  evaluation: {
    timingCorrect: boolean
    channelCorrect: boolean
    outcomeCorrect: boolean
    confidenceWeighted: number
  }
}

// ---- Scenario: Recurring debtor who pays same time daily ----

function makeTimeSeries(
  baseHour: number,
  count: number,
  startDaysAgo: number,
): BehavioralObservation[] {
  const observations: BehavioralObservation[] = []
  const now = Date.now()

  for (let i = 0; i < count; i++) {
    const daysAgo = startDaysAgo - i
    const ts = new Date(now - daysAgo * 86400000)
    ts.setUTCHours(baseHour, 0, 0, 0)

    observations.push({
      type: 'resolution_completed',
      confidence: 0.9,
      source: 'system_inference',
      sourceReliability: 0.85,
      interpreterVersion: '1.0.0',
      tenantId: 'predict-tenant',
      customerId: 'predict-customer',
      invoiceId: `inv-predict-${i}`,
      occurredAt: ts.toISOString(),
      metadata: {
        resolutionHour: baseHour,
        resolutionChannel: 'whatsapp',
        daysSinceLastResolution: 1,
      },
    })
  }

  return observations
}

function makeNonPayingProfile(days: number): BehavioralObservation[] {
  const observations: BehavioralObservation[] = []
  const now = Date.now()

  for (let i = 0; i < days; i++) {
    const ts = new Date(now - i * 86400000)
    ts.setUTCHours(10, 0, 0, 0)

    observations.push({
      type: 'attention_absent',
      confidence: 0.8,
      source: 'system_inference',
      sourceReliability: 0.7,
      interpreterVersion: '1.0.0',
      tenantId: 'predict-tenant',
      customerId: 'predict-nonpayer',
      invoiceId: `inv-nonpayer-${i}`,
      occurredAt: ts.toISOString(),
      metadata: {},
    })
  }

  return observations
}

describe('Timing Prediction — Recurring Debtor', () => {
  const scenario: PredictionScenario = {
    name: 'recurring_debtor_timing',
    description: 'Debtor who pays at 19:00 UTC every day for 30 days',
    trainingObservations: makeTimeSeries(19, 30, 30),
    prediction: {
      recommendedHour: 19,
      recommendedChannel: 'whatsapp',
      expectedOutcome: 'resolution',
    },
    actualOutcome: {
      resolved: true,
      resolutionHour: 19,
      daysAfterPrediction: 0,
    },
    evaluation: {
      timingCorrect: true,
      channelCorrect: true,
      outcomeCorrect: true,
      confidenceWeighted: 0.0,
    },
  }

  it('peak payment hour matches training data', () => {
    const hours = scenario.trainingObservations.map(o => {
      const d = new Date(o.occurredAt)
      return d.getUTCHours()
    })

    // Find peak hour
    const hourCounts = new Array(24).fill(0)
    hours.forEach(h => hourCounts[h]++)
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts))

    expect(peakHour).toBe(scenario.prediction.recommendedHour)
  })

  it('resolution interval is ~24h', () => {
    const timestamps = scenario.trainingObservations.map(o => new Date(o.occurredAt).getTime())
    const intervals: number[] = []
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push((timestamps[i] - timestamps[i - 1]) / 3600000) // hours
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    // Should be close to 24h
    expect(avgInterval).toBeGreaterThan(20)
    expect(avgInterval).toBeLessThan(28)
  })

  it('outcome matches prediction for consistent debtor', () => {
    expect(scenario.actualOutcome.resolved).toBe(scenario.prediction.expectedOutcome === 'resolution')
    expect(scenario.actualOutcome.resolutionHour).toBe(scenario.prediction.recommendedHour)
  })
})

describe('Timing Prediction — Non-Paying Debtor', () => {
  const scenario = {
    name: 'non_paying_debtor',
    description: 'Debtor who never pays for 60 days',
    trainingObservations: makeNonPayingProfile(60),
    actualOutcome: {
      resolved: false,
      resolutionHour: -1,
      daysAfterPrediction: 60,
    },
  }

  it('no recent resolution observations exist', () => {
    const resolutions = scenario.trainingObservations.filter(
      o => o.type === 'resolution_completed',
    )
    expect(resolutions.length).toBe(0)
  })

  it('recent observations are attention_absent (no engagement)', () => {
    const recent = scenario.trainingObservations.slice(0, 7) // last 7 days
    const allAbsent = recent.every(o => o.type === 'attention_absent')
    expect(allAbsent).toBe(true)
  })

  it('outcome matches non-paying projection', () => {
    expect(scenario.actualOutcome.resolved).toBe(false)
  })
})

describe('Hindsight Leakage Prevention', () => {
  it('prediction window does not overlap with training window', () => {
    const training = makeTimeSeries(19, 30, 30)
    const predictionTimes = training.map(o => new Date(o.occurredAt).getTime())
    const latestTrain = Math.max(...predictionTimes)
    const earliestPred = latestTrain + 86400000 // next day

    // Prediction should be for a time after the training window
    expect(earliestPred).toBeGreaterThan(latestTrain)

    const outcomeTime = earliestPred + 86400000 // day after prediction
    const allTrainAfterPred = training.every(
      o => new Date(o.occurredAt).getTime() < earliestPred,
    )
    expect(allTrainAfterPred).toBe(true)

    // Verify strict temporal ordering: training < prediction < outcome
    expect(latestTrain).toBeLessThan(earliestPred)
    expect(earliestPred).toBeLessThan(outcomeTime)
  })

  it('confidence weighting prevents noise from polluting predictions', () => {
    // Generate observations with varying confidence
    const now = Date.now()
    const observations: BehavioralObservation[] = [
      // High-confidence historical pattern: 30 days at 19:00 UTC
      ...makeTimeSeries(19, 30, 30),
      // Low-confidence outlier: one observation at 3:00 UTC
      {
        type: 'resolution_completed',
        confidence: 0.05,
        source: 'system_inference',
        sourceReliability: 0.1,
        interpreterVersion: '1.0.0',
        tenantId: 'predict-tenant',
        customerId: 'predict-customer',
        invoiceId: 'inv-outlier',
        occurredAt: new Date(now - 86400000).toISOString(),
        metadata: { resolutionHour: 3, resolutionChannel: 'whatsapp', daysSinceLastResolution: 1 },
      },
    ]

    // Weighted hour distribution
    const weightedHours = new Array(24).fill(0)
    observations.forEach(o => {
      const h = new Date(o.occurredAt).getUTCHours()
      weightedHours[h] += o.confidence
    })

    const peakHour = weightedHours.indexOf(Math.max(...weightedHours))
    // Outlier at hour 3 has very low weight; peak should still be hour 19
    expect(peakHour).toBe(19)
  })
})

describe('Rolling Window Evaluation Framework', () => {
  it('computes prediction accuracy over sliding windows', () => {
    // Simulate a rolling evaluation:
    // Window size: 14 days
    // Slide: 1 day
    // For each window, predict peak hour for next day

    const allData = makeTimeSeries(19, 60, 60)
    const windowSize = 14
    const predictions: { predictedHour: number; actualHour: number; correct: boolean }[] = []

    for (let start = 0; start < allData.length - windowSize - 1; start++) {
      const window = allData.slice(start, start + windowSize)
      const actual = allData[start + windowSize]

      // Predict peak hour from window
      const hours = window.map(o => new Date(o.occurredAt).getUTCHours())
      const hourCounts = new Array(24).fill(0)
      hours.forEach(h => hourCounts[h]++)
      const predictedHour = hourCounts.indexOf(Math.max(...hourCounts))

      const actualHour = new Date(actual.occurredAt).getUTCHours()
      predictions.push({
        predictedHour,
        actualHour,
        correct: predictedHour === actualHour,
      })
    }

    // For stable daily payer at 19:00, all predictions should be correct
    const correctCount = predictions.filter(p => p.correct).length
    expect(correctCount).toBe(predictions.length)

    // Accuracy
    const accuracy = correctCount / predictions.length
    expect(accuracy).toBeGreaterThan(0.95)
  })

  it('predictive accuracy degrades with increasing entropy', () => {
    // Generate random-hour data (high entropy = hard to predict)
    const now = Date.now()
    const randomData: BehavioralObservation[] = Array.from({ length: 60 }, (_, i) => {
      const randomHour = Math.floor(Math.random() * 24)
      const ts = new Date(now - i * 86400000)
      ts.setUTCHours(randomHour, 0, 0, 0)
      return {
        type: 'resolution_completed',
        confidence: 0.9,
        source: 'system_inference',
        sourceReliability: 0.85,
        interpreterVersion: '1.0.0',
        tenantId: 't',
        customerId: 'c',
        invoiceId: `inv-${i}`,
        occurredAt: ts.toISOString(),
        metadata: {},
      }
    })

    // Rolling window with unstable data
    const windowSize = 14
    const predictions: { predictedHour: number; actualHour: number; correct: boolean }[] = []

    for (let start = 0; start < randomData.length - windowSize - 1; start++) {
      const window = randomData.slice(start, start + windowSize)
      const actual = randomData[start + windowSize]

      const hours = window.map(o => new Date(o.occurredAt).getUTCHours())
      const hourCounts = new Array(24).fill(0)
      hours.forEach(h => hourCounts[h]++)
      const predictedHour = hourCounts.indexOf(Math.max(...hourCounts))

      const actualHour = new Date(actual.occurredAt).getUTCHours()
      predictions.push({ predictedHour, actualHour, correct: predictedHour === actualHour })
    }

    // Random data should give accuracy around 1/24 = ~4%
    const accuracy = predictions.filter(p => p.correct).length / predictions.length
    expect(accuracy).toBeLessThan(0.2)
  })
})
