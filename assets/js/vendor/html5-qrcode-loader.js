(() => {
  if (window.Html5Qrcode) return;

  const script = document.createElement("script");
  script.src = "https://unpkg.com/html5-qrcode@2.3.10/html5-qrcode.min.js";
  script.async = true;
  script.onload = () => {
    if (!window.Html5Qrcode) {
      console.error("html5-qrcode loaded, but Html5Qrcode is missing.");
    }
  };
  script.onerror = () => {
    console.error("Failed to load html5-qrcode from CDN.");
  };

  document.head.appendChild(script);
})();
