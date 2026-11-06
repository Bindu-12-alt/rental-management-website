(() => {
  const agreements = new Map();

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[character]));
  }

  function replace(items) {
    agreements.clear();
    items.forEach((agreement) => agreements.set(String(agreement._id), agreement));
  }

  function open(agreementId) {
    const agreement = agreements.get(String(agreementId));
    if (!agreement) {
      alert('Agreement details are not available. Reload the page and try again.');
      return;
    }

    const documentWindow = window.open('', '_blank');
    if (!documentWindow) {
      alert('Allow pop-ups to print or save this agreement as a PDF.');
      return;
    }

    const tenantName = agreement.tenant?.fullName || 'Tenant';
    const apartmentNumber = agreement.apartment?.apartmentNumber || '—';
    const details = agreement.agreementDetails || 'No additional terms provided.';
    documentWindow.document.write(`<!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Rental Agreement ${escapeHtml(agreement.agreementId)}</title>
        <style>
          body { max-width: 760px; margin: 40px auto; padding: 0 24px; color: #2C1A0E; font: 16px/1.6 Arial, sans-serif; }
          h1, h2 { color: #4A2000; }
          h1 { text-align: center; border-bottom: 2px solid #7B3F00; padding-bottom: 16px; }
          dl { display: grid; grid-template-columns: 180px 1fr; gap: 8px 16px; }
          dt { font-weight: bold; }
          dd { margin: 0; }
          pre { white-space: pre-wrap; font: inherit; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 72px; }
          .signature { border-top: 1px solid #2C1A0E; padding-top: 8px; }
          .print { display: block; margin: 24px auto; padding: 10px 20px; }
          @media print { body { margin: 0 auto; } .print { display: none; } }
        </style>
      </head>
      <body>
        <button class="print" onclick="window.print()">Print / Save as PDF</button>
        <h1>Rental Agreement</h1>
        <dl>
          <dt>Agreement ID</dt><dd>${escapeHtml(agreement.agreementId)}</dd>
          <dt>Tenant</dt><dd>${escapeHtml(tenantName)}</dd>
          <dt>Apartment</dt><dd>${escapeHtml(apartmentNumber)}</dd>
          <dt>Start date</dt><dd>${escapeHtml(new Date(agreement.startDate).toLocaleDateString())}</dd>
          <dt>Expiry date</dt><dd>${escapeHtml(new Date(agreement.expiryDate).toLocaleDateString())}</dd>
          <dt>Monthly rent</dt><dd>${escapeHtml(agreement.monthlyRent)}</dd>
          <dt>Rental cycle</dt><dd>${escapeHtml(agreement.rentalCycle)}</dd>
          <dt>Status</dt><dd>${escapeHtml(agreement.status)}</dd>
        </dl>
        <h2>Agreement Details</h2>
        <pre>${escapeHtml(details)}</pre>
        <div class="signatures">
          <div class="signature">Tenant signature / date</div>
          <div class="signature">Property manager signature / date</div>
        </div>
      </body>
      </html>`);
    documentWindow.document.close();
    documentWindow.opener = null;
  }

  window.rentEaseAgreementDocuments = { replace, open };
})();
