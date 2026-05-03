import Razorpay from 'razorpay'

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
})

export async function createOrder(amount: number, currency = 'INR', receipt: string) {
  return await razorpay.orders.create({
    amount: amount * 100, // paise
    currency,
    receipt,
  })
}
