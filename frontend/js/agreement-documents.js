(() => {
  const agreements = new Map();

  function replace(items) {
    agreements.clear();
    items.forEach((agreement) => agreements.set(String(agreement._id), agreement));
  }

  async function download(url, tokenKey, filename, failureMessage = 'Agreement download failed') {
    const token = localStorage.getItem(tokenKey);
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      let message = failureMessage;
      try { message = (await response.json()).error || message; } catch {}
      throw new Error(message);
    }

    const objectUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  window.rentEaseAgreementDocuments = {
    replace,
    get: (id) => agreements.get(String(id)),
    download,
  };
})();
