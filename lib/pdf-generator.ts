import { jsPDF } from 'jspdf';
import { DeliveryRecord, PaymentRecord, formatCurrency } from './types';

export function generateDeliveryReportPdf(
  delivery: DeliveryRecord,
  businessName = 'GuestPilot AI Reseller Operations'
): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header Banner
  doc.setFillColor(12, 15, 20);
  doc.rect(0, 0, pageWidth, 105, 'F');

  doc.setTextColor(16, 185, 129); // Emerald accent
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(businessName.toUpperCase(), 40, 38);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text('Backlink Placement & Delivery Report', 40, 66);

  doc.setTextColor(161, 161, 170);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `Order Ref: ${delivery.orderNumber || delivery.orderId}   |   Generated: ${new Date().toISOString().slice(0, 10)}`,
    40,
    86
  );

  // Verification Status Badge Box
  let y = 135;
  doc.setFillColor(244, 244, 245);
  doc.setDrawColor(212, 212, 216);
  doc.roundedRect(40, y, pageWidth - 80, 62, 6, 6, 'FD');

  doc.setTextColor(63, 63, 70);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('VERIFICATION OUTCOME', 56, y + 22);

  if (delivery.verificationStatus === 'Verified') {
    doc.setTextColor(5, 150, 105);
  } else if (delivery.verificationStatus === 'Verification Inconclusive') {
    doc.setTextColor(217, 119, 6);
  } else {
    doc.setTextColor(220, 38, 38);
  }
  doc.setFontSize(15);
  doc.text(delivery.verificationStatus, 56, y + 44);

  doc.setTextColor(82, 82, 91);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `Verified At: ${delivery.verifiedAt || 'Not recorded'}   |   HTTP Status: ${
      delivery.httpStatus > 0 ? delivery.httpStatus : 'N/A'
    }`,
    260,
    y + 44
  );

  y += 90;

  const drawSectionRow = (label: string, value: string) => {
    doc.setDrawColor(228, 228, 231);
    doc.line(40, y + 24, pageWidth - 40, y + 24);

    doc.setTextColor(113, 113, 122);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(label, 40, y + 15);

    doc.setTextColor(24, 24, 27);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const wrapped = doc.splitTextToSize(value || '—', pageWidth - 220);
    doc.text(wrapped, 185, y + 15);
    const extraHeight = Math.max(0, (wrapped.length - 1) * 14);
    y += 32 + extraHeight;
  };

  drawSectionRow('Client Name', delivery.clientName);
  drawSectionRow('Client Email', delivery.clientEmail || '—');
  drawSectionRow('Publisher Website', delivery.publisherWebsite);
  drawSectionRow('Published Article URL', delivery.publishedArticleUrl);
  drawSectionRow('Target URL', delivery.targetUrl);
  drawSectionRow('Expected Anchor Text', delivery.anchorText || '—');
  drawSectionRow('Backlink Type', delivery.backlinkType || 'Unknown');
  drawSectionRow('Detected rel Attribute', delivery.relAttribute || 'none (dofollow)');
  drawSectionRow(
    'Technical Checks',
    `Page Accessible: ${delivery.pageAccessible ? 'Yes' : 'No'} | Target Link Present: ${
      delivery.targetLinkFound ? 'Yes' : 'No'
    } | Anchor Text Match: ${delivery.anchorMatched ? 'Yes' : 'No'}`
  );
  drawSectionRow('Order Date', delivery.orderDate || '—');
  drawSectionRow('Delivery Date', delivery.deliveryDate || '—');

  if (delivery.notes) {
    drawSectionRow('Delivery Notes', delivery.notes);
  }

  // Footer
  doc.setTextColor(161, 161, 170);
  doc.setFontSize(9);
  doc.text(
    `${businessName} — Verified Guest Post Delivery Report`,
    40,
    doc.internal.pageSize.getHeight() - 35
  );

  const safeFileName = `Delivery_Report_${(delivery.orderNumber || delivery.id).replace(
    /[^a-zA-Z0-9_-]/g,
    '_'
  )}.pdf`;
  doc.save(safeFileName);
}

export function generateFinancialDocumentPdf(
  payment: PaymentRecord,
  businessName = 'GuestPilot AI',
  currency = 'USD',
  paymentTerms = 'Due upon receipt',
  footerNotes = 'Thank you for your business.'
): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(12, 15, 20);
  doc.rect(0, 0, pageWidth, 105, 'F');

  doc.setTextColor(16, 185, 129);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(businessName.toUpperCase(), 40, 38);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text(payment.docType.toUpperCase(), 40, 66);

  doc.setTextColor(161, 161, 170);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `Reference #: ${payment.referenceNumber}   |   Status: ${payment.status}   |   Due Date: ${
      payment.dueDate || 'Upon approval'
    }`,
    40,
    86
  );

  let y = 140;
  doc.setTextColor(24, 24, 27);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Prepared For: ${payment.clientName}`, 40, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(82, 82, 91);
  doc.text(`Email: ${payment.clientEmail || '—'}`, 40, y + 18);
  doc.text(`Target Placement Domain: ${payment.websiteDomain || '—'}`, 40, y + 34);

  y += 70;
  doc.setFillColor(244, 244, 245);
  doc.rect(40, y, pageWidth - 80, 28, 'F');
  doc.setTextColor(39, 39, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Description', 52, y + 18);
  doc.text('Amount', pageWidth - 130, y + 18);

  y += 46;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(24, 24, 27);
  doc.text(
    `Editorial Guest Post Placement (${payment.websiteDomain || 'Selected Publisher'})`,
    52,
    y
  );
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(payment.sellingPrice, currency), pageWidth - 130, y);

  y += 24;
  doc.setDrawColor(228, 228, 231);
  doc.line(40, y, pageWidth - 40, y);

  y += 30;
  doc.setFontSize(13);
  doc.text('Total Amount:', pageWidth - 240, y);
  doc.setTextColor(5, 150, 105);
  doc.text(formatCurrency(payment.sellingPrice, currency), pageWidth - 130, y);

  y += 50;
  doc.setTextColor(82, 82, 91);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Payment Terms & Notes:', 40, y);
  doc.setFont('helvetica', 'normal');
  doc.text(paymentTerms, 40, y + 16);
  if (payment.notes) {
    const wrapped = doc.splitTextToSize(payment.notes, pageWidth - 80);
    doc.text(wrapped, 40, y + 34);
  }

  doc.setTextColor(161, 161, 170);
  doc.setFontSize(9);
  doc.text(footerNotes, 40, doc.internal.pageSize.getHeight() - 35);

  const safeFile = `${payment.docType}_${payment.referenceNumber.replace(
    /[^a-zA-Z0-9_-]/g,
    '_'
  )}.pdf`;
  doc.save(safeFile);
}
