frappe.ui.form.on('Item', {
    refresh: function(frm) {
        // Add a button to Item form
        frm.add_custom_button(__('Process with Sarvam AI'), function() {
            // Trigger a dialog to upload image or paste URL
            let d = new frappe.ui.Dialog({
                title: 'Upload Image for Sarvam AI OCR',
                fields: [
                    {
                        label: 'Image File',
                        fieldname: 'image_file',
                        fieldtype: 'Attach Image',
                        reqd: 1
                    }
                ],
                primary_action_label: 'Process Label',
                primary_action: function(values) {
                    frappe.call({
                        method: 'electrical_trader_pack.abhishek_electrical.api.process_item_label',
                        args: {
                            file_url: values.image_file,
                            item_code: frm.doc.name
                        },
                        freeze: true,
                        freeze_message: 'Processing label via Sarvam AI...',
                        callback: function(r) {
                            if (!r.exc && r.message) {
                                frappe.msgprint('MOCK: Sarvam AI Extracted Data: ' + r.message.extracted_tags.join(', '));
                                
                                // Auto check if brand/tech attr were found
                                if(r.message.brand || r.message.tech_attr){
                                    frappe.show_alert({message: "Attributes linked successfully!", indicator: 'green'});
                                    frm.reload_doc(); // reload so custom fields show updated values
                                } else {
                                    frappe.msgprint("No matching brands or attributes found in the text.");
                                }
                                
                                d.hide();
                            }
                        }
                    });
                }
            });
            d.show();
        }, __("Automation"));
    }
});
