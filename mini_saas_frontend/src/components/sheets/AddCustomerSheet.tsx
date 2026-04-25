'use client'

import { useState } from 'react'
import { Sheet, Input, Button } from './Base'

export function AddCustomerSheet({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [gstin, setGstin] = useState('')

  return (
    <Sheet onClose={onClose} title="Add Customer">
      <div className="space-y-4">
        <Input 
          label="Customer Name *" 
          placeholder="e.g. Amit Kumar" 
          value={name} 
          onChange={setName} 
        />
        <Input 
          label="Phone Number *" 
          prefix="+91" 
          placeholder="10-digit mobile" 
          value={phone} 
          onChange={setPhone} 
          type="tel"
        />
        <Input 
          label="GSTIN" 
          optional 
          placeholder="e.g. 27AADCB2230M1Z2" 
          value={gstin} 
          onChange={setGstin} 
        />
        
        <div className="pt-2">
          <Button onClick={() => {
            console.log('Saving customer:', { name, phone, gstin })
            onClose()
          }}>
            Save Customer
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
