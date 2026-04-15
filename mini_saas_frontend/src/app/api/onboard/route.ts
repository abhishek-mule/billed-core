import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const data = await request.json()
    
    // Call n8n webhook
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL
    
    if (n8nWebhookUrl) {
      const response = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      })
      
      const n8nData = await response.json()
      console.log('n8n response:', n8nData)
    } else {
      console.log('N8N_WEBHOOK_URL not set. Simulating processing:', data)
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Onboarding initiated. Credentials will be sent shortly.' 
    })
  } catch (error) {
    console.error('Onboarding error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process onboarding' },
      { status: 500 }
    )
  }
}
