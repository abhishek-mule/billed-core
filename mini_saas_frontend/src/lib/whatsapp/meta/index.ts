export async function sendWhatsAppTemplate(options: { to: string; template: string; components: any[] } | any) {
  // Mock implementation
  const to = options.to || options.phone;
  const template = options.template;
  const components = options.components || [];
  
  console.log(`[WhatsApp] Sending template ${template} to ${to}`);
  return { success: true, messages: [{ id: 'mock-id' }] };
}
