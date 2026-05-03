import { renderToBuffer } from '@react-pdf/renderer';
import InvoiceDocument from './InvoiceDocument';
import React from 'react';

export async function generatePdf(invoice: any) {
  const stream = await renderToBuffer(<InvoiceDocument invoice={invoice} />);
  return stream;
}
