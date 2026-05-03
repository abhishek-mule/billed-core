import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 30 },
  header: { fontSize: 20, marginBottom: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }
});

export default function InvoiceDocument({ invoice }: { invoice: any }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>Invoice: {invoice.invoiceNumber}</Text>
        <View style={styles.row}>
          <Text>Customer: {invoice.customer?.customerName || 'N/A'}</Text>
        </View>
        <View style={styles.row}>
          <Text>Total: ₹{invoice.grandTotal}</Text>
        </View>
        {invoice.items?.map((item: any, index: number) => (
          <View key={index} style={styles.row}>
            <Text>{item.name} x {item.qty}</Text>
            <Text>₹{item.amount}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}
