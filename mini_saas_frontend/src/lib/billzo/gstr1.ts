export interface GSTR1Export {
  gstin: string
  fp: string
  gt: number
  cur_gt: number
  b2b: B2BInvoice[]
  b2cs: B2CSInvoice[]
  nil: NilSupplies
  hsn: HSNSummary[]
  doc_issue: DocIssue[]
}

export interface B2BInvoice {
  ctin: string
  cfs: unknown[]
  inv: B2BInvDetail[]
}

export interface B2BInvDetail {
  inum: string
  idt: string
  val: number
  pos: string
  rchg: boolean
  etin: string
  chksum: string
  itms: ItemDetail[]
}

export interface B2CSInvoice {
  sply_ty: 'INTRA' | 'INTER'
  typ: 'OE'
  etin: string
  pos: string
  invo: B2CSInvDetail[]
}

export interface B2CSInvDetail {
  inum: string
  idt: string
  val: number
  pos: string
  chksum: string
  itms: ItemDetail[]
}

export interface ItemDetail {
  slno: number
  itm_det: ItemTaxDetail
}

export interface ItemTaxDetail {
  txval: number
  rt: number
  iamt: number
  camt: number
  samt: number
  csamt: number
}

export interface NilSupplies {
  nil_amt: number
  expt_amt: number
  ngsup_amt: number
}

export interface HSNSummary {
  hsn_sc: string
  desc: string
  uqc: string
  qty: number
  rt: number
  txval: number
  iamt: number
  camt: number
  samt: number
  csamt: number
}

export interface DocIssue {
  doc_num: number
  doc_typ: string
  doc_dt: string
  tot_num: number
}

const round2 = (n: number): number => Math.round(n * 100) / 100

function fmtDate(isoStr: string): string {
  const d = new Date(isoStr)
  const day = String(d.getDate()).padStart(2, '0')
  const mon = String(d.getMonth() + 1).padStart(2, '0')
  const yr = d.getFullYear()
  return `${day}-${mon}-${yr}`
}

export async function generateGSTR1JSON(
  tenantId: string,
  month: number,
  year: number,
  supabaseAdmin: any
): Promise<GSTR1Export> {
  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from('tenants')
    .select('gstin, place_of_supply')
    .eq('id', tenantId)
    .single()

  if (tenantErr || !tenant) throw new Error('Tenant not found')
  if (!tenant.gstin) throw new Error('Tenant GSTIN not configured')

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endOfMonth = new Date(year, month, 0)
  const endDate = endOfMonth.toISOString().slice(0, 10)

  const { data: invoices, error: invErr } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('tenant_id', tenantId)
    .gte('created_at', `${startDate}T00:00:00.000Z`)
    .lte('created_at', `${endDate}T23:59:59.999Z`)

  if (invErr) throw new Error(`Failed to fetch invoices: ${invErr.message}`)

  const allInvoices = invoices || []
  let totalTurnover = 0

  const b2bMap = new Map<string, B2BInvDetail[]>()
  const b2csList: B2CSInvDetail[] = []
  const hsnMap = new Map<string, HSNSummary>()
  let nilAmt = 0

  for (const inv of allInvoices) {
    const invTotal = Number(inv.total) || 0
    totalTurnover += invTotal

    const { data: items, error: itemsErr } = await supabaseAdmin
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', inv.id)

    if (itemsErr) continue

    const invoiceItems = items || []
    const tenantPos = tenant.place_of_supply || ''
    const invPos = inv.place_of_supply || tenantPos
    const isIntra = invPos === tenantPos

    const lineItems: ItemDetail[] = invoiceItems.map((item: any, idx: number) => {
      const gstRate = Number(item.gst_rate) || 0
      const amt = Number(item.amount) || 0
      const txval = gstRate > 0 ? round2(amt * 100 / (100 + gstRate)) : amt
      const totalGST = round2(amt - txval)

      let iamt = 0, camt = 0, samt = 0
      if (isIntra) {
        camt = round2(totalGST / 2)
        samt = round2(totalGST / 2)
      } else {
        iamt = totalGST
      }

      const hsnCode = item.hsn || item.item_code || 'N/A'
      const exists = hsnMap.get(hsnCode)
      if (exists) {
        exists.qty += Number(item.quantity) || 0
        exists.txval = round2(exists.txval + txval)
        exists.iamt = round2(exists.iamt + iamt)
        exists.camt = round2(exists.camt + camt)
        exists.samt = round2(exists.samt + samt)
      } else {
        hsnMap.set(hsnCode, {
          hsn_sc: hsnCode,
          desc: item.item_name || '',
          uqc: 'NOS',
          qty: Number(item.quantity) || 0,
          rt: gstRate,
          txval,
          iamt,
          camt,
          samt,
          csamt: 0
        })
      }

      if (gstRate === 0) {
        nilAmt = round2(nilAmt + amt)
      }

      return {
        slno: idx + 1,
        itm_det: { txval, rt: gstRate, iamt, camt, samt, csamt: 0 }
      }
    })

    const invNum = inv.invoice_number || inv.id
    const invDate = fmtDate(inv.created_at)

    if (inv.customer_gstin && inv.customer_gstin.trim() !== '') {
      const detail: B2BInvDetail = {
        inum: invNum,
        idt: invDate,
        val: invTotal,
        pos: invPos,
        rchg: false,
        etin: '',
        chksum: '',
        itms: lineItems
      }

      const ctin = inv.customer_gstin
      if (!b2bMap.has(ctin)) b2bMap.set(ctin, [])
      b2bMap.get(ctin)!.push(detail)
    } else if (invTotal <= 250000) {
      const detail: B2CSInvDetail = {
        inum: invNum,
        idt: invDate,
        val: invTotal,
        pos: invPos,
        chksum: '',
        itms: lineItems
      }
      b2csList.push(detail)
    }
  }

  const b2b: B2BInvoice[] = Array.from(b2bMap.entries()).map(([ctin, invs]) => ({
    ctin,
    cfs: [],
    inv: invs
  }))

  const b2csMap = new Map<string, B2CSInvDetail[]>()
  for (const d of b2csList) {
    const pos = d.pos || tenant.place_of_supply || ''
    if (!b2csMap.has(pos)) b2csMap.set(pos, [])
    b2csMap.get(pos)!.push(d)
  }

  const b2cs: B2CSInvoice[] = Array.from(b2csMap.entries()).map(([pos, invs]) => {
    const splyTy = pos === (tenant.place_of_supply || '') ? 'INTRA' as const : 'INTER' as const
    return { sply_ty: splyTy, typ: 'OE', etin: '', pos, invo: invs }
  })

  const docIssue: DocIssue[] = [{
    doc_num: 1,
    doc_typ: 'INV',
    doc_dt: `${String(endOfMonth.getDate()).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`,
    tot_num: allInvoices.length
  }]

  const gt = round2(totalTurnover)

  const result: GSTR1Export = {
    gstin: tenant.gstin,
    fp: `${String(month).padStart(2, '0')}${year}`,
    gt,
    cur_gt: gt,
    b2b,
    b2cs,
    nil: { nil_amt: round2(nilAmt), expt_amt: 0, ngsup_amt: 0 },
    hsn: Array.from(hsnMap.values()),
    doc_issue: docIssue
  }

  await supabaseAdmin
    .from('gstr_exports')
    .upsert({
      tenant_id: tenantId,
      month,
      year,
      export_data: result,
      status: 'GENERATED',
      updated_at: new Date().toISOString()
    }, { onConflict: 'tenant_id,month,year' })

  return result
}
