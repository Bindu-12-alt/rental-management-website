const PDFDocument = require('pdfkit');

function display(value, fallback = 'Not provided') {
  return value === undefined || value === null || String(value).trim() === ''
    ? fallback
    : String(value);
}

function generateAgreementPdf(agreement, tenant, apartment) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 54, bufferPages: true });
    const chunks = [];
    pdf.on('data', (chunk) => chunks.push(chunk));
    pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(chunks)));

    const tenantInfo = agreement.tenantSnapshot || tenant || {};
    const apartmentInfo = agreement.apartmentSnapshot || apartment || {};
    const addField = (label, value) => {
      pdf.font('Helvetica-Bold').text(`${label}: `, { continued: true });
      pdf.font('Helvetica').text(display(value));
    };

    pdf.font('Helvetica-Bold').fontSize(20).fillColor('#4A2000')
      .text('RENTAL AGREEMENT', { align: 'center' });
    pdf.moveDown(0.5).font('Helvetica').fontSize(10).fillColor('#333333')
      .text(`Agreement ID: ${display(agreement.agreementId)}`, { align: 'center' });
    pdf.moveDown(1.5).font('Helvetica-Bold').fontSize(13).fillColor('#4A2000')
      .text('Parties and Property');
    pdf.moveDown(0.5).font('Helvetica').fontSize(10).fillColor('#222222');
    addField('Tenant', tenantInfo.fullName);
    addField('Tenant email', tenantInfo.email);
    addField('Tenant phone', tenantInfo.phone);
    addField('Tenant address', tenantInfo.address);
    addField('Tenant identification', tenantInfo.identification);
    addField('Apartment', apartmentInfo.apartmentNumber);
    addField('Building', apartmentInfo.buildingDetails);
    addField('Floor', apartmentInfo.floorDetails);
    addField('Apartment type', apartmentInfo.apartmentType);
    addField('Property address', apartmentInfo.address);
    addField('Locality / city', [apartmentInfo.locality, apartmentInfo.city].filter(Boolean).join(', '));
    addField('Postal code', apartmentInfo.pincode);

    pdf.moveDown().font('Helvetica-Bold').fontSize(13).fillColor('#4A2000')
      .text('Financial and Term Details');
    pdf.moveDown(0.5).font('Helvetica').fontSize(10).fillColor('#222222');
    addField('Monthly rent', `INR ${agreement.monthlyRent}`);
    addField('Maintenance charges', `INR ${agreement.maintenanceCharges || 0}`);
    addField('Security deposit', `INR ${agreement.securityDeposit || 0}`);
    addField('Rental cycle', agreement.rentalCycle);
    addField('Start date', new Date(agreement.startDate).toLocaleDateString());
    addField('End date', new Date(agreement.expiryDate).toLocaleDateString());
    addField('Status', agreement.status);

    const addSection = (title, text) => {
      pdf.moveDown().font('Helvetica-Bold').fontSize(13).fillColor('#4A2000').text(title);
      pdf.moveDown(0.4).font('Helvetica').fontSize(10).fillColor('#222222')
        .text(display(text, 'No terms provided.'), { lineGap: 3 });
    };

    addSection('Renewal Terms', agreement.renewalTerms);
    addSection('Legal Conditions', agreement.legalConditions);
    addSection('Additional Agreement Details', agreement.agreementDetails);

    pdf.moveDown(2);
    pdf.fontSize(10).fillColor('#222222')
      .text('Tenant signature: __________________________________    Date: ______________');
    pdf.moveDown(2)
      .text('Property manager signature: _________________________    Date: ______________');
    pdf.end();
  });
}

module.exports = { generateAgreementPdf };
